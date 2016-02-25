/*
 * adapt-xapi
 * License - http://github.com/adaptlearning/adapt_framework/LICENSE
 * Maintainers  - Dennis Heaney <dennis@learningpool.com>
 *              - Barry McKay <barry@learningpool.com>
 *              - Andy Bell <andrewb@learningpool.com>
 */
define(function(require) {

  var Adapt = require('coreJS/adapt');
  var Backbone = require('backbone');
  var _ = require('underscore');
  var xapi = require('./xapiwrapper.min');
  var AssessmentStatementModel = require('./models/assessment-statement');

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
        console.log("No configuration found for xAPI in config.json");
        return;
      }

      this.setConfig(Adapt.config.get("_xapi"));

      if (false === this.getConfig('_isEnabled')) {
        return;
      }

      this.set('actor', this.getLRSAttribute('actor'));

      this.set('activityId', this.getConfig('_activityID') ? this.getConfig('_activityID') : this.getLRSAttribute('activity_id'));

      if (!this.validateParams()) {
        return;
      }

      this.xapiStart();

      $(window).unload(_.bind(this.xapiEnd, this));
    },

    xapiStart: function() {
      this.setupListeners();
      this.loadState();
      this.set('initialised', true);
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
      this.listenTo(Adapt.blocks, "change:_isComplete", this.onBlockComplete);
      this.listenTo(Adapt.course, "change:_isComplete", this.onCourseComplete);
      this.listenTo(Adapt, "assessments:complete", this.onAssessmentComplete);
      this.listenTo(Adapt, "xapi:stateChanged", this.onStateChanged);
      this.listenTo(Adapt, "xapi:stateLoaded", this.restoreState);
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

      _.defer(_.bind(this.updateTrackingStatus, this));
    },

    onAssessmentComplete: function(assessment) {
      var statement = new AssessmentStatementModel({
        activityId : this.get('activityId'),
        actor : this.get('actor'),
        assessmentState : assessment
      }).getStatementObject();

      if (!statement) {
        return;
      }

      this.sendStatement(
        statement
      );

      Adapt.course.set('_isAssessmentPassed', assessment.isPass);
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
    updateTrackingStatus: function() {
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
          null,
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
        xapiWrapper.getState(
          this.get('activityId'),
          this.get('actor'),
          STATE_PROGRESS,
          null,
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
     *
     * @param {string} verb
     * @param {object} [object]
     * @param {object} [result] - optional
     * @param {object} [context] - optional
     *
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
     * @param {object} key - the data attribute to fetch
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

      return null;
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
      if (
        !this.get('actor') ||
        typeof this.get('actor') != 'object' ||
        !this.get('actor').objectType
      ) {
        console.log('\'actor\' is invalid');
        return false;
      }

      if (!this.get('activityId')) {
        console.log('\'activity_id\' is invalid');
        return false;
      }

      return true;
    },

    sendStatement: function(statement, callback) {
      if (!statement) {
        return;
      }

      xapiWrapper.sendStatement(statement, callback)
    },

    getObjectForActivity : function() {
      var object = {};

      var iri = this.get("activityId");
      if (!iri) {
        return null;
      }

      object.id = iri;
      object.objectType = "Activity";

      return object;
    },

  });

  Adapt.on('app:dataReady', function() {
    new xAPI();
  });
});
