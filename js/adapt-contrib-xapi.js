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
  'libraries/xapiwrapper.min'
], function(Adapt) {

  'use strict';

  var STATE_PROGRESS = 'adapt-course-progress';

  var xAPI = Backbone.Model.extend({  
  
    // Default model properties.
    defaults: {
      lang: 'en-US',
      displayLang: 'en-US',
      generateIds: false,
      activityId: null,
      actor: null,
      state: null
    },

    // Default events to send statements for.
    coreEvents: {
      'router:page': true,
      'router:menu': true,
      'assessment:complete': true,
      'questionView:recordInteraction': true,
      'course': {
        _isComplete: true
      },
      'contentobjects': {
        _isComplete: true
      },
      'articles': {
        _isComplete: true
      },
      'blocks': {
        _isComplete: true
      },
      'components': {
        _isComplete: true
      },
    },

    initialize: function() {
      
      var config = Adapt.config.get('_xapi');

      if (!config || config._isEnabled !== true) {
        return;
      }

      try {
        Adapt.trigger('plugin:beginWait');

        // Initialise the xAPI wrapper
        this.xapiWrapper = window.xapiWrapper || ADL.XAPIWrapper;

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
          generateIds: this.getConfig('_generateIds')
        });

        if (!this.validateProps()) {
          // Required properties are missing, so exit.
          Adapt.trigger('plugin:endWait');
          return;
        }

        // // We need to listen for stateLoad before we load state.
        // this.listenTo(Adapt, "xapi:stateLoaded", this.restoreState);
        // // this.loadState();
 
        this.sendCourseStatement(ADL.verbs.initialized, _.bind(function() {
          this.sendCourseStatement(ADL.verbs.launched);
        }, this));
        
        this._onWindowOnload = _.bind(this.onWindowUnload, this);

        $(window).on('beforeunload unload', this._onWindowOnload);
      } catch (e) {
        Adapt.log.error(e);
      } finally {
        Adapt.trigger('plugin:endWait');
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

      // TODO: Define the events we care about.
      if (this.coreEvents['router:menu']) {
        this.listenTo(Adapt, 'router:menu', this.onItemExperience);
      } 

      if (this.coreEvents['router:page']) {
        this.listenTo(Adapt, 'router:page', this.onItemExperience);
      }
      
      if (this.coreEvents['questionView:recordInteraction']) {
        this.listenTo(Adapt, 'questionView:recordInteraction', this.onQuestionInteraction);
      }

      if (this.coreEvents['assessment:complete']) {
        // this.listenTo(Adapt, "assessments:complete", this.onAssessmentComplete);
        this.listenTo(Adapt, 'assessment:complete', this.onAssessmentComplete);
      }

      // Standard completion events for the various collection types, i.e.
      // course, contentobjects, articles, blocks and components.
      _.each(_.keys(this.coreEvents), function(key) {
        var val = this.coreEvents[key];

        if (typeof val === 'object' && val._isComplete === true) {
          this.listenTo(Adapt[key], 'change:_isComplete', this.onItemComplete);
        }
      }, this);

      this.listenTo(Adapt, "xapi:stateChanged", this.onStateChanged);
    },

    /**
     * Send an xAPI statement related to the Adapt.course object.
     * @param {string|object} verb - A valid ADL.verbs object or key
     * @param {function} callback - Optional callback function which will be passed to xapiWrapper.sendStatement().
     */
    sendCourseStatement: function(verb, callback) {
      var title = Adapt.course.get('displayTitle') || Adapt.course.get('title');
      var description = Adapt.course.get('description') || '';
      var object = new ADL.XAPIStatement.Activity(this.get('activityId'), title, description);
      var statement = this.getStatement(this.getVerb(verb), object);

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
     * 
     */
    onQuestionInteraction: function(view) {
      if (!view.model || view.model.get('_type') !== 'component' && !view.model.get('_isQuestionType')) {
        return;
      }
      
      var object = new ADL.XAPIStatement.Activity(this.getUniqueIri(view.model));
      var isComplete = view.model.get('_isComplete');
      var statement;

      object.definition = {
        name: this.getNameObject(view.model)
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
      var object = new ADL.XAPIStatement.Activity(this.getUniqueIri(model));
      var statement;

      object.definition = {
        name: this.getNameObject(model)
      };

      // Completed.
      var result = {completion: true};
      statement = this.getStatement(this.getVerb(ADL.verbs.completed), object, result);
    
      this.sendStatement(statement);
    },

    /**
     * Sends an xAPI statement when an assessment has been completed.
     */
    onAssessmentComplete: function(assessment) {
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

      // TODO - Get ID of assessment/ articleId?
      var fakeModel = new Backbone.Model({
        _id: '1',
        _type: 'assessment', 
      });

      var object = new ADL.XAPIStatement.Activity(this.getUniqueIri(fakeModel));
      var name = {};
      var statement;

      // Hard-coded for now.
      name[this.get('displayLang')] = 'Assessment'; 
            
      object.definition = {
        name: name
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

      this.sendStatement(statement);
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

    onBlockComplete: function(block) {
      var state = this.get('state') || {};

      if (!state.blocks) {
        state.blocks = [];
      }

      var blockStateRecorded = _.find(state.blocks, function findBlock(b) {
        return b._id == block.get('_id');
      });

      if (!blockStateRecorded) {
        state.blocks.push({
          _id: block.get('_id'),
          _trackingId: block.get('_trackingId'),
          _isComplete: block.get('_isComplete'),
        });

        this.set('state', state);

        Adapt.trigger('xapi:stateChanged');
      }
    },

    onCourseComplete: function() {
      if (Adapt.course.get('_isComplete') === true) {
        this.set('_attempts', this.get('_attempts') + 1);
      }

      _.defer(_.bind(this.checkIfCourseIsReallyComplete, this));
    },

    onAllAssessmentsComplete: function() {
      _.defer(_.bind(this.checkIfCourseIsReallyComplete, this));
    },

    onStateChanged: function(event) {
      this.saveState();
    },

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
    checkIfCourseIsReallyComplete: function() {
      if (this.checkTrackingCriteriaMet()) {
        this.sendStatement(this.getStatement(ADL.verbs.completed, this.getObjectForActivity()));
      }
    },

    /**
     * Send the current state of the course (completed blocks, duration, etc)
     * to the LRS
     */
    saveState: function() {
      if (this.get('state')) {
        this.xapiWrapper.sendState(
          this.get('activityId'),
          this.get('actor'),
          STATE_PROGRESS,
          this.get('registration'),
          this.get('state')
        );
      }
    },

    /**
     * Refresh course progress from loaded state
     *
     */
    restoreState: function() {
      var state = this.get('state');

      if (!state) {
        return;
      }

      state.blocks && _.each(state.blocks, function(block) {
        if (block._isComplete) {
          this.markBlockAsComplete(Adapt.blocks.findWhere({
            _trackingId: block._trackingId
          }));
        }
      }, this);
    },

    /**
     * Loads the last saved state of the course from the LRS, if a state exists
     *
     * @param {boolean} async - whether to load asynchronously, default is false
     * @fires xapi:loadStateFailed or xapi:stateLoaded
     */
    loadState: function(async) {
      if (async) {
        this.xapiWrapper.getState(
          this.get('activityId'),
          this.get('actor'),
          STATE_PROGRESS,
          this.get('registration'),
          function success(result) {
            if ('undefined' === typeof result || 404 === result.status) {
              Adapt.trigger('xapi:loadStateFailed');
              return;
            }

            try {
              this.set('state', JSON.parse(result.response));
              Adapt.trigger('xapi:stateLoaded');
            } catch (ex) {
              Adapt.trigger('xapi:loadStateFailed');
            }
          }
        );
      } else {
        this.set(
          'state',
          this.xapiWrapper.getState(
            this.get('activityId'),
            this.get('actor'),
            STATE_PROGRESS
          )
        );

        if (!this.get('state')) {
          Adapt.trigger('xapi:loadStateFailed');
        } else {
          Adapt.trigger('xapi:stateLoaded');
        }
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
      
      var statement = new ADL.XAPIStatement(this.get('actor'), verb, object);
      
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
          return JSON.parse(this.xapiWrapper.lrs[key]);
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
     * Checks that the required properties -- actor, activityId and registration -- are defined, and
     * logs a warning if any of them are not.
     * @return {boolean} true if the properties are valid, false otherwise.
     */
    validateProps: function() {
      var errorCount = 0;

      if (!this.get('actor') || typeof this.get('actor') != 'object') {
        Adapt.log.warn('"actor" attribute not found!');
        errorCount++;
      }

      if (!this.get('activityId')) {
        Adapt.log.warn('"activityId" attribute not found!');
        errorCount++;
      }

      if (!this.get('registration')) {
        Adapt.log.warn('"registration" attribute not found!');
        // errorCount++;
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

      this.xapiWrapper.sendStatement(statement, callback)
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
    },

    getObjectDefinition: function() {
      var definition = this.getLRSExtendedAttribute('definition') || {};

      if (!definition.name) {
        definition.name = {};
        definition.name[Adapt.config.get('_defaultLanguage')] = Adapt.course.get('title');
      }

      return definition;
    },

    getObjectForActivity: function() {
      var iri = this.get('activityId');
      
      if (!iri) {
        return null;
      }

      var object = {
        definition: this.getObjectDefinition(),
        id: iri,
        objectType: 'Activity'
      };

      return object;
    },
  });

  Adapt.once('app:dataReady', function() {
    xAPI = new xAPI();
    
    Adapt.on('app:languageChanged', _.bind(function(newLanguage) {
      // Update the language.      
      xAPI.set({ displayLang: newLanguage });

      // Send a statement to track the (new) course.
      this.sendCourseStatement(ADL.verbs.launched);
    }, this));
  });

  Adapt.on('adapt:initialize', function() {
    xAPI.setupListeners();
  });
});
