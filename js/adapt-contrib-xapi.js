/*
 * adapt-contrib-xapi
 * License - http://github.com/adaptlearning/adapt_framework/LICENSE
 * Maintainers  - Dennis Heaney <dennis@learningpool.com>
 *              - Barry McKay <barry@learningpool.com>
 *              - Andy Bell <andrewb@learningpool.com>
 *              - Brian Quinn <brian@learningpool.com>
 */
define([
  'core/js/adapt',
  'core/js/enums/completionStateEnum',
  'libraries/async.min',
  'libraries/xapiwrapper.min',
], function(Adapt, COMPLETION_STATE, Async) {

  'use strict';

  var xAPI = Backbone.Model.extend({

    /** Declare defaults and model properties */

    // Default model properties.
    defaults: {
      lang: 'en-US',
      displayLang: 'en-US',
      generateIds: false,
      activityId: null,
      actor: null,
      shouldTrackState: true,
      isInitialised: false,
      state: {}
    },

    startAttemptDuration: 0,
    startTimeStamp: null,
    courseName: '',
    courseDescription: '',
    defaultLang: 'en-US',
    isComplete: false,

    // Default events to send statements for.
    coreEvents: {
      Adapt: {
        'router:page': true,
        'router:menu': true,
        'assessments:complete': true,
        'questionView:recordInteraction': true
      },
      course: {
        'change:_isComplete': true
      },
      contentobjects: {
        'change:_isComplete': true
      },
      articles: {
        'change:_isComplete': true
      },
      blocks: {
        'change:_isComplete': true
      },
      components: {
        'change:_isComplete': true
      }
    },

    // An object describing the core Adapt framework collections.
    coreObjects: {
      course: 'course',
      contentObjects: ['menu', 'page'],
      articles: 'article',
      blocks: 'block',
      components: 'component'
    },

    /** Implementation starts here */

    initialize: function() {

      var config = Adapt.config.get('_xapi');

      if (!config || config._isEnabled !== true) {
        return;
      }

      try {
        Adapt.trigger('plugin:beginWait');

        // Initialise the xAPI wrapper
        this.xapiWrapper = window.xapiWrapper || ADL.XAPIWrapper;

        // Override the global error handler on the xapiWrapper.
        // This will prevent a stuck 'Loading...' screen when the LRS in inaccessible.
        // ADL.xhrRequestOnError = _.bind(function(xhr, method, url) {
        //   Adapt.log.error(xhr, method, url);
        //   this.onInitialised(false);
        // }, this);

        // Absorb the config object.
        this.setConfig(config);

        // Set any attributes on the xAPIWrapper.
        this.setWrapperConfig();

        // Setup: An _activityID in the config takes precidence over the LRS attribute.
        // Also get the LRS specific properties.
        this.set({
          activityId: (this.getConfig('_activityID') || this.getLRSAttribute('activity_id') || this.getBaseUrl()),
          registration: this.getLRSAttribute('registration'),
          actor: this.getLRSAttribute('actor'),
          displayLang: Adapt.config.get('_defaultLanguage'),
          lang: this.getConfig('_lang'),
          generateIds: this.getConfig('_generateIds'),
          shouldTrackState: this.getConfig('_shouldTrackState')
        });

        if (!this.validateProps()) {
          // Required properties are missing, so exit.
          this.onInitialised(false);
          return;
        }

        // Adapt.offlineStorage.get();

        // if (Adapt.offlineStorage.setReadyStatus) {
        //     Adapt.offlineStorage.setReadyStatus();
        // }

        this.startTimeStamp = new Date();
        this.courseName = Adapt.course.get('displayTitle') || Adapt.course.get('title');
        this.courseDescription = Adapt.course.get('description') || '';

        var statements = [];

        statements.push(this.getCourseStatement(ADL.verbs.launched));
        statements.push(this.getCourseStatement(ADL.verbs.initialized));

        this.sendStatements(statements);
 
        this._onWindowOnload = _.bind(this.onWindowUnload, this);

        $(window).on('beforeunload unload', this._onWindowOnload);

        if (this.get('shouldTrackState')) {

          this.getState(_.bind(function() {
            if (_.isEmpty(this.get('state'))) {
              // This is a new attempt.
              this.sendStatement(this.getCourseStatement(ADL.verbs.attempted));
            } else {
              // This is a continuation of an existing attempt.
              this.sendStatement(this.getCourseStatement(ADL.verbs.resumed));
            }

            this.restoreState();
            this.onInitialised(true);
          }, this));

        }
      } catch (e) {
        Adapt.log.error(e);
      } finally {
        if (!this.get('shouldTrackState')) {
          this.onInitialised(true);
        }
      }
    },

    /**
     * Triggers 'plugin:endWait' event (if required).
     */
    onInitialised: function(isInitialised) {
      if (!this.get('isInitialised')) {

        this.set({ isInitialised: isInitialised });

        Adapt.trigger('plugin:endWait');
      }
    },

    /**
     * Sends a 'terminated' statement to the LRS when the window is closed.
     */
    onWindowUnload: function() {
      $(window).off('beforeunload unload', this._onWindowOnload);

      var statements = [];

      if (!this.isComplete) {
        statements.push(this.getCourseStatement(ADL.verbs.suspended));
      }

      statements.push(this.getCourseStatement(ADL.verbs.terminated));

      this.sendStatements(statements);
    },

    /**
     * Attempt to extract endpoint, user and password from the config.json.
     */
    setWrapperConfig: function() {
      var keys = ['endpoint', 'user', 'password'];
      var newConfig = {};

      _.each(keys, function(key) {
        var val = this.getConfig('_' + key);

        if (val) {
          newConfig[key] = val;
        }
      }, this);

      if (!_.isEmpty(newConfig)) {
        this.xapiWrapper.changeConfig(newConfig);

        if (!this.xapiWrapper.testConfig()) {
          Adapt.log.warn('Incorrect xAPI configuration detected!');
        }
      }
    },

    /**
     * Gets the URL the course is currently running on.
     * @return {string} The URL to the current course.
     */
    getBaseUrl: function() {
      var url = window.location.origin + window.location.pathname;

      Adapt.log.info('Using detected URL (' + url + ') as ActivityID');

      return url;
    },

    getAttemptDuration: function() {
      return this.startAttemptDuration + this.getSessionDuration();
    },

    getSessionDuration: function() {
      return Math.abs ((new Date()) - this.startTimeStamp);
    },

    /**
      @method convertMillisecondsToISO8601Duration
      @static
      @param {Int} inputMilliseconds Duration in milliseconds
      @return {String} Duration in ISO8601 format
    */
    convertMillisecondsToISO8601Duration: function(inputMilliseconds) {
      var hours;
      var minutes;
      var seconds;
      var i_inputMilliseconds = parseInt(inputMilliseconds, 10);
      var i_inputCentiseconds;
      var inputIsNegative = '';
      var rtnStr = '';

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
    },

    setupListeners: function() {
      if (!this.get('isInitialised')) {
        Adapt.log.warn('Unable to setup listeners for xAPI');
        return;
      }

      if (this.get('shouldTrackState')) {
        this.listenTo(Adapt, 'state:change', this.sendState)
      }

      // Use the config to specify the core events.
      this.coreEvents = _.extend(this.coreEvents, this.getConfig('_coreEvents'));

      // Always listen out for course completion.
      this.listenTo(Adapt, 'tracking:complete', this.onTrackingComplete);

      // Conditionally listen to the events.
      if (this.coreEvents['Adapt']['router:menu']) {
        this.listenTo(Adapt, 'router:menu', this.onItemExperience);
      } 

      if (this.coreEvents['Adapt']['router:page']) {
        this.listenTo(Adapt, 'router:page', this.onItemExperience);
      }

      if (this.coreEvents['Adapt']['questionView:recordInteraction']) {
        this.listenTo(Adapt, 'questionView:recordInteraction', this.onQuestionInteraction);
      }

      if (this.coreEvents['Adapt']['assessments:complete']) {
        this.listenTo(Adapt, 'assessments:complete', this.onAssessmentComplete);
      }

      // Standard completion events for the various collection types, i.e.
      // course, contentobjects, articles, blocks and components.
      _.each(_.keys(this.coreEvents), function(key) {
        if (key !== 'Adapt') {
          var val = this.coreEvents[key];

          if (typeof val === 'object' && val['change:_isComplete'] === true) {
            this.listenTo(Adapt[key], 'change:_isComplete', this.onItemComplete);
          }
        }
      }, this);
    },

    /**
     * Creates an xAPI statement related to the Adapt.course object.
     * @param {object | string} verb - A valid ADL.verbs object or key.
     * @param {object} result - An optional result object.
     * @return A valid ADL statement object.
     */
    getCourseStatement: function(verb, result) {
      if (typeof result === 'undefined') {
        result = {};
      }

      var object = new ADL.XAPIStatement.Activity(this.get('activityId')); 
      var name = {};
      var description = {};

      name[this.get('displayLang')] = this.courseName;
      description[this.get('displayLang')] = this.courseDescription;

      object.definition = {
        type: ADL.activityTypes.course,
        name: name,
        description: description
      };

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
    },

    /**
     * Gets a name object from a given model.
     * @param {Backbone.Model} model - An instance of Adapt.Model (or Backbone.Model).
     * @return {object} An object containing a key-value pair with the language code and name.
     */
    getNameObject: function(model) {
      var name = {};

      name[this.get('displayLang')] = model.get('displayTitle') || model.get('title'); 

      return name;
    },

    /**
     * Gets the activity type for a given model.  
     * @param {Backbone.Model} model - An instance of Adapt.Model (or Backbone.Model).
     * @return {string} A URL to the current activity type.
     */
    getActivityType: function(model) {
      var type = '';

      switch (model.get('_type')) {
        case 'component': {
          type = model.get('_isQuestionType') ? ADL.activityTypes.interaction : ADL.activityTypes.media;
          break;
        }
        case 'block':
        case 'article':
        case 'contentobject': {
          type = ADL.activityTypes.interaction; //??
          break;
        }
        case 'course': {
          type = ADL.activityTypes.course;
          break;
        }
      }

      return type;
    },

    /**
     * Sends an 'answered' statement to the LRS.
     * @param {ComponentView} view - An instance of Adapt.ComponentView. 
     */
    onQuestionInteraction: function(view) {
      if (!view.model || view.model.get('_type') !== 'component' && !view.model.get('_isQuestionType')) {
        return;
      }

      var object = new ADL.XAPIStatement.Activity(this.getUniqueIri(view.model));
      var isComplete = view.model.get('_isComplete');
      var lang = this.get('displayLang');
      var statement;
      var description = {};

      description[this.get('displayLang')] = view.model.get('instruction');

      object.definition = {
        name: this.getNameObject(view.model),
        description: description, 
        type: ADL.activityTypes.interaction,
        interactionType: view.getResponseType()
      };

      if (typeof view.getInteractionObject === 'function') {
        // Get any extra interactions.
        _.extend(object.definition, view.getInteractionObject());

        // Ensure any 'description' properties are objects with the language map.
        _.each(_.keys(object.definition), function(key) {
          if (_.isArray(object.definition[key]) && object.definition[key].length !== 0) {
            for (var i = 0; i < object.definition[key].length; i++) {
              if (!object.definition[key][i].hasOwnProperty('description')) {
                break;
              }

              if (typeof object.definition[key][i].description === 'string') {
                var description = {};
                description[lang] = object.definition[key][i].description;

                object.definition[key][i].description = description;
              }
            }
          }
        });
      }

      var result = {
        score: {
          raw: view.model.get('_score') || 0
        },
        success: view.model.get('_isCorrect'),
        completion: isComplete,
        response: this.processInteractionResponse(object.definition.interactionType, view.getResponse())
      };

      // Answered
      statement = this.getStatement(this.getVerb(ADL.verbs.answered), object, result);

      this.sendStatement(statement);
    },

    /**
     * In order to support SCORM 1.2 and SCORM 2004, some of the components return a non-standard
     * response.
     * @param {string} responseType - The type of the response.
     * @param {string} response - The unprocessed response string.
     * @returns {string} A response formatted for xAPI compatibility.
     */
    processInteractionResponse: function(responseType, response) {
      switch (responseType) {
        case 'choice': {
          response = response.replace(/,|#/g, '[,]');

          break;
        }
        case 'matching': {
          response = response.replace(/#/g, "[,]");
          response = response.replace(/\./g, "[.]");

          break;
        }
      }

      return response;
    },

    /**
     * Sends an xAPI statement when an item has been experienced.
     * @param {AdaptModel} model - An instance of AdaptModel, i.e. ContentObjectModel, etc.
     */
    onItemExperience: function(model) {

      if (model.get('_id') === 'course') {
        // We don't really want to track actions on the home menu.
        return;
      }

      var object = new ADL.XAPIStatement.Activity(this.getUniqueIri(model));
      var statement;

      object.definition = {
        name: this.getNameObject(model)
      };

      // Experienced.
      statement = this.getStatement(this.getVerb(ADL.verbs.experienced), object);

      this.sendStatement(statement);
    },

    /**
     * Sends an xAPI statement when an item has been completed.
     * @param {AdaptModel} model - An instance of AdaptModel, i.e. ComponentModel, BlockModel, etc.
     */
    onItemComplete: function(model) {
      var result = { completion: true };

      // If this is a question component (interaction), do not record multiple statements.
      if (model.get('_type') === 'component' && model.get('_isQuestionType') === true 
        && this.coreEvents['Adapt']['questionView:recordInteraction'] === true
        && this.coreEvents['components']['change:_isComplete'] === true) {
          // Return because 'Answered' will already have been passed.
          return;
      }

      var object = new ADL.XAPIStatement.Activity(this.getUniqueIri(model));
      var statement;

      object.definition = {
        name: this.getNameObject(model),
        type: this.getActivityType(model)
      };

      // Completed.
      statement = this.getStatement(this.getVerb(ADL.verbs.completed), object, result);

      this.sendStatement(statement);
    },

    /**
     * Takes an assessment state and returns a results object based on it.
     * @param {object} assessment - An instance of the assessment state.
     * @return {object} - A result object containing score, success and completion properties.
     */
    getAssessmentResultObject: function(assessment) {
      var result = {
        score: {
          scaled: (assessment.scoreAsPercent / 100),
          raw: assessment.score,
          min: 0,
          max: assessment.maxScore
        },
        success: assessment.isPass,
        completion: assessment.isComplete
      };

      return result;
    },

    /**
     * Sends an xAPI statement when an assessment has been completed.
     * @param {object} assessment - Object representing the state of the assessment.
     */
    onAssessmentComplete: function(assessment) {
      var self = this;
      // Instantiate a Model so it can be used to obtain an IRI.
      var fakeModel = new Backbone.Model({
        _id: assessment.articleId || assessment.id,
        _type: assessment.type, 
        pageId: assessment.pageId
      });

      var object = new ADL.XAPIStatement.Activity(this.getUniqueIri(fakeModel));
      var name = {};
      var statement;

      name[this.get('displayLang')] = assessment.id || 'Assessment'; 

      object.definition = {
        name: name,
        type: ADL.activityTypes.assessment
      };

      var result = this.getAssessmentResultObject(assessment);

      if (assessment.isPass) {
        // Passed.
        statement = this.getStatement(this.getVerb(ADL.verbs.passed), object, result);
      } else {
        // Failed.
        statement = this.getStatement(this.getVerb(ADL.verbs.failed), object, result);
      }

      // Delay so that component completion can be recorded before assessment completion.
      _.delay(function() {
        self.sendStatement(statement);
      }, 500);
    },

    /**
     * Gets a valid 'verb' object in the ADL.verbs and returns the correct language version.
     * @param {object|stirng} verb - A valid ADL verb object or key, e.g. 'completed'.
     * @return {object} An ADL verb object with 'id' and language specific 'display' properties.
     */
    getVerb: function(verb) {
       if (typeof verb === 'string') {
        var key = verb.toLowerCase();
        verb = ADL.verbs[key];

        if (!verb) {
          Adapt.log.error('Verb "' + key + '" does not exist in ADL.verbs object');
        }
      }

      if (typeof verb !== 'object') {
        throw new Error('Unrecognised verb: ' + verb);
      }

      var lang = this.get('lang') || this.defaultLang;

      var singleLanguageVerb = {
        id: verb.id,
        display: {}
      };

      var description = verb.display[lang];

      if (description) {
        singleLanguageVerb.display[lang] = description;
      } else {
        // Fallback in case the verb translation doesn't exist.
        singleLanguageVerb.display[this.defaultLang] = verb.display[this.defaultLang];
      }

      return singleLanguageVerb;
    },

    /**
     * Gets a unique IRI for a given model.
     * @param {AdaptModel} model - An instance of an AdaptModel object.
     * @return {string} An IRI formulated specific to the passed model.
     */
    getUniqueIri: function(model) {
      var iri = this.get('activityId');
      var type = model.get('_type');

      if (type !== 'course') {
        if (type === 'article-assessment') {
          iri = iri + ['#', 'assessment', model.get('_id')].join('/');
        } else {
          iri = iri + ['#/id', model.get('_id')].join('/');
        }
      }

      return iri;
    },

    onTrackingComplete: function(completionData) {
      var self = this;
      var result = {};
      var completionVerb;

      switch (completionData.status) {
        case COMPLETION_STATE.PASS: {
          completionVerb = ADL.verbs.passed;
          break;
        }
          
        case COMPLETION_STATE.FAIL: {
          completionVerb = ADL.verbs.failed;
          break;
        }
          
        default: {
          completionVerb: ADL.verbs.completed;          
        }
      }

      if (completionVerb === ADL.verbs.completed) {
        result = { completion: true };
      } else {
        result = this.getAssessmentResultObject(completionData.assessment);
      }

      _.defer(function() {
        self.sendStatement(self.getCourseStatement(completionVerb, result));
      });
    },

    /**
     * Refresh course progress from loaded state.
     */
    restoreState: function() {
      var state = this.get('state');

      if (_.isEmpty(state)) {
        return;
      }

      var Adapt = require('core/js/adapt');

      if (state.components) {
        _.each(state.components, function(stateObject) {
          var restoreModel = Adapt.findById(stateObject._id);
          
          if (restoreModel) {
            restoreModel.setTrackableState(stateObject);  
          } else {
            Adapt.log.warn('adapt-contrib-xapi: Unable to restore state for component: ' + stateObject._id);
          }
        });
      }

      if (state.blocks) {
        _.each(state.blocks, function(stateObject) {
          var restoreModel = Adapt.findById(stateObject._id);

          if (restoreModel) {
            restoreModel.setTrackableState(stateObject);  
          } else {
            Adapt.log.warn('adapt-contrib-xapi: Unable to restore state for block: ' + stateObject._id);
          }
        });
      }
    },

    /**
     * Generate an XAPIstatement object for the xAPI wrapper sendStatement methods.
     * @param {object} verb - A valid ADL.verbs object.
     * @param {object} object - 
     * @param {object} [result] - optional
     * @param {object} [context] - optional
     * @return {ADL.XAPIStatement} A formatted xAPI statement object.
     */
    getStatement: function(verb, object, result, context) {
      var statement = new ADL.XAPIStatement(
        new ADL.XAPIStatement.Agent(this.get('actor')),
        verb,
        object
      );
      
      if (result && !_.isEmpty(result)) {
        statement.result = result;
      }

      if (context) {
        statement.context = context;
      }

      if (this.get('_generateIds')) {
        statement.generateId();
      }

      return statement;
    },

    /**
     * Set the extension configuration.
     * @param {object} conf - The _xAPI configuration attribute (from config.json).
     */
    setConfig: function(conf) {
      this.configData = conf;
    },

    /**
     * Sends the state to the or the given model to the configured LRS.
     * @param {AdaptModel} model - The AdaptModel whose state has changed.
     * @param {function|null} clalback - Optional callback function.
     */
    sendState: function(model, modelState, callback) {
      if (this.get('shouldTrackState') !== true) {
        return;
      }

      var activityId = this.get('activityId');
      var actor = this.get('actor');
      var type = model.get('_type');
      var state = this.get('state');
      var collectionName = _.findKey(this.coreObjects, function(o) {
        return o === type || o.indexOf(type) > -1
      });
      var stateCollection = state[collectionName] ? state[collectionName] : [];
      var newState;

      if (collectionName !== 'course') {
        var index = _.findIndex(stateCollection, { _id: model.get('_id') });
        
        if (index !== -1) {
          stateCollection.splice(index, 1, modelState);
        } else {
          stateCollection.push(modelState);
        }

        newState = stateCollection;
      } else {
        newState = modelState;
      }

      this.xapiWrapper.sendState(activityId, actor, collectionName, null, newState);
    },

    /**
     * Retrieves the state information for the current course.
     * @param {function|null} callback - Optional callback function.
     */
    getState: function(callback) {
      var self = this;
      var activityId = this.get('activityId');
      var actor = this.get('actor');
      var state = {};

      Async.each(_.keys(this.coreObjects), function(type, cb) {

        // var stateId = [activityId, type].join('/');

        self.xapiWrapper.getState(activityId, actor, type, null, null, function(xmlHttpRequest) {          
          _.defer(function() {
            switch (xmlHttpRequest.status) {
              case 200: {
                state[type] = JSON.parse(xmlHttpRequest.response);
                break;
              }
              case 404: {
                // State not found.
                Adapt.log.warn('Unable to getState() for stateId: ' + type);
                break;
              }
            }

            cb();
          });
        });
        
      }, function(e) {
        if (e) {
          Adapt.log.error(e);
        }

        if (!_.isEmpty(state)) {
          self.set({ state: state });
        }
        
        Adapt.trigger('xapi:stateLoaded');

        if (callback) {
          callback();
        }
      });
    },

    /**
     * Deletes all state information for the current course.
     * @param {function|null} callback - Optional callback function.
     */
    deleteState: function(callback) {
      var self = this;
      var activityId = this.get('activityId');
      var actor = this.get('actor');

      Async.each(_.keys(this.coreObjects), function(type, cb) {

        // var stateId = [activityId, type].join('/');

        self.xapiWrapper.deleteState(activityId, actor, type, null, null, null, function(xmlHttpRequest) {
          if (xmlHttpRequest.status === 204) {
            // State deleted.
            return cb();
          }

          cb(new Error('Unable to delete stateId: ' + type));
        });
      }, function(e) {
        if (e) {
          Adapt.log.error(e);
        } 
      });

      if (callback) {
        callback();
      }
    },

    /**
     * Retrieve a config item for the current course, e.g. '_activityID'.
     * @param {string} key - The data attribute to fetch.
     * @return {object|boolean} The attribute value, or false if not found.
     */
    getConfig: function(key) {
      if (!this.configData || key === '' || typeof this.configData[key] === 'undefined') {
        return false;
      }

      return this.configData[key];
    },

    /**
     * Retrieve an LRS attribute for the current session, e.g. 'actor'.
     * @param {string} key - The attribute to fetch.
     * @return {object|null} the attribute value, or null if not found.
     */
    getLRSAttribute: function(key) {
      if (!this.xapiWrapper || !this.xapiWrapper.lrs || undefined === this.xapiWrapper.lrs[key]) {
        return null;
      }

      try {
        if (key === 'actor') {
          var actor = JSON.parse(this.xapiWrapper.lrs[key]);

          if (_.isArray(actor.name)) {
            // Convert the name from an array to a string.
            actor.name = actor.name[0];
          }

          // If the account is an array, some work will be required.
          if (_.isArray(actor.account)) {
            var account = {};

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

        return this.xapiWrapper.lrs[key];
      } catch (e) {
        return null;
      }
    },
    
    getLRSExtendedAttribute: function(key) {
      var extended = this.getLRSAttribute('extended');
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
    },

    /**
     * Checks that the required properties -- actor and activityId -- are defined, and
     * logs a warning if any of them are not.
     * @return {boolean} true if the properties are valid, false otherwise.
     */
    validateProps: function() {
      var errorCount = 0;

      if (!this.get('actor') || typeof this.get('actor') !== 'object') {
        Adapt.log.warn('"actor" attribute not found!');
        errorCount++;
      }

      if (!this.get('activityId')) {
        Adapt.log.warn('"activityId" attribute not found!');
        errorCount++;
      }

      if (!this.get('registration')) {
        Adapt.log.warn('"registration" attribute not found!');
      }

      if (errorCount > 0) {
        return false;
      }

      return true;
    },

    /**
     * Sends a single xAPI statement to the LRS.
     * @param {ADL.XAPIStatement} statement - A valid ADL.XAPIStatement object.
     * @param {function} callback - Optional callback function.
     */
    sendStatement: function(statement, callback) {
      if (!statement) {
        return;
      }

      Adapt.trigger('xapi:preSendStatement', statement);

      this.xapiWrapper.sendStatement(statement, callback);
    },

    /**
     * Sends multiple xAPI statements to the LRS.
     * @param {ADL.XAPIStatement[]} statements - An array of valid ADL.XAPIStatement objects.
     * @param {function} callback - Optional callback function.
     */
    sendStatements: function(statements, callback) {
      if (!statements || statements.length === 0) {
        return;
      }

      Adapt.trigger('xapi:preSendStatements', statements);

      this.xapiWrapper.sendStatements(statements, callback);
    }
  });

  /** Adapt event listeners begin here */
  Adapt.once('app:dataReady', function() {
    xAPI = new xAPI();
    
    Adapt.on('app:languageChanged', _.bind(function(newLanguage) {
      // Update the language.      
      xAPI.set({ displayLang: newLanguage });

      // Since a language change counts as a new attempt, reset the state.
      xAPI.deleteState(function() {
        // Send a statement to track the (new) course.
        this.sendStatement(this.getCourseStatement(ADL.verbs.launched));
      });

    }, this));
  });

  Adapt.on('adapt:initialize', function() {
    xAPI.setupListeners();
  });
});
