import Adapt from 'core/js/adapt';
import logging from 'core/js/logging';

class CMI5 extends Backbone.Controller {
  initialize(xapi) {
    this.xapi = xapi;
  }

  /**
   * Configures the CMI5 launch by setting the launch parameters in the model,
   * Setting the authentication token, actor, registration and activityId, fetching the CMI5 launch data.
   * Fetches the agent profile data as per the cmi5 requirement.
   * @returns {Promise<void>} A promise that resolves when the configuration is complete.
   */
  async configureCmi5Launch() {
    // Set the launch parameters in the model
    this.getLaunchParameters();
    await this.setAuthToken();

    // check to see if configuration has been passed in URL
    this.xapi.xapiWrapper = window.xapiWrapper || window.ADL.XAPIWrapper;
    this.xapi.xapiWrapper.changeConfig({
      auth: `Basic ${this.xapi.get('_auth')}`,
      activity_id: this.xapi.get('_activityId'),
      endpoint: this.xapi.get('_endpoint'),
      strictCallbacks: true
    });
    this.xapi.set({
      actor: this.xapi.get('_actor'),
      registration: this.xapi.get('_registration'),
      activityId: this.xapi.get('_activityId')
    });
    const cmi5LaunchData = await this.getCmi5LaunchData();
    if (this.isMasteryScoreSet(cmi5LaunchData)) {
      this.respectLMSMasteryScore(cmi5LaunchData);
    }
    if (cmi5LaunchData?.returnURL) {
      this.listenTo(Adapt, 'adapt:userExit', () => this.exitCourse(cmi5LaunchData.returnURL));
    }

    // https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#110-xapi-agent-profile-data-model
    const agentProfile = await this.getAgentProfile();
    // Not currently using the agent profile data in the course
    // but it's a cmi5 requirement to fetch it before sending statements
    logging.info('Agent Profile: ', agentProfile);
  }

  /**
   * Retrieves launch parameters from the URL and sets them as properties of the XAPI object.
   */
  getLaunchParameters() {
    const params = new URLSearchParams(new URL(window.location).search);
    if (params.size === 0) return;
    this.xapi.set({
      _endpoint: params.get('endpoint') + '/',
      _fetch: params.get('fetch'),
      _activityId: params.get('activityId'),
      _actor: JSON.parse(decodeURIComponent(params.get('actor'))),
      _registration: params.get('registration')
    });
  }

  /** Retrieves an authentication token and sets it in the model */
  async setAuthToken() {
    const authToken = await this.getAuthToken();
    if (!authToken) return;
    // Set the auth token in the model
    this.xapi.set({
      _auth: authToken
    });
  }

  /**
   * Retrieves the authentication token from the server.
   * Note that it is recommended to use POST request to get the token
   * See: https://github.com/AICC/CMI-5_Spec_Current/blob/quartz/cmi5_spec.md#822-definition-auth-token
   *
   * @returns {Promise<string>} The authentication token.
   * @throws {Error} If there is an error fetching the authentication token.
   */
  async getAuthToken() {
    try {
      const fetchURL = this.xapi.get('_fetch');
      const requestOptions = {
        method: 'POST'
      };
      const response = await fetch(fetchURL, requestOptions);
      if (!response.ok) {
        throw new Error(response.error);
      }
      const authToken = await response.json();
      return authToken['auth-token'];
    } catch (error) {
      console.error('Error:', error);
      logging.error(
        'adapt-contrib-xapi: Failed to fetch authentication token',
        error
      );
      this.xapi.showError();
    }
  }

  /**
   * Retrieves the launch data from the LRS, if it is a CMI5 launch
   */
  async getCmi5LaunchData() {
    const activityId = this.xapi.get('activityId');
    const actor = this.xapi.get('actor');
    const registration = this.xapi.get('registration');
    let launchData = {};

    try {
      await new Promise((resolve, reject) => {
        this.xapi.xapiWrapper.getState(
          activityId,
          actor,
          'LMS.LaunchData',
          registration,
          null,
          (error, xhr) => {
            if (error) {
              logging.warn(
                `adapt-contrib-xapi: getState() failed for ${activityId} (LMS.LaunchData)`
              );
              return reject(new Error(error));
            }

            if (!xhr) {
              logging.warn(
                `adapt-contrib-xapi: getState() failed for ${activityId} (LMS.LaunchData)`
              );
              return reject(
                new Error("'xhr' parameter is missing from callback")
              );
            }

            if (xhr.status === 404) {
              return resolve();
            }

            if (xhr.status !== 200) {
              logging.warn(
                `adapt-contrib-xapi: getState() failed for ${activityId} (LMS.LaunchData)`
              );
              return reject(
                new Error(
                  `Invalid status code ${xhr.status} returned from getState() call`
                )
              );
            }

            // Check for empty response, otherwise the subsequent JSON.parse() will fail.
            if (xhr.response === '') {
              return resolve();
            }

            try {
              const response = JSON.parse(xhr.response);

              if (!_.isEmpty(response)) {
                launchData = response;
              }
            } catch (parseError) {
              return reject(parseError);
            }

            return resolve();
          }
        );
      });
    } catch (error) {
      logging.error('adapt-contrib-xapi:', error);
      throw error;
    }

    if (!_.isEmpty(launchData)) {
      this.xapi.set({ launchData });
    }

    return launchData;
  }

  /**
   * Checks if the mastery score is set in the cmi5 launch data.
   * @param {Object} cmi5LaunchData - The cmi5 launch data object.
   * @returns {boolean} - Returns true if the mastery score is set, otherwise false.
   */
  isMasteryScoreSet(cmi5LaunchData) {
    return (
      cmi5LaunchData &&
      cmi5LaunchData.masteryScore !== undefined &&
      cmi5LaunchData.masteryScore !== null &&
      cmi5LaunchData.masteryScore !== ''
    );
  }

  /**
   * Updates the assessment configuration to respect the LMS mastery score.
   * If there is only one assessment in the course, it also updates the assessment
   * configuration for that assessment.
   * @param {Object} cmi5LaunchData - The cmi5 launch data containing the mastery score.
   */
  respectLMSMasteryScore(cmi5LaunchData) {
    const assessmentConfig = Adapt.course.get('_assessment');
    if (!assessmentConfig) return;
    let assessmentCount = 0;
    let assessmentToModify = null;

    if (!assessmentConfig._isPercentageBased) return;
    const masterScorePercentage = cmi5LaunchData.masteryScore * 100;
    this.updateAssessmentConfig(assessmentConfig, masterScorePercentage);
    Adapt.course.set('_assessment', assessmentConfig);

    Adapt.articles?.models?.forEach((article) => {
      if (article.get('_assessment')?._isEnabled) {
        assessmentCount++;
        assessmentToModify = article;
      }
    });

    // If there is only one assessment in the course, update the assessment config
    if (assessmentCount === 1 && assessmentToModify) {
      const assessment = assessmentToModify.get('_assessment');
      if (assessment) {
        this.updateAssessmentConfig(assessment, masterScorePercentage);
      }
    }
    logging.debug('New assessment config: ', Adapt.course.get('_assessment'));
  }

  /**
   * Updates the assessment configuration with the given master score percentage.
   * @param {Object} assessment - The assessment object to update.
   * @param {number} masterScorePercentage - The master score percentage to set for the assessment.
   */
  updateAssessmentConfig(assessment, masterScorePercentage) {
    assessment._scoreToPass = masterScorePercentage;
    assessment._correctToPass = masterScorePercentage;
    assessment._passingScore = masterScorePercentage;
  }

  /**
   * Retrieves the agent profile from the LRS
   */
  async getAgentProfile() {
    const actor = this.xapi.get('actor');
    let agentProfile = {};

    try {
      await new Promise((resolve, reject) => {
        this.xapi.xapiWrapper.getAgentProfile(
          actor,
          'cmi5LearnerPreferences',
          null,
          (error, xhr) => {
            if (error) {
              logging.warn(
                'adapt-contrib-xapi: getAgentProfile() failed for cmi5LearnerPreferences'
              );
              return reject(new Error(error));
            }

            if (!xhr) {
              logging.warn(
                'adapt-contrib-xapi: getAgentProfile() failed for cmi5LearnerPreferences'
              );
              return reject(
                new Error("'xhr' parameter is missing from callback")
              );
            }

            if (xhr.status === 404) {
              return resolve();
            }

            if (xhr.status !== 200) {
              logging.warn(
                'adapt-contrib-xapi: getAgentProfile() failed for cmi5LearnerPreferences'
              );
              return reject(
                new Error(
                  `Invalid status code ${xhr.status} returned from getAgentProfile() call`
                )
              );
            }

            // Check for empty response, otherwise the subsequent JSON.parse() will fail.
            if (xhr.response === '') {
              return resolve();
            }

            try {
              const response = JSON.parse(xhr.response);
              agentProfile = response;
            } catch (parseError) {
              return reject(parseError);
            }

            return resolve();
          }
        );
      });
    } catch (error) {
      logging.error('adapt-contrib-xapi:', error);
      throw error;
    }

    if (!_.isEmpty(agentProfile)) {
      this.xapi.set({ agentProfile });
    }

    return agentProfile;
  }

  /**
   * Retrieves a defined xAPI statement based on the provided verb and result.
   *
   * @param {string} verb - The xAPI verb.
   * @param {object} [result] - The xAPI result object.
   * @returns {object} - The xAPI statement.
   */
  getCmi5DefinedStatement(verb, result) {
    if (typeof result === 'undefined') {
      result = {};
    }

    const object = this.xapi.getCourseActivity();
    const context = this.getCmi5Context(verb);

    // Append the duration.
    switch (verb) {
      case window.ADL.verbs.initialized:
        // Nothing extra needed
        break;
      case window.ADL.verbs.failed:
      case window.ADL.verbs.passed: {
        if (result.completion) {
          delete result.completion;
        }
        result.duration = this.xapi.convertMillisecondsToISO8601Duration(
          this.xapi.getAttemptDuration()
        );
        break;
      }
      case window.ADL.verbs.completed: {
        result.duration = this.xapi.convertMillisecondsToISO8601Duration(
          this.xapi.getAttemptDuration()
        );
        break;
      }
      case window.ADL.verbs.terminated: {
        result.duration = this.xapi.convertMillisecondsToISO8601Duration(
          this.xapi.getSessionDuration()
        );
        break;
      }
      default: {
        logging.warn(`Verb ${verb} not a valid cmi5 defined verb`);
        return;
      }
    }

    return this.xapi.getStatement(
      this.xapi.getVerb(verb),
      object,
      result,
      context
    );
  }

  /**
   * Retrieves the cmi5 context based on the provided verb.
   * @param {string} verb - The verb used to determine the cmi5 context.
   * @returns {Object} - The cmi5 context object.
   */
  getCmi5Context(verb) {
    const context = {
      contextActivities: {
        category: [
          {
            id: 'https://w3id.org/xapi/cmi5/context/categories/cmi5',
            objectType: 'Activity'
          }
        ]
      }
    };

    // Append the category and masteryScore.
    switch (verb) {
      case window.ADL.verbs.failed:
      case window.ADL.verbs.passed:
        this.addMoveOnCategory(context);
        this.addMasteryScoreExtension(context);
        break;

      case window.ADL.verbs.completed:
        this.addMoveOnCategory(context);
        break;
    }
    return context;
  }

  /**
   * Adds a moveon category to the context activities.
   * The new category has an id of 'https://w3id.org/xapi/cmi5/context/categories/moveon' and an objectType of 'Activity'.
   * @param {Object} context - The context object.
   */
  addMoveOnCategory(context) {
    const { moveOn } = this.xapi.get('launchData');
    if (!moveOn) return;

    context.contextActivities.category.push({
      id: 'https://w3id.org/xapi/cmi5/context/categories/moveon',
      objectType: 'Activity'
    });
  }

  /**
   * Adds the mastery score extension to the context object.
   * If the mastery score is set in the launch data, it will be added to the context.extensions property.
   * @param {object} context - The context object to which the mastery score extension will be added.
   */
  addMasteryScoreExtension(context) {
    if (!this.isMasteryScoreSet(this.xapi.get('launchData'))) return;
    const { masteryScore } = this.xapi.get('launchData');
    context.extensions
      ? context.extensions.push({
        'https://w3id.org/xapi/cmi5/context/extensions/masteryscore':
            masteryScore
      })
      : (context.extensions = {
        'https://w3id.org/xapi/cmi5/context/extensions/masteryscore':
            masteryScore
      });
  }

  /**
   * Merges the default contextActivities and extensions with the existing statement.context.
   *
   * @param {object} statement - The statement object to merge the default context with.
   */
  mergeDefaultContext(statement) {
    // Merge the default contextActivities and extensions with the existing statement.context
    const defaultContextTemplate = this.xapi.get('launchData')?.contextTemplate;
    if (!defaultContextTemplate) return;

    const { contextActivities, extensions } = defaultContextTemplate;
    const { context } = statement;

    statement.context = {
      ...(context || {}),
      contextActivities: {
        ...(context?.contextActivities || {}),
        parent: [
          ...(context?.contextActivities?.parent || []),
          ...(contextActivities?.parent || []).filter(Boolean)
        ],
        grouping: [
          ...(context?.contextActivities?.grouping || []),
          ...(contextActivities?.grouping || []).filter(Boolean)
        ]
      },
      extensions: {
        ...(context?.extensions || {}),
        ...(extensions || {})
      }
    };

    statement.timestamp = new Date().toISOString();
  }

  /**
   * Handles the tracking completion of CMI5.
   *
   * @param {string} completionVerb - The completion verb.
   * @param {any} result - The result of the completion.
   * @returns {Promise<void>} - A promise that resolves when the tracking completion is handled.
   */
  async handleCmi5TrackingCompletion(completionVerb, result) {
    // Handle the cmi5 defined statements for passed/failed/completed.
    await this.xapi.sendStatement(
      this.getCmi5DefinedStatement(completionVerb, result)
    );

    // Handle the cmi5 defined statements with the moveOn property.
    const { completed, failed, passed } = window.ADL.verbs;
    const launchDataMoveOn = this.xapi.get('launchData')?.moveOn;
    const completion = true;
    const conditions = {
      CompletedOrPassed: () => completionVerb === failed,
      Completed: () => completionVerb !== completed,
      CompletedAndPassed: () => completionVerb === passed
    };

    if (conditions[launchDataMoveOn]?.()) {
      await this.xapi.sendStatement(
        this.getCmi5DefinedStatement(completed, { completion })
      );
    }
  }

  /**
   * Exits the course and redirects to the specified URL.
   * @param {string} returnURL - The URL to redirect to after exiting the course.
   */
  exitCourse(returnURL) {
    if (!returnURL) return;

    window.location.href = returnURL;
  }
}

export default CMI5;
