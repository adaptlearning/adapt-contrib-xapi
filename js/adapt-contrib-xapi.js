/*
 * adapt-contrib-xapi
 * License      - http://github.com/adaptlearning/adapt_framework/LICENSE
 * Maintainers  - Dennis Heaney <dennis@learningpool.com>
 *              - Barry McKay <barry@learningpool.com>
 *              - Brian Quinn <brian@learningpool.com>
 */
import Adapt from 'core/js/adapt';
import COMPLETION_STATE from 'core/js/enums/completionStateEnum';
import Async from 'libraries/async.min';
import XAPIWrapper from 'libraries/xapiwrapper.min';
import urlPolyfill from 'libraries/url-polyfill.min';

'use strict';

/**
 * @callback ErrorOnlyCallback
 * @param {?Error} error
 */
class xAPI extends Backbone.Model {

  preinitialize() {
    // Declare defaults and model properties
    this.defaults = {
      lang: 'en-US',
      displayLang: 'en-US',
      generateIds: false,
      activityId: null,
      actor: null,
      shouldTrackState: true,
      shouldUseRegistration: false,
      componentBlacklist: 'blank,graphic',
      isInitialised: false,
      state: {}
    }

    this.xapiWrapper = XAPIWrapper;
    this.urlPolyfill = urlPolyfill;
    this.startAttemptDuration = 0;
    this.startTimeStamp = null;
    this.courseName = '';
    this.courseDescription = '';
    this.defaultLang = 'en-US';
    this.isComplete = false;

    // Default events to send statements for.
    this.coreEvents = {
      Adapt: {
        'router:page': false,
        'router:menu': false,
        'assessments:complete': true,
        'questionView:recordInteraction': true
      },
      contentObjects: {
        'change:_isComplete': false
      },
      articles: {
        'change:_isComplete': false
      },
      blocks: {
        'change:_isComplete': false
      },
      components: {
        'change:_isComplete': true
      }
    }

    // An object describing the core Adapt framework collections.
    this.coreObjects = {
      course: 'course',
      contentObjects: ['menu', 'page'],
      articles: 'article',
      blocks: 'block',
      components: 'component',
      offlineStorage: 'offlineStorage'
    }
  }

  /** Implementation starts here */
  initialize() {
    if (!this.getConfig('_isEnabled')) return this;

    Adapt.wait.begin();

    // Initialize the xAPIWrapper.
    this.initializeWrapper(error => {
      if (error) {
        this.onInitialised(error);
        return this;
      }

      this.set({
        activityId: (this.getLRSAttribute('activity_id') || this.getConfig('_activityID') || this.getBaseUrl()),
        displayLang: Adapt.config.get('_defaultLanguage'),
        lang: this.getConfig('_lang'),
        generateIds: this.getConfig('_generateIds'),
        shouldTrackState: this.getConfig('_shouldTrackState'),
        shouldUseRegistration: this.getConfig('_shouldUseRegistration') || false,
        componentBlacklist: this.getConfig('_componentBlacklist') || []
      });

      let componentBlacklist = this.get('componentBlacklist');

      if (!Array.isArray(componentBlacklist)) {
        // Create the blacklist array and force the items to lowercase.
        componentBlacklist = componentBlacklist.split(/,\s?/).map(component => {
          return component.toLowerCase();
        });
      }

      this.set('componentBlacklist', componentBlacklist);

      if (!this.validateProps()) {
        const error = new Error('Missing required properties');
        Adapt.log.error('adapt-contrib-xapi: xAPI Wrapper initialisation failed', error);
        this.onInitialised(error);
        return this;
      }

      this.startTimeStamp = new Date();
      this.courseName = Adapt.course.get('displayTitle') || Adapt.course.get('title');
      this.courseDescription = Adapt.course.get('description') || '';

      // Send the 'launched' and 'initialized' statements.
      const statements = [
        this.getCourseStatement(ADL.verbs.launched),
        this.getCourseStatement(ADL.verbs.initialized)
      ];

      this.sendStatements(statements, error => {
        if (error) {
          this.onInitialised(error);
          return this;
        }

        if (['ios', 'android'].indexOf(Adapt.device.OS) > -1) {
          $(document).on('visibilitychange', this.onVisibilityChange.bind(this));
        } else {
          $(window).on('beforeunload unload', this.sendUnloadStatements.bind(this));
        }

        if (!this.get('shouldTrackState')) {
          // xAPI is not managing the state.
          this.onInitialised();
          return this;
        }

        // Retrieve the course state.
        this.getState(error => {
          if (error) {
            this.onInitialised(error);
            return this;
          }

          if (this.get('state').length === 0) {
            // This is a new attempt, send 'attempted'.
            this.sendStatement(this.getCourseStatement(ADL.verbs.attempted));
          } else {
            // This is a continuation of an existing attempt, send 'resumed'.
            this.sendStatement(this.getCourseStatement(ADL.verbs.resumed));
          }

          this.restoreState();
          this.onInitialised();
          return this;
        });
      });
    });
  }

  /**
   * Replace the hard-coded _learnerInfo data in _globals with the actual data from the LRS.
   */
  getLearnerInfo() {
    const globals = Adapt.course.get('_globals');

    if (!globals._learnerInfo) {
      globals._learnerInfo = {};
    }

    _.extend(globals._learnerInfo, Adapt.offlineStorage.get('learnerinfo'));
  }

  /**
   * Intializes the ADL xapiWrapper code.
   * @param {ErrorOnlyCallback} callback
   */
  initializeWrapper(callback) {
    // If no endpoint has been configured, assume the ADL Launch method.
    if (!this.getConfig('_endpoint')) {
      //check to see if configuration has been passed in URL
      this.xapiWrapper = window.xapiWrapper || ADL.XAPIWrapper;
      if (this.checkWrapperConfig()) {
        // URL had all necessary configuration so we continue using it.
        // Set the LRS specific properties.
        this.set({
          registration: this.getLRSAttribute('registration'),
          actor: this.getLRSAttribute('actor')
        });

        this.xapiWrapper.strictCallbacks = true;

        callback();
        return;
      } 
      // If no endpoint is configured, assume this is using the ADL launch method.
      ADL.launch((error, launchData, xapiWrapper) => {
        if (error) {
          return callback(error);
        }

        // Initialise the xAPI wrapper.
        this.xapiWrapper = xapiWrapper;

        this.set({
          actor: launchData.actor
        });

        this.xapiWrapper.strictCallbacks = true;

        callback();
      }, true, true);
      return;
    }
    // The endpoint has been defined in the config, so use the static values.
    // Initialise the xAPI wrapper.
    this.xapiWrapper = window.xapiWrapper || ADL.XAPIWrapper;

    // Set any attributes on the xAPIWrapper.
    let configError;
    try {
      this.setWrapperConfig();
    } catch (error) {
      configError = error;
    }

    if (configError) {
      return callback(configError);
    }

    // Set the LRS specific properties.
    this.set({
      registration: this.getLRSAttribute('registration'),
      actor: this.getLRSAttribute('actor')
    });

    this.xapiWrapper.strictCallbacks = true;

    callback();
  }

  /**
   * Triggers 'plugin:endWait' event (if required).
   */
  onInitialised(error) {
    this.set({ isInitialised: !error });

    Adapt.wait.end();

    _.defer(() => {
      if (error) {
        Adapt.trigger('xapi:lrs:initialize:error', error);
        return;
      }

      Adapt.trigger('xapi:lrs:initialize:success');
    });
  }

  onLanguageChanged(newLanguage) {
    // Update the language.
    this.set({ displayLang: newLanguage });

    // Since a language change counts as a new attempt, reset the state.
    this.deleteState(() => {
      // Send a statement to track the (new) course.
      this.sendStatement(this.getCourseStatement(ADL.verbs.launched));
    });
  }

  /**
   * Sends 'suspended' and 'terminated' statements to the LRS when the window
   * is closed or the browser app is minimised on a device. Sends a 'resume'
   * statement when switching back to a suspended session.
   */
  onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      this.isTerminated = false;

      return this.sendStatement(this.getCourseStatement(ADL.verbs.resumed));
    }

    this.sendUnloadStatements();
  }

  // Sends (optional) 'suspended' and 'terminated' statements to the LRS.
  sendUnloadStatements() {
    if (this.isTerminated) return;

    const statements = [];

    if (!this.isComplete) {
      // If the course is still in progress, send the 'suspended' verb.
      statements.push(this.getCourseStatement(ADL.verbs.suspended));
    }

    // Always send the 'terminated' verb.
    statements.push(this.getCourseStatement(ADL.verbs.terminated));

    // Note: it is not possible to intercept these synchronous statements.
    this.sendStatementsSync(statements);

    this.isTerminated = true;
  }

  /**
  * Check Wrapper to see if all parameters needed are set.
  */
  checkWrapperConfig() {
    if (this.xapiWrapper.lrs.endpoint && this.xapiWrapper.lrs.actor
    && this.xapiWrapper.lrs.auth && this.xapiWrapper.lrs.activity_id ) {
      return true;
    }
    return false;
  }

  /**
   * Attempt to extract endpoint, user and password from the config.json.
   */
  setWrapperConfig() {
    const keys = ['endpoint', 'user', 'password'];
    const newConfig = {};

    keys.forEach(key => {
      const val = this.getConfig('_' + key);

      if (val) {
        // Note: xAPI wrapper requires a trailing slash and protocol to be present
        if (key === 'endpoint') {
          val = val.replace(/\/?$/, '/');

          if (!/^https?:\/\//i.test(val)) {
            Adapt.log.warn('adapt-contrib-xapi: "_endpoint" value is missing protocol (defaulting to http://)');

            val = 'http://' + val;
          }
        }

        newConfig[key] = val;
      }
    });

    if (!newConfig.length > 0) {
      this.xapiWrapper.changeConfig(newConfig);

      if (!this.xapiWrapper.testConfig()) {
        throw new Error('Incorrect xAPI configuration detected');
      }
    }
  }

  /**
   * Gets the URL the course is currently running on.
   * @return {string} The URL to the current course.
   */
  getBaseUrl() {
    const url = window.location.origin + window.location.pathname;

    Adapt.log.info(`adapt-contrib-xapi: Using detected URL (${url}) as ActivityID`);

    return url;
  }

  getAttemptDuration() {
    return this.startAttemptDuration + this.getSessionDuration();
  }
  
  getSessionDuration() {
    return Math.abs((new Date()) - this.startTimeStamp);
  }

  /**
   * Converts milliseconds to an ISO8601 duration
   * @param {int} inputMilliseconds - Duration in milliseconds
   * @return {string} - Duration in ISO8601 format
   */
  convertMillisecondsToISO8601Duration(inputMilliseconds) {
    let hours;
    let minutes;
    let seconds;
    const i_inputMilliseconds = parseInt(inputMilliseconds, 10);
    let i_inputCentiseconds;
    let inputIsNegative = '';
    let rtnStr = '';

    // Round to nearest 0.01 seconds.
    i_inputCentiseconds = Math.round(i_inputMilliseconds / 10);

    if (i_inputCentiseconds < 0) {
      inputIsNegative = '-';
      i_inputCentiseconds = i_inputCentiseconds * -1;
    }

    hours = parseInt(((i_inputCentiseconds) / 360000), 10);
    minutes = parseInt((((i_inputCentiseconds) % 360000) / 6000), 10);
    seconds = (((i_inputCentiseconds) % 360000) % 6000) / 100;

    rtnStr = inputIsNegative + 'PT';
    if (hours > 0) {
      rtnStr += hours + 'H';
    }

    if (minutes > 0) {
      rtnStr += minutes + 'M';
    }

    rtnStr += seconds + 'S';

    return rtnStr;
  }

  setupListeners() {
    if (!this.get('isInitialised')) {
      Adapt.log.warn('adapt-contrib-xapi: Unable to setup listeners for xAPI');
      return;
    }

    // Allow surfacing the learner's info in _globals.
    this.getLearnerInfo()

    this.listenTo(Adapt, 'app:languageChanged', this.onLanguageChanged);

    if (this.get('shouldTrackState')) {
      this.listenTo(Adapt, 'state:change', this.sendState);
    }

    // Use the config to specify the core events.
    this.coreEvents = _.extend(this.coreEvents, this.getConfig('_coreEvents'));

    // Always listen out for course completion.
    this.listenTo(Adapt, 'tracking:complete', this.onTrackingComplete);

    // Conditionally listen to the events.
    // Visits to the menu.
    if (this.coreEvents['Adapt']['router:menu']) {
      this.listenTo(Adapt, 'router:menu', this.onItemExperience);
    }

    // Visits to a page.
    if (this.coreEvents['Adapt']['router:page']) {
      this.listenTo(Adapt, 'router:page', this.onItemExperience);
    }

    // When an interaction takes place on a question.
    if (this.coreEvents['Adapt']['questionView:recordInteraction']) {
      this.listenTo(Adapt, 'questionView:recordInteraction', this.onQuestionInteraction);
    }

    // When an assessment is completed.
    if (this.coreEvents['Adapt']['assessments:complete']) {
      this.listenTo(Adapt, 'assessments:complete', this.onAssessmentComplete);
    }

    // Standard completion events for the various collection types, i.e.
    // course, contentobjects, articles, blocks and components.
    _.keys(this.coreEvents).forEach(key => {
      if (key !== 'Adapt') {
        const val = this.coreEvents[key];

        if (typeof val === 'object' && val['change:_isComplete'] === true) {
          this.listenTo(Adapt[key], 'change:_isComplete', this.onItemComplete);
        }
      }
    });
  }

  /**
   * Gets an xAPI Activity (with an 'id of the activityId) representing the course.
   * @returns {ADL.XAPIStatement.Activity} Activity representing the course.
   */
  getCourseActivity() {
    const object = new ADL.XAPIStatement.Activity(this.get('activityId'));
    const name = {};
    const description = {};

    name[this.get('displayLang')] = this.courseName;
    description[this.get('displayLang')] = this.courseDescription;

    object.definition = {
      type: ADL.activityTypes.course,
      name,
      description
    };

    return object;
  }

  /**
   * Creates an xAPI statement related to the Adapt.course object.
   * @param {object | string} verb - A valid ADL.verbs object or key.
   * @param {object} [result] - An optional result object.
   * @return A valid ADL statement object.
   */
  getCourseStatement(verb, result) {
    if (typeof result === 'undefined') {
      result = {};
    }

    const object = this.getCourseActivity()

    // Append the duration.
    switch (verb) {
      case ADL.verbs.launched:
      case ADL.verbs.initialized:
      case ADL.verbs.attempted: {
        result.duration = 'PT0S';
        break;
      }

      case ADL.verbs.failed:
      case ADL.verbs.passed:
      case ADL.verbs.suspended: {
        result.duration = this.convertMillisecondsToISO8601Duration(this.getAttemptDuration());
        break;
      }

      case ADL.verbs.terminated: {
        result.duration = this.convertMillisecondsToISO8601Duration(this.getSessionDuration());
        break;
      }
    }

    return this.getStatement(this.getVerb(verb), object, result);
  }

  /**
   * Gets a name object from a given model.
   * @param {Backbone.Model} model - An instance of Adapt.Model (or Backbone.Model).
   * @return {object} An object containing a key-value pair with the language code and name.
   */
  getNameObject(model) {
    const name = {};

    name[this.get('displayLang')] = model.get('displayTitle') || model.get('title');

    return name;
  }

  /**
   * Gets the activity type for a given model.
   * @param {Backbone.Model} model - An instance of Adapt.Model (or Backbone.Model).
   * @return {string} A URL to the current activity type.
   */
  getActivityType(model) {
    let type = '';

    switch (model.get('_type')) {
      case 'component': {
        type = model.get('_isQuestionType') ? ADL.activityTypes.interaction : ADL.activityTypes.media;
        break;
      }
      case 'block':
      case 'article': {
        type = ADL.activityTypes.interaction; //??
        break;
      }
      case 'course': {
        type = ADL.activityTypes.course;
        break;
      }
      case 'menu': {
        type = ADL.activityTypes.module;
        break;
      }
      case 'page': {
        type = ADL.activityTypes.lesson;
        break;
      }
    }

    return type;
  }

  /**
   * Sends an 'answered' statement to the LRS.
   * @param {ComponentView} view - An instance of Adapt.ComponentView.
   */
  onQuestionInteraction(view) {
    if (!view.model || view.model.get('_type') !== 'component'
      && !view.model.get('_isQuestionType')) return;

    // This component is on the blacklist, so do not send a statement.
    if (this.isComponentOnBlacklist(view.model.get('_component'))) return;

    const object = new ADL.XAPIStatement.Activity(this.getUniqueIri(view.model));
    const completion = view.model.get('_isComplete');
    const lang = this.get('displayLang');
    let statement;
    const description = {};

    description[this.get('displayLang')] = this.stripHtml(view.model.get('body'));

    object.definition = {
      name: this.getNameObject(view.model),
      description,
      type: ADL.activityTypes.question,
      interactionType: view.getResponseType()
    };

    if (typeof view.getInteractionObject === 'function') {
      // Get any extra interactions.
      _.extend(object.definition, view.getInteractionObject());

      // Ensure any 'description' properties are objects with the language map.
      _.keys(object.definition).forEach(key => {
        if (object.definition[key]?.length !== 0) {
          for (const i = 0; i < object.definition[key].length; i++) {
            if (!object.definition[key][i].hasOwnProperty('description')) {
              break;
            }

            if (typeof object.definition[key][i].description === 'string') {
              const description = {};
              description[lang] = object.definition[key][i].description;

              object.definition[key][i].description = description;
            }
          }
        }
      });
    }

    const result = {
      score: {
        raw: view.model.get('_score') || 0
      },
      success: view.model.get('_isCorrect'),
      completion,
      response: this.processInteractionResponse(object.definition.interactionType, view.getResponse())
    };

    // Answered
    statement = this.getStatement(this.getVerb(ADL.verbs.answered), object, result);

    this.addGroupingActivity(view.model, statement)
    this.sendStatement(statement);
  }

  /**
   * Removes the HTML tags/attributes and returns a string.
   * @param {string} html - A string containing HTML
   * @returns {string} The same string minus HTML
   */
  stripHtml(html) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    return tempDiv.textContent || tempDiv.innerText || '';
  }

  /**
   * In order to support SCORM 1.2 and SCORM 2004, some of the components return a non-standard
   * response.
   * @param {string} responseType - The type of the response.
   * @param {string} response - The unprocessed response string.
   * @returns {string} A response formatted for xAPI compatibility.
   */
  processInteractionResponse(responseType, response) {
    switch (responseType) {
      case 'choice': {
        response = response.replace(/,|#/g, '[,]');

        break;
      }
      case 'matching': {
        // Example: 1[.]1_1[,]2[.]2_5
        response = response
          .split('#')
          .map((val, i) => {
            return (i + 1) + '[.]' + val.replace('.', '_')
          })
          .join('[,]');
        break;
      }
    }

    return response;
  }

  /**
   * Sends an xAPI statement when an item has been experienced.
   * @param {AdaptModel} model - An instance of AdaptModel, i.e. ContentObjectModel, etc.
   */
  onItemExperience(model) {
    if (model.get('_id') === 'course') {
      // We don't really want to track actions on the home menu.
      return;
    }

    const object = new ADL.XAPIStatement.Activity(this.getUniqueIri(model));
    let statement;

    object.definition = {
      name: this.getNameObject(model),
      type: this.getActivityType(model)
    };

    // Experienced.
    statement = this.getStatement(this.getVerb(ADL.verbs.experienced), object);

    this.addGroupingActivity(model, statement)
    this.sendStatement(statement);
  }

  /**
   * Checks if a given component is blacklisted from sending statements.
   * @param {string} component - The name of the component.
   * @returns {boolean} true if the component exists on the blacklist.
   */
  isComponentOnBlacklist(component) {
    return this.get('componentBlacklist').indexOf(component) !== -1;
  }

  /**
   * Sends an xAPI statement when an item has been completed.
   * @param {AdaptModel} model - An instance of AdaptModel, i.e. ComponentModel, BlockModel, etc.
   * @param {boolean} isComplete - Flag to indicate if the model has been completed
   */
  onItemComplete(model, isComplete) {
    // The item is not actually completed, e.g. it may have been reset.
    if (isComplete === false) return;

    // If this is a question component (interaction), do not record multiple statements.
    // Return because 'Answered' will already have been passed.
    if (model.get('_type') === 'component' && model.get('_isQuestionType') === true
      && this.coreEvents['Adapt']['questionView:recordInteraction'] === true
      && this.coreEvents['components']['change:_isComplete'] === true) return;

    // This component is on the blacklist, so do not send a statement.
    if (model.get('_type') === 'component' && this.isComponentOnBlacklist(model.get('_component'))) return;

    const result = { completion: true };
    const object = new ADL.XAPIStatement.Activity(this.getUniqueIri(model));
    let statement;

    object.definition = {
      name: this.getNameObject(model),
      type: this.getActivityType(model)
    };

    // Completed.
    statement = this.getStatement(this.getVerb(ADL.verbs.completed), object, result);

    this.addGroupingActivity(model, statement)
    this.sendStatement(statement);
  }

  /**
   * Gets a lesson activity for a given page.
   * @param {string|Adapt.Model} page - Either an Adapt contentObject model of type 'page', or the _id of one.
   * @returns {XAPIStatement.Activity} Activity corresponding to the lesson.
   */
  getLessonActivity(page) {
    const pageModel = (typeof page === 'string')
      ? Adapt.findById(page)
      : page
    const activity = new ADL.XAPIStatement.Activity(this.getUniqueIri(pageModel))
    const name = this.getNameObject(pageModel)

    activity.definition = {
      name,
      type: ADL.activityTypes.lesson
    }

    return activity;
  }

  /**
   * Adds a 'grouping' and/or 'parent' value to a statement's contextActivities.
   * Note: the 'parent' is only added in the case of a question component which is part of
   * an assessment. All articles, blocks and components are grouped by page.
   * @param {Adapt.Model} model - Any Adapt model.
   * @param {ADL.XAPIStatement} statement - A valid xAPI statement object.
   */
  addGroupingActivity(model, statement) {
    const type = model.get('_type');

    if (type !== 'course') {
      // Add a grouping for the course.
      statement.addGroupingActivity(this.getCourseActivity())
    }

    if (['article', 'block', 'component'].indexOf(type) !== -1) {
      // Group these items by page/lesson.
      const pageModel = model.findAncestor('pages')

      statement.addGroupingActivity(this.getLessonActivity(pageModel));
    }

    if (type === 'component' && model.get('_isPartOfAssessment')) {
      // Get the article containing this question component.
      let articleModel = model.findAncestor('articles')

      if (articleModel?.has('_assessment')?._isEnabled) {
        // Set the assessment as the parent.
        const assessment = {
          id: articleModel.get('_assessment')._id,
          articleId: articleModel.get('_id'),
          type: 'article-assessment',
          pageId: articleModel.get('_parentId')
        }

        statement.addParentActivity(this.getAssessmentObject(assessment))
      }
    }
  }

  /**
   * Takes an assessment state and returns a results object based on it.
   * @param {object} assessment - An instance of the assessment state.
   * @return {object} - A result object containing score, success and completion properties.
   */
  getAssessmentResultObject(assessment) {
    return {
      score: {
        scaled: (assessment.scoreAsPercent / 100),
        raw: assessment.score,
        min: 0,
        max: assessment.maxScore
      },
      success: assessment.isPass,
      completion: assessment.isComplete
    };
  }

  /**
   * Gets an Activity for use in an xAPI statement.
   * @param {object} assessment - Object representing the assessment.
   * @returns {ADL.XAPIStatement.Activity} - Activity representing the assessment.
   */
  getAssessmentObject(assessment) {
    // Instantiate a Model so it can be used to obtain an IRI.
    const fakeModel = new Backbone.Model({
      _id: assessment.id || assessment.articleId,
      _type: assessment.type,
      pageId: assessment.pageId
    });

    const object = new ADL.XAPIStatement.Activity(this.getUniqueIri(fakeModel));
    const name = {};

    name[this.get('displayLang')] = assessment.id || 'Assessment';

    object.definition = {
      name: name,
      type: ADL.activityTypes.assessment
    };

    return object;
  }

  /**
   * Sends an xAPI statement when an assessment has been completed.
   * @param {object} assessment - Object representing the state of the assessment.
   */
  onAssessmentComplete(assessment) {
    const object = this.getAssessmentObject(assessment)
    const result = this.getAssessmentResultObject(assessment);
    let statement;

    if (assessment.isPass) {
      // Passed.
      statement = this.getStatement(this.getVerb(ADL.verbs.passed), object, result);
    } else {
      // Failed.
      statement = this.getStatement(this.getVerb(ADL.verbs.failed), object, result);
    }

    statement.addGroupingActivity(this.getCourseActivity())
    statement.addGroupingActivity(this.getLessonActivity(assessment.pageId))

    // Delay so that component completion can be recorded before assessment completion.
    _.delay(() => {
      this.sendStatement(statement);
    }, 500);
  }

  /**
   * Gets a valid 'verb' object in the ADL.verbs and returns the correct language version.
   * @param {object|stirng} verb - A valid ADL verb object or key, e.g. 'completed'.
   * @return {object} An ADL verb object with 'id' and language specific 'display' properties.
   */
  getVerb(verb) {
    if (typeof verb === 'string') {
      const key = verb.toLowerCase();
      verb = ADL.verbs[key];

      if (!verb) {
        Adapt.log.error(`adapt-contrib-xapi: Verb " ${key} " does not exist in ADL.verbs object`);
      }
    }

    if (typeof verb !== 'object') {
      throw new Error('Unrecognised verb: ' + verb);
    }

    const lang = this.get('lang') || this.defaultLang;

    const singleLanguageVerb = {
      id: verb.id,
      display: {}
    };

    const description = verb.display[lang];

    if (description) {
      singleLanguageVerb.display[lang] = description;
      return singleLanguageVerb;
    }
    // Fallback in case the verb translation doesn't exist.
    singleLanguageVerb.display[this.defaultLang] = verb.display[this.defaultLang];
    return singleLanguageVerb;
  }

  /**
   * Gets a unique IRI for a given model.
   * @param {AdaptModel} model - An instance of an AdaptModel object.
   * @return {string} An IRI formulated specific to the passed model.
   */
  getUniqueIri(model) {
    let iri = this.get('activityId');
    const type = model.get('_type');

    if (type !== 'course') {
      if (type === 'article-assessment') {
        iri = iri + ['#', 'assessment', model.get('_id')].join('/');
      } else {
        iri = iri + ['#/id', model.get('_id')].join('/');
      }
    }

    return iri;
  }

  /**
   * Handler for the Adapt Framework's 'tracking:complete' event.
   * @param {object} completionData
   */
  onTrackingComplete(completionData) {
    let result = {};
    let completionVerb;

    // Check the completion status.
    switch (completionData.status) {
      case COMPLETION_STATE.PASSED: {
        completionVerb = ADL.verbs.passed;
        break;
      }

      case COMPLETION_STATE.FAILED: {
        completionVerb = ADL.verbs.failed;
        break;
      }

      default: {
        completionVerb = ADL.verbs.completed;
      }
    }

    if (completionVerb === ADL.verbs.completed) {
      result = { completion: true };
    } else {
      // The assessment(s) play a part in completion, so use their result.
      result = this.getAssessmentResultObject(completionData.assessment);
    }

    // Store a reference that the course has actually been completed.
    this.isComplete = true;

    _.defer(() => {
      // Send the completion status.
      this.sendStatement(this.getCourseStatement(completionVerb, result));
    });
  }

  /**
   * Refresh course progress from loaded state.
   */
  restoreState() {
    const state = this.get('state');

    if (state.length === 0) return;

    const Adapt = require('core/js/adapt');

    if (state.components) {
      state.components.forEach(stateObject => {
        const restoreModel = Adapt.findById(stateObject._id);

        if (restoreModel) {
          restoreModel.setTrackableState(stateObject);
        } else {
          Adapt.log.warn('adapt-contrib-xapi: Unable to restore state for component: ' + stateObject._id);
        }
      });
    }

    if (state.blocks) {
      state.blocks.forEach(stateObject => {
        const restoreModel = Adapt.findById(stateObject._id);

        if (restoreModel) {
          restoreModel.setTrackableState(stateObject);
        } else {
          Adapt.log.warn('adapt-contrib-xapi: Unable to restore state for block: ' + stateObject._id);
        }
      });
    }
  }

  /**
   * Generate an XAPIstatement object for the xAPI wrapper sendStatement methods.
   * @param {object} verb - A valid ADL.verbs object.
   * @param {object} object -
   * @param {object} [result] - optional
   * @param {object} [context] - optional
   * @return {ADL.XAPIStatement} A formatted xAPI statement object.
   */
  getStatement(verb, object, result, context) {
    const statement = new ADL.XAPIStatement(
      new ADL.XAPIStatement.Agent(this.get('actor')),
      verb,
      object
    );

    if (result.length > 0) {
      statement.result = result;
    }

    if (context) {
      statement.context = context;
    }

    if (this.get('_generateIds')) {
      statement.generateId();
    }

    return statement;
  }

  /**
   * Sends the state to the or the given model to the configured LRS.
   * @param {AdaptModel} model - The AdaptModel whose state has changed.
   */
  sendState(model, modelState) {
    if (this.get('shouldTrackState') !== true) {
      return;
    }

    const activityId = this.get('activityId');
    const actor = this.get('actor');
    const type = model.get('_type');
    const state = this.get('state');
    const registration = this.get('shouldUseRegistration') === true 
      ? this.get('registration')
      : null;
    const collectionName = _.findKey(this.coreObjects, o => {
      return o === type || o.indexOf(type) > -1
    });
    const stateCollection = Array.isArray(state[collectionName]) ? state[collectionName] : [];
    let newState;

    if (collectionName !== 'course' && collectionName !== 'offlineStorage') {
      const index = _.findIndex(stateCollection, { _id: model.get('_id') });

      if (index !== -1) {
        stateCollection.splice(index, 1, modelState);
      } else {
        stateCollection.push(modelState);
      }

      newState = stateCollection;
    } else {
      newState = modelState;
    }

    // Update the locally held state.
    state[collectionName] = newState;
    this.set({
      state
    });

    // Pass the new state to the LRS.
    this.xapiWrapper.sendState(activityId, actor, collectionName, registration, newState, null, null, function(error, xhr) {
      if (error) {
        Adapt.trigger('xapi:lrs:sendState:error', error);
      }

      Adapt.trigger('xapi:lrs:sendState:success', newState);
    });
  }

  /**
   * Retrieves the state information for the current course.
   * @param {ErrorOnlyCallback} [callback]
   */
  getState(callback) {
    callback = _.isFunction(callback) ? callback : function() { };

    const activityId = this.get('activityId');
    const actor = this.get('actor');
    const registration = this.get('shouldUseRegistration') === true 
      ? this.get('registration')
      : null;
    const state = {};

    Async.each(_.keys(this.coreObjects), (type, nextType) => {
      this.xapiWrapper.getState(activityId, actor, type, registration, null, function(error, xhr) {
        _.defer(() => {
          if (error) {
            Adapt.log.warn('adapt-contrib-xapi: getState() failed for ' + activityId + ' (' + type + ')');
            return nextType(error);
          }

          if (!xhr) {
            Adapt.log.warn('adapt-contrib-xapi: getState() failed for ' + activityId + ' (' + type + ')');
            return nextType(new Error('\'xhr\' parameter is missing from callback'));
          }

          if (xhr.status === 404) {
            return nextType();
          }

          if (xhr.status !== 200) {
            Adapt.log.warn('adapt-contrib-xapi: getState() failed for ' + activityId + ' (' + type + ')');
            return nextType(new Error('Invalid status code ' + xhr.status + ' returned from getState() call'));
          }

          let response;
          let parseError;

          // Check for empty response, otherwise the subsequent JSON.parse() will fail.
          if (xhr.response === '') {
            return nextType();
          }

          try {
            response = JSON.parse(xhr.response);
          } catch (e) {
            parseError = e;
          }

          if (parseError) {
            return nextType(parseError);
          }

          if (!_.isEmpty(response)) {
            state[type] = response;
          }

          return nextType();
        });
      });
    }, error => {
      if (error) {
        Adapt.log.error('adapt-contrib-xapi:', error);
        return callback(error);
      }

      if (state.length > 0) {
        this.set({ state });
      }

      Adapt.trigger('xapi:stateLoaded');

      callback();
    });
  }

  /**
   * Deletes all state information for the current course.
   * @param {ErrorOnlyCallback} [callback]
   */
  deleteState(callback) {
    callback = _.isFunction(callback) ? callback : function() { };

    const activityId = this.get('activityId');
    const actor = this.get('actor');
    const registration = this.get('shouldUseRegistration') === true 
      ? this.get('registration')
      : null;

    Async.each(_.keys(this.coreObjects), (type, nextType) => {
      this.xapiWrapper.deleteState(activityId, actor, type, registration, null, null, function(error, xhr) {
        if (error) {
          Adapt.log.warn('adapt-contrib-xapi: deleteState() failed for ' + activityId + ' (' + type + ')');
          return nextType(error);
        }

        if (!xhr) {
          Adapt.log.warn('adapt-contrib-xapi: deleteState() failed for ' + activityId + ' (' + type + ')');
          return nextType(new Error('\'xhr\' parameter is missing from callback'));
        }

        if (xhr.status !== 204) {
          Adapt.log.warn('adapt-contrib-xapi: deleteState() failed for ' + activityId + ' (' + type + ')');
          return nextType(new Error('Invalid status code ' + xhr.status + ' returned from getState() call'));
        }

        return nextType();
      });
    }, error => {
      if (error) {
        Adapt.log.error('adapt-contrib-xapi:', error);
        return callback(error);
      }

      callback();
    });
  }

  /**
   * Retrieve a config item for the current course, e.g. '_activityID'.
   * @param {string} key - The data attribute to fetch.
   * @return {object|boolean} The attribute value, or false if not found.
   */
  getConfig(key) {
    const config = Adapt.config?.get('_xapi');
    if (!config || key === '' || typeof config[key] === 'undefined') {
      return false;
    }

    return config[key];
  }

  /**
   * Retrieve an LRS attribute for the current session, e.g. 'actor'.
   * @param {string} key - The attribute to fetch.
   * @return {object|null} the attribute value, or null if not found.
   */
  getLRSAttribute(key) {
    if (!this.xapiWrapper || !this.xapiWrapper.lrs || undefined === this.xapiWrapper.lrs[key]) {
      return null;
    }

    try {
      switch(key) {
        case 'actor': {
          const actor = JSON.parse(this.xapiWrapper.lrs[key]);

          if (Array.isArray(actor.name)) {
            // Convert the name from an array to a string.
            actor.name = actor.name[0];
          }

          if (Array.isArray(actor.mbox)) {
            // Convert mbox from an array to a string.
            actor.mbox = actor.mbox[0];
          }

          // If the account is an array, some work will be required.
          if (Array.isArray(actor.account)) {
            const account = {};

            // Convert 'accountServiceHomePage' to 'homePage'.
            if (typeof actor.account[0].accountServiceHomePage !== 'undefined') {
              account.homePage = actor.account[0].accountServiceHomePage;
            } else if (actor.account[0].homePage !== 'undefined') {
              account.homePage = actor.account[0].homePage;
            }

            // Convert 'accountName' to 'name'.
            if (typeof actor.account[0].accountName !== 'undefined') {
              account.name = actor.account[0].accountName;
            } else if (typeof actor.account[0].name !== 'undefined') {
              account.name = actor.account[0].name;
            }

            // Out with the old array.
            delete actor.account;

            // In with the new object.
            actor.account = account;
          }

          return actor;
        }
        default:
          return this.xapiWrapper.lrs[key];
      }
    } catch (e) {
      return null;
    }
  }

  getLRSExtendedAttribute(key) {
    const extended = this.getLRSAttribute('extended');
    if (extended == null) {
      return null;
    }

    try {
      if (key === 'definition') {
        return JSON.parse(extended.definition);
      }

      return extended[key];
    } catch (e) {
      return null;
    }
  }

  /**
   * Checks that the required properties -- actor and activityId -- are defined, and
   * logs a warning if any of them are not.
   * @return {boolean} true if the properties are valid, false otherwise.
   */
  validateProps() {
    let errorCount = 0;

    if (!this.get('actor') || typeof this.get('actor') !== 'object') {
      Adapt.log.warn('adapt-contrib-xapi: "actor" attribute not found!');
      errorCount++;
    }

    if (!this.get('activityId')) {
      Adapt.log.warn('adapt-contrib-xapi: "activityId" attribute not found!');
      errorCount++;
    }

    if (errorCount > 0) {
      return false;
    }

    return true;
  }

  /**
   * Prepares to send a single xAPI statement to the LRS.
   * @param {ADL.XAPIStatement} statement - A valid ADL.XAPIStatement object.
   * @param {ADLCallback} [callback]
   * @param {array} [attachments] - An array of attachments to pass to the LRS.
   */
  sendStatement(statement, callback, attachments) {
    callback = _.isFunction(callback) ? callback : function() { };

    if (!statement) {
      return;
    }

    Adapt.trigger('xapi:preSendStatement', statement);

    // Allow the trigger above to augment attachments if the attachments
    // parameter is not set.
    if (attachments === undefined && statement.attachments) {
      return this.processAttachments(statement, callback);
    } else {
      this.onStatementReady(statement, callback, attachments);
    }
  }

  /**
   * Sends statements using the Fetch API in order to make use of the keepalive
   * feature not available in AJAX requests. This makes the sending of suspended
   * and terminated statements more reliable.
   */
  sendStatementsSync(statements) {
    const lrs = ADL.XAPIWrapper.lrs;

    // Fetch not supported in IE and keepalive/custom headers
    // not supported for CORS preflight requests so attempt
    // to send the statement in the usual way
    if (!window.fetch || this.isCORS(lrs.endpoint)) {
      return this.sendStatements(statements);
    }

    let url = lrs.endpoint + 'statements';
    const credentials = ADL.XAPIWrapper.withCredentials ? 'include' : 'omit';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': lrs.auth,
      'X-Experience-API-Version': ADL.XAPIWrapper.xapiVersion
    };

    // Add extended LMS-specified values to the URL
    const extended = lrs.extended.map((value, key) => {
      return key + '=' + encodeURIComponent(value);
    });

    if (extended.length > 0) {
      url += (url.indexOf('?') > -1 ? '&' : '?') + extended.join('&');
    }

    fetch(url, {
      body: JSON.stringify(statements),
      cache: 'no-cache',
      credentials,
      headers,
      mode: 'same-origin',
      keepalive: true,
      method: 'POST'
    }).then(function() {
      Adapt.trigger('xapi:lrs:sendStatement:success', statements);
    }).catch(function(error) {
      Adapt.trigger('xapi:lrs:sendStatement:error', error);
    })
  }

  /**
   * Determine if sending the statement involves a Cross Origin Request
   * @param {string} url - the lrs endpoint
   * @returns {boolean}
   */
  isCORS(url) {
    const urlparts = url.toLowerCase().match(/^(.+):\/\/([^:\/]*):?(\d+)?(\/.*)?$/);
    let isCORS = (location.protocol.toLowerCase().replace(':', '') !== urlparts[1] || location.hostname.toLowerCase() !== urlparts[2]);
    if (!isCORS) {
      const urlPort = (urlparts[3] === null ? (urlparts[1] === 'http' ? '80' : '443') : urlparts[3]);
      isCORS = (urlPort === location.port);
    }

    return isCORS;
  }

  /**
   * Send an xAPI statement to the LRS once all async operations are complete
   * @param {ADL.XAPIStatement} statement - A valid ADL.XAPIStatement object.
   * @param {ADLCallback} [callback]
   * @param {array} [attachments] - An array of attachments to pass to the LRS.
   */
  onStatementReady(statement, callback, attachments) {
    this.xapiWrapper.sendStatement(statement, error => {
      if (error) {
        Adapt.trigger('xapi:lrs:sendStatement:error', error);
        return callback(error);
      }

      Adapt.trigger('xapi:lrs:sendStatement:success', statement);
      return callback();
    }, attachments);
  }

  /**
   * Process any attachments that have been added to the statement object by
   * intercepting the send operation at the xapi:preSendStatement trigger
   * If a url is specified for an attachment then retrieve the text content
   * and store this instead
   * @param {ADL.XAPIStatement} statement - A valid ADL.XAPIStatement object.
   * @param {ADLCallback} [callback]
   */
  processAttachments(statement, callback) {
    const attachments = statement.attachments;

    Async.each(attachments, (attachment, nextAttachment) => {

      // First check the attachment for a value
      if (attachment.value) {
        nextAttachment();
      } else if (attachment.url) {
        // If a url is specified then we need to obtain the string value
        // Use native xhr so we can set the responseType to 'blob'
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
          if (this.readyState === 4 && this.status === 200) {

            // Use FileReader to retrieve the blob contents as a string
            const reader = new FileReader();
            reader.onload = () => {

              // Store the string value in the attachment object and
              // delete the url property which is no longer needed
              attachment.value = reader.result;
              delete attachment.url;
              nextAttachment()
            };
            reader.readAsBinaryString(this.response);
          }
        };
        xhr.open('GET', attachment.url);
        xhr.responseType = 'blob';
        xhr.send();
      } else {
        Adapt.log.warn('Attachment object contained neither a value or url property.');
      }
    }, () => {
      delete statement.attachments;
      this.onStatementReady(statement, callback, attachments);
    });
  }

  /**
   * Sends multiple xAPI statements to the LRS.
   * @param {ADL.XAPIStatement[]} statements - An array of valid ADL.XAPIStatement objects.
   * @param {ErrorOnlyCallback} [callback]
   */
  sendStatements(statements, callback) {
    callback = _.isFunction(callback) ? callback : function() { };

    if (!statements || statements.length === 0) {
      return;
    }

    Adapt.trigger('xapi:preSendStatements', statements);

    // Rather than calling the wrapper's sendStatements() function, iterate
    // over each statement and call sendStatement().
    Async.each(statements, (statement, nextStatement) => {
      this.sendStatement(statement, nextStatement);
    }, (error) => {
      if (error) {
        Adapt.log.error('adapt-contrib-xapi:', error);
        return callback(error);
      }

      callback();
    });
  }

  getGlobals() {
    return _.defaults(
      (
        Adapt?.course?.get('_globals')?._extensions?._xapi
      ) || {},
      {
        'confirm': 'OK',
        'lrsConnectionErrorTitle': 'LRS not available',
        'lrsConnectionErrorMessage': 'We were unable to connect to your Learning Record Store (LRS). This means that your progress cannot be recorded.'
      }
    );
  }

  showError() {
    if (this.getConfig('_lrsFailureBehaviour') === 'ignore') return;

    const notifyObject = {
      title: this.getGlobals().lrsConnectionErrorTitle,
      body: this.getGlobals().lrsConnectionErrorMessage,
      confirmText: this.getGlobals().confirm
    };

    // Setup wait so that notify does not get dismissed when the page loads
    Adapt.wait.begin();
    Adapt.trigger('notify:alert', notifyObject);
    // Ensure notify appears on top of the loading screen
    $('.notify').css({ position: 'relative', zIndex: 5001 });
    Adapt.once('notify:closed', Adapt.wait.end);
  }
}

xAPI.getInstance = () => {
  if (!xAPI.instance) {
    xAPI.instance = new xAPI();
  }

  return xAPI.instance;
};

/** Adapt event listeners begin here */
Adapt.once('app:dataLoaded', () => {
  const xapi = xAPI.getInstance();

  xapi.initialize();

  Adapt.on('adapt:initialize', () => {
    xapi.setupListeners();
  });

  Adapt.on('xapi:lrs:initialize:error', error => {
    Adapt.log.error('adapt-contrib-xapi: xAPI Wrapper initialisation failed', error);
    xapi.showError();
  });

  Adapt.on('xapi:lrs:sendStatement:error', error => {
    xapi.showError();
  });

  Adapt.on('xapi:lrs:sendState:error', error => {
    xapi.showError();
  });
});

export default xAPI.getInstance();
