/*
 * adapt-xapi
 * License - http://github.com/adaptlearning/adapt_framework/LICENSE
 * Maintainers  - Dennis Heaney <dennis@learningpool.com>
 *              - Barry McKay <barry@learningpool.com>
 *              - Andy Bell <andrewb@learningpool.com>
 *              - Ryan Lynch <ryanlynch@learningpool.com>
 */
define(function(require) {

  require('./xapiwrapper.min');

  var Adapt = require('coreJS/adapt');
  var Backbone = require('backbone');
  var _ = require('underscore');
  var xapi = require('./xapiwrapper.min');
  var AssessmentStatementModel = require('./models/assessment-statement');
  var ComponentStatementModel = require('./models/component-statement');
  var QuestionComponentStatementModel = require('./models/question-component-statement');
  var MCQComponentStatementModel = require('./models/mcq-component-statement');
  var TextInputComponentStatementModel = require('./models/textinput-component-statement');

  var xapiWrapper;
  var STATE_PROGRESS = 'adapt-course-progress';

  var xAPI = Backbone.Model.extend({

    defaults: {
      activityId: null,
      actor: null,
      initialised: false,
      state: null
    },

    initialize: function() {
      if (window.xapiWrapper) {
        xapiWrapper = window.xapiWrapper;
      } else {
        xapiWrapper = ADL.XAPIWrapper;
      }

      if (!Adapt.config.get("_xapi")) {
        return;
      }

      this.setConfig(Adapt.config.get("_xapi"));

      if (false === this.getConfig('_isEnabled')) {
        return;
      }

      this.set('actor', this.getLRSAttribute('actor'));

      this.set('activityId', (this.getConfig('_activityID')) ?
        this.getConfig('_activityID') : this.getLRSAttribute('activity_id'));
      this.set('registration', this.getLRSAttribute('registration'));

      if (!this.validateParams()) {
        return;
      }
      // We need to listen for stateLoad before we load state.
      this.listenTo(Adapt, "xapi:stateLoaded", this.restoreState);
      this.loadState();
      this.set('initialised', true);

      $(window).unload(_.bind(this.xapiEnd, this));
    },

    xapiEnd: function() {
      if (!this.validateParams()) {
        return;
      }

      this.sendStatement(
        (!this.checkTrackingCriteriaMet()) ?
            this.getStatement(ADL.verbs.suspended, this.getObjectForActivity()) :
            this.getStatement(ADL.verbs.terminated, this.getObjectForActivity())
      );
    },

    setupListeners: function() {
      this.listenTo(Adapt.components, "change:_isComplete", this.onComponentComplete);
      this.listenTo(Adapt, 'questionView:recordInteraction', this.onQuestionAttempt);
      this.listenTo(Adapt.blocks, "change:_isComplete", this.onBlockComplete);
      this.listenTo(Adapt.course, "change:_isComplete", this.onCourseComplete);
      this.listenTo(Adapt, "assessments:complete", this.onAssessmentComplete);
      this.listenTo(Adapt, "assessment:complete", this.onAllAssessmentsComplete);
      this.listenTo(Adapt, "xapi:stateChanged", this.onStateChanged);
    },

    onComponentComplete: function(component) {
      if (component.get('_recordInteraction') !== false) {
        return;
      }

      var statementModel = new ComponentStatementModel({
        activityId: this.get('activityId'),
        actor: this.get('actor'),
        registration: this.get('registration'),
        model: component
      });

      if (!statementModel) {
        return;
      }

      this.sendStatement(
        statementModel.getStatement()
      );
    },

    onQuestionAttempt: function(question) {
      if (!question.model.get('_recordInteraction')) {
        return;
      }

      var data = {
        activityId: this.get('activityId'),
        actor: this.get('actor'),
        registration: this.get('registration'),
        model: question.model
      };

      var statementModel;
      switch (question.model.get('_component')) {
        case "mcq":
          statementModel = new MCQComponentStatementModel(data);
          break;
        case "textinput":
          statementModel = new TextInputComponentStatementModel(data);
          break;
        default:
          statementModel = new QuestionComponentStatementModel(data);
          break;
      }

      if (!statementModel) {
        return;
      }

      this.sendStatement(
        statementModel.getStatement()
      );
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
          _isComplete: block.get('_isComplete')
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

    onAssessmentComplete: function(assessment) {
      var statementModel = new AssessmentStatementModel({
        activityId: this.get('activityId'),
        actor: this.get('actor'),
        model: assessment,
        registration: this.get('registration')
      });

      if (!statementModel) {
        return;
      }

      var statement = statementModel.getStatement();

      this.sendStatement(
        statement
      );
    },

    onAllAssessmentsComplete: function() {
      _.defer(_.bind(this.checkIfCourseIsReallyComplete, this));
    },

    onStateChanged: function() {
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

      if (tracking['_requireCourseCompleted'] && tracking._requireAssessmentPassed) {
        // user must complete all blocks AND pass the assessment
        criteriaMet = (Adapt.course.get('_isComplete') &&
        Adapt.course.get('_isAssessmentPassed'));
      } else if (tracking['_requireCourseCompleted']) {
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
        xapiWrapper.sendState(
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
     * @param {boolean} [async] - whether to load asynchronously, default is false
     * @fires xapi:loadStateFailed or xapi:stateLoaded
     */
    loadState: function(async) {
      var self = this;

      if (async) {
        xapiWrapper.getState(
          self.get('activityId'),
          self.get('actor'),
          STATE_PROGRESS,
          self.get('registration'),
          function success(result) {
            if ('undefined' === typeof result || 404 === result.status) {
              Adapt.trigger('xapi:loadStateFailed');
              return;
            }

            try {
              self.set('state', JSON.parse(result.response.toString));
              self.trigger('xapi:stateLoaded');
            } catch (ex) {
              Adapt.trigger('xapi:loadStateFailed');
            }
          }
        );
      } else {
        this.set(
            'state',
            xapiWrapper.getState(
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
     * Generate a statement object for the xAPI wrapper method @sendStatement
     * @param {object} verb
     * @param {object} object
     * @param {object} [result]
     * @param {object} [context]
     */
    getStatement: function(verb, object, result, context) {
      var statement = {};

      if (!verb) {
        return null;
      }

      statement.verb = verb;

      if (!this.get('actor')) {
        return null;
      }

      statement.actor = this.get('actor');

      if (
          !object || !object.id
      ) {
        return null;
      }

      statement.object = object;

      if (result) {
        statement.result = result;
      }

      if (context) {
        statement.context = context;
      }

      return statement;
    },

    /**
     * Set the extension config
     *
     * @param {object} conf - the data attribute to set
     */
    setConfig: function(conf) {
      this.data = conf;
    },

    /**
     * Retrieve a config item for the current course, e.g. '_activityID'
     *
     * @param {string} key - the data attribute to fetch
     * @return {object|boolean} the attribute value, or false if not found
     */
    getConfig: function(key) {
      if (!this.data || 'undefined' === this.data[key]) {
        return false;
      }

      return this.data[key];
    },

    /**
     * Retrieve an LRS attribute for the current session, e.g. 'actor'
     *
     * @param {string} key - the attribute to fetch
     * @return {object|null} the attribute value, or null if not found
     */
    getLRSAttribute: function(key) {
      if (!xapiWrapper || !xapiWrapper.lrs || undefined === xapiWrapper.lrs[key]) {
        return null;
      }

      try {
        if (key === 'actor') {
          return JSON.parse(xapiWrapper.lrs[key]);
        }

        return xapiWrapper.lrs[key];
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

    validateParams: function() {
      if (!this.get('actor') || typeof this.get('actor') != 'object' || !this.get('actor').objectType) {
        return false;
      }

      if (!this.get('activityId')) {
        return false;
      }

      return this.get('registration');
    },

    sendStatement: function(statement, callback) {
      if (!statement) {
        return;
      }

      xapiWrapper.sendStatement(statement, callback)
    },

    getObjectForActivity: function() {
      var object = {};

      var iri = this.get("activityId");
      if (!iri) {
        return null;
      }

      object.id = iri;
      object.objectType = "Activity";

      return object;
    }

  });

  Adapt.on('app:dataReady', function() {
    xAPI = new xAPI();
  });

  Adapt.on('adapt:initialize', function() {
    xAPI.setupListeners();
  });
});
