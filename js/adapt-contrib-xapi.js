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
  'libraries/async.min',
  'libraries/xapiwrapper.min',
], function(Adapt, Async) {

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
      isInitialzed: false,
      state: {}
    },

    // Default events to send statements for.
    coreEvents: {
      'Adapt': {
        'router:page': true,
        'router:menu': true,
        'assessment:complete': true,
        'assessments:complete': true,
        'questionView:recordInteraction': true
      },
      'course': {
        'change:_isComplete': true
      },
      'contentobjects': {
        'change:_isComplete': true
      },
      'articles': {
        'change:_isComplete': true
      },
      'blocks': {
        'change:_isComplete': true
      },
      'components': {
        'change:_isComplete': true
      }
    },

    // A constant for the xAPI activity types.
    activities: Object.freeze({
      assessment: 'http://adlnet.gov/expapi/activities/assessment',
      attempt: 'http://adlnet.gov/expapi/activities/attempt',
      course: 'http://adlnet.gov/expapi/activities/course',
      file: 'http://adlnet.gov/expapi/activities/file',
      interaction: 'http://adlnet.gov/expapi/activities/interaction',
      lesson: 'http://adlnet.gov/expapi/activities/lesson',
      link: 'http://adlnet.gov/expapi/activities/link',
      media: 'http://adlnet.gov/expapi/activities/media',
      meeting: 'http://adlnet.gov/expapi/activities/meeting',
      module: 'http://adlnet.gov/expapi/activities/module',
      objective: 'http://adlnet.gov/expapi/activities/objective',
      performance: 'http://adlnet.gov/expapi/activities/performance',
      profile: 'http://adlnet.gov/expapi/activities/profile',
      question: 'http://adlnet.gov/expapi/activities/question',
      simulation: 'http://adlnet.gov/expapi/activities/simulation'
    }),

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
        ADL.xhrRequestOnError = _.bind(function(xhr, method, url) {
          Adapt.log.error(xhr, method, url);
          this.onInitialized();
        }, this);

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
          this.onInitialized();
          return;
        }
        
        this.sendCourseStatement(ADL.verbs.launched, _.bind(function() {
          this.sendCourseStatement(ADL.verbs.initialized);
        }, this));
        
        this._onWindowOnload = _.bind(this.onWindowUnload, this);

        $(window).on('beforeunload unload', this._onWindowOnload);

        if (this.get('shouldTrackState')) {

          this.getState(_.bind(function() {
            this.restoreState();
            this.onInitialized();
          }, this));

        }
      } catch (e) {
        Adapt.log.error(e);
      } finally {
        if (!this.get('shouldTrackState')) {
          this.onInitialized();
        }
      }
    },

    onInitialized: function() {
      if (!this.get('isInitialized')) {
        
        Adapt.trigger('plugin:endWait');

        this.set({ isInitialised: true });
      }
    },

    onWindowUnload: function() {
      $(window).off('beforeunload unload', this._onWindowOnload);

      this.sendCourseStatement(ADL.verbs.terminated);
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

    // xapiEnd: function() {
    //   // if (!this.validateProps()) {
    //   //   return;
    //   // }

    //   this.sendCourseStatement(ADL.verbs.terminated);

    //   // this.sendStatement(
    //   //   (!this.checkTrackingCriteriaMet()) ?
    //   //     this.getStatement(ADL.verbs.suspended, this.getObjectForActivity()) :
    //   //     this.getStatement(ADL.verbs.terminated, this.getObjectForActivity())
    //   // );
    // },

    setupListeners: function() {

      // Use the config to specify the core events.
      this.coreEvents = _.extend(this.coreEvents, this.getConfig('_coreEvents'));

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

      if (this.coreEvents['Adapt']['assessment:complete']) {
        this.listenTo(Adapt, 'assessments:complete', this.onAllAssessmentsComplete);
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

      // this.listenTo(Adapt, "xapi:stateChanged", this.onStateChanged);
    },

    /**
     * Send an xAPI statement related to the Adapt.course object.
     * @param {string|object} verb - A valid ADL.verbs object or key.
     * @param {object} result - An optional result.
     * @param {function} callback - Optional callback function which will be passed to xapiWrapper.sendStatement().
     */
    sendCourseStatement: function(verb, result, callback) {
      // Parameter shuffling.
      if (typeof result === 'undefined') {
        result = {};
      } else if (typeof result === 'function') {
        callback = result;
        result = {};
      }

      var title = Adapt.course.get('displayTitle') || Adapt.course.get('title');
      var description = Adapt.course.get('description') || '';
      var object = new ADL.XAPIStatement.Activity(this.get('activityId'), title, description);
      
      object.definition = {
        type: this.activities.course
      };

      var statement = this.getStatement(this.getVerb(verb), object, result);

      this.sendStatement(statement, callback);
    },

    /**
     * Get the user's response to a given question component, e.g. the item which was selected.
     * @param {object} component - A Backbone Model representation of a component.
     * @return {string} The response to the question, or an empty string.
     */
    getQuestionComponentResponse: function(component) {
      if (_.isEmpty(component) || !component.get('_isQuestionType')) {
        return '';
      }

      // TODO: The response should be available as a function or single property on the component.
      // MCQ, GMCQ, Matching, TextInput, Slider
      var response = [];

      switch (component.get('_component')) {
        case 'matching': 
          response = component.get('_items').map(function(item) {
            return item._selected.text;
          });
          break;
        case 'textinput': 
          response = component.get('_items').map(function(item) {
            return item.userAnswer;
          });
          break;
        case 'mcq':
        case 'gmcq': 
          response = component.get('_selectedItems').map(function(item) {
            return item.text;
          });
          break;
        case 'slider': 
          response.push(component.get('_selectedItem').value.toString());
          break;
        default:
          response.push('');
      }
      
      return (response.length === 1) ? response[0] : response.join(',');
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
          if (model.get('_isQuestionType')) {
            type = this.activities.question;
          } else if (_.indexOf(['graphic', 'media', 'text'], model.get('_component')) > -1) {
            type = this.activities.media;
          } else {
            type = this.activities.interaction;
          }
          break;
        }
        case 'block':
        case 'article': {
          type = this.activities.interaction;
          break;
        }
        case 'contentobject': {
          type = this.activities.interaction;
          break;
        }
        case 'course': {
          type = this.activities.course;
          break;
        }
      }

      return type;
    },

    /**
     * Sends an 'answered' or 'attempted'.
     * @param {ComponentView} view - An instance of Adapt.ComponentView. 
     */
    onQuestionInteraction: function(view) {
      if (!view.model || view.model.get('_type') !== 'component' && !view.model.get('_isQuestionType')) {
        return;
      }
      
      var object = new ADL.XAPIStatement.Activity(this.getUniqueIri(view.model));
      var isComplete = view.model.get('_isComplete');
      var statement;

      object.definition = {
        name: this.getNameObject(view.model),
        type: this.activities.question
      };

      var result = {
        score: {
          raw: view.model.get('_score') || 0
        },
        success: view.model.get('_isCorrect'),
        completion: isComplete,
        response: this.getQuestionComponentResponse(view.model)
      };

      // TODO - Extend object.definition?
      if (isComplete) {
        // Answered
        statement = this.getStatement(this.getVerb(ADL.verbs.answered), object, result);
      } else {
        // Attempted
        statement = this.getStatement(this.getVerb(ADL.verbs.attempted), object, result);
      }
      
      this.sendStatement(statement);
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
      var result = {completion: true};

      if (model.get('_type') === 'course') {
        this.sendCourseStatement(ADL.verbs.completed, result, _.bind(function() {
          this.sendCompletionState(model);
        }, this));

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
    
      this.sendStatement(statement, _.bind(function() {
        this.sendCompletionState(model);
      }, this));
    },

    /**
     * Updates the state in the LRS.
     * @param {Adapt.Model} model - Instance of the model which was completed.
     */
    sendCompletionState: function(model) {
      if (this.get('shouldTrackState')) {
        this.sendState(model);
      }
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
        type: this.activities.assessment
      };

      var result = {
        score: {
          scaled: (assessment.score / assessment.maxScore),
          raw: assessment.score,
          min: 0,
          max: assessment.maxScore
        },
        success: assessment.isPass,
        completion: assessment.isComplete
      };

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
        throw new Error('Unrecognised verb');
      }

      var defaultLang = 'en-US';
      var lang = this.get('lang') || defaultLang;

      var singleLanguageVerb = {
        id: verb.id,
        display: {}
      };

      var description = verb.display[lang];
      
      if (description) {
        singleLanguageVerb.display[lang] = description;
      } else {
        singleLanguageVerb.display[defaultLang] = verb.display[defaultLang];
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

      if (model && model.get('_type') != 'course') {
        iri = iri + ['#id', model.get('_type'), model.get('_id')].join('/');
      } 

      return iri; 
    },

    onCourseComplete: function() {
      if (Adapt.course.get('_isComplete') === true) {
        this.set('_attempts', this.get('_attempts') + 1);
      }

      _.defer(_.bind(this.checkIfCourseIsReallyComplete, this));
    },

    onAllAssessmentsComplete: function() {
      /**
       * assessments
       * assessmentsComplete
       * isComplete
       * isPass
       * isPercentageBased
       * maxScore
       * score
       * scoreAsPercent
       */
      _.defer(_.bind(this.checkIfCourseIsReallyComplete, this));
    },

    // onStateChanged: function(event) {
    //   this.saveState();
    // },

    /**
     * Check if course tracking criteria have been met
     * @return {boolean} - true, if criteria have been met; otherwise false
     */
    checkTrackingCriteriaMet: function() {
      var criteriaMet = false;
      var tracking = this.getConfig('_tracking');

      if (!tracking) {
        return criteriaMet;
      }

      if (tracking._requireCourseCompleted && tracking._requireAssessmentPassed) {
        // user must complete all blocks AND pass the assessment
        criteriaMet = (Adapt.course.get('_isComplete') &&
        Adapt.course.get('_isAssessmentPassed'));
      } else if (tracking._requireCourseCompleted) {
        // user only needs to complete all blocks
        criteriaMet = Adapt.course.get('_isComplete');
      } else if (tracking._requireAssessmentPassed) {
        // user only needs to pass the assessment
        criteriaMet = Adapt.course.get('_isAssessmentPassed');
      }

      return criteriaMet;
    },

    /**
     * Check if course tracking criteria have been met, and send an xAPI
     * statement if appropriate
     */
    // checkIfCourseIsReallyComplete: function() {
    //   if (this.checkTrackingCriteriaMet()) {
    //     this.sendStatement(this.getStatement(ADL.verbs.completed, this.getObjectForActivity()));
    //   }
    // },

    /**
     * Refresh course progress from loaded state.
     */
    restoreState: function() {
      var state = this.get('state');

      if (!state) {
        return;
      }

      var Adapt = require('core/js/adapt');

      if (state.components) {
        _.each(state.components, function(component) {
            if (component._isComplete) {
              Adapt.components.findWhere({_id: component._id}).set({_isComplete: true});
            }
        });
      }

      if (state.blocks) {
        _.each(state.blocks, function(block) {
          if (block._isComplete) {
            Adapt.blocks.findWhere({_id: block._id}).set({_isComplete: true});
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
      
      if (result) {
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
    sendState: function(model, callback) {
      var activityId = this.get('activityId');
      var actor = this.get('actor');
      var type = model.get('_type');
      var state;

      var collectionName = _.findKey(this.coreObjects, function(o) {
        return o === type || o.indexOf(type) > -1
      });

      var stateId = [activityId, collectionName].join('/');

      if (collectionName !== 'course') {
        // The collection contains an array of models.
        state = require('core/js/adapt')[collectionName].models.map(function(item) {
          var returnObject = {
            _id: item.get('_id'),
            _isComplete: item.get('_isComplete')            
          }

          if (collectionName === 'block' && item._trackingId) {
            returnObject._trackingId = item._trackingId;
          }

          return returnObject;
        });
      } else {
        state = {
          _isComplete: model.get('_isComplete')
        }
      }

      if (this.get('shouldTrackState')) {
        this.xapiWrapper.sendState(activityId, actor, stateId, null, state);
      }
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

        var stateId = [activityId, type].join('/');

        self.xapiWrapper.getState(activityId, actor, stateId, null, null, function(xmlHttpRequest) {          
          _.defer(function() {
            switch (xmlHttpRequest.status) {
              case 200: {
                state[type] = JSON.parse(xmlHttpRequest.response);
                break;
              }
              case 404: {
                // State not found.
                Adapt.log.warn('Unable to getState() for stateId: ' + stateId);
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
          self.set({state: state});
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

        var stateId = [activityId, type].join('/');

        self.xapiWrapper.deleteState(activityId, actor, stateId, null, null, null, function(xmlHttpRequest) {
          if (xmlHttpRequest.status === 204) {
            // State deleted.
            return cb();
          }

          cb(new Error('Unable to delete stateId: ' + stateId));
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

    markBlockAsComplete: function(block) {
      if (!block || block.get('_isComplete')) {
        return;
      }

      block.getChildren().each(function(child) {
        child.set('_isComplete', true);
      }, this);
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
        this.sendCourseStatement(ADL.verbs.launched);
      });

    }, this));
  });

  Adapt.on('adapt:initialize', function() {
    xAPI.setupListeners();
  });
});
