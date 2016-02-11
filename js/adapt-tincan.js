/*
 * adapt-tincan
 * License - http://github.com/adaptlearning/adapt_framework/LICENSE
 * Maintainers  - Dennis Heaney <dennis@learningpool.com>
 *              - Barry McKay <barry@learningpool.com>
 *              - Andy Bell <andrewb@learningpool.com>
 */
define(function(require) {

  var Adapt = require('coreJS/adapt');
  var _ = require('underscore');
  var xapi = require('extensions/adapt-tincan/js/xapiwrapper.min');

  var xapiWrapper;
  var STATE_PROGRESS = 'adapt-course-progress';

  var TinCan = Backbone.Model.extend({
    actor: null,
    activityId: null,

    defaults: {
      initialised: false,
      state: null
    },

    initialize: function() {
      if (window.xapiWrapper) {
        xapiWrapper = window.xapiWrapper;
      } else {
        xapiWrapper = ADL.XAPIWrapper;
      }

      if (!Adapt.config.get("_extensions") || !Adapt.config.get("_extensions")._tincan) {
        return;
      }

      this.setConfig(Adapt.config.get("_extensions")._tincan);

      if (false === this.getConfig('_isEnabled')) {
        return;
      }

      this.actor = this.getLRSAttribute('actor');

      this.activityId = this.getConfig('_activityID') ? this.getConfig('_activityID') : this.getLRSAttribute('activity_id');

      if (!this.validateParams()) {
        return;
      }

      this.xapiStart();
      xapiWrapper.lrs.user = '147be28c57a756d20dc8183f9c8aa2c206e6d545';
      xapiWrapper.lrs.password = '	5a6173230f92b84517401511e5a5ef9a07b30756';
      xapiWrapper.updateAuth(xapiWrapper.lrs, xapiWrapper.lrs.user, xapiWrapper.lrs.password);

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

      if (!this.checkTrackingCriteriaMet()) {
        xapiWrapper.sendStatement(this.getStatement(ADL.verbs.suspended));
      }

      xapiWrapper.sendStatement(this.getStatement(ADL.verbs.terminated));
    },

    setupListeners: function() {
      //Adapt.blocks.on('change:_isComplete', this.onBlockComplete, this);
      //Adapt.course.on('change:_isComplete', this.onCourseComplete, this);
      //Adapt.on('assessment:complete', this.onAssessmentComplete, this);
      //Adapt.on('tincan:stateChanged', this.onStateChanged, this);
      //Adapt.on('tincan:stateLoaded', this.restoreState, this);
      this.listenTo(Adapt.blocks, "change:_isComplete", this.onBlockComplete);
      this.listenTo(Adapt.course, "change:_isComplete", this.onCourseComplete);
      this.listenTo(Adapt, "assessment:complete", this.onAssessmentSubmitted);
      this.listenTo(Adapt, "tincan:stateChanged", this.onStateChanged);
      this.listenTo(Adapt, "tincan:stateLoaded", this.restoreState);
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

        Adapt.trigger('tincan:stateChanged');
      }
    },

    onCourseComplete: function() {
      if (Adapt.course.get('_isComplete') === true) {
        this.set('_attempts', this.get('_attempts') + 1);
      }

      _.defer(_.bind(this.updateTrackingStatus, this));
    },

    onAssessmentSubmitted: function(event) {
      if (event.isPass == true) {
        xapiWrapper.sendStatement(this.getStatement(ADL.verbs.completed), this.getObjectForAssessment());
      } else {
        xapiWrapper.sendStatement(this.getStatement(ADL.verbs.failed), this.getObjectForAssessment());
      }

      Adapt.course.set('_isAssessmentPassed', event.isPass);

      //if (event.isPass == 'false') {
      //  Adapt.course.set('_isAssessmentPassed', event.isPass);
      //}
      //Adapt.course.set('_isAssessmentPassed', event.isPass);
      //var tracking = this.getConfig('_tracking');
      //
      //if (!tracking) {
      //  return;
      //}
      //
      //// persist data
      //if (event.isPass) {
      //  _.defer(_.bind(this.updateTrackingStatus, this));
      //} else if (tracking._requireAssessmentPassed) {
      //  // TODO set failed/incomplete status
      //  _.defer(_.bind(this.updateTrackingStatus, this));
      //  // this will need to send a statement with user failed assessment.
      //  //xapiWrapper.sendStatement(this.getStatement(ADL.verbs.failed));
      //}
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
        xapiWrapper.sendStatement(this.getStatement(ADL.verbs.completed));
      }
    },

    /**
     * Send the current state of the course (completed blocks, duration, etc)
     * to the LRS
     */
    saveState: function() {
      if (this.get('state')) {
        xapiWrapper.sendState(
            this.activityId,
            this.actor,
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
     * @fires tincan:loadStateFailed or tincan:stateLoaded
     */
    loadState: function(async) {
      if (async) {
        xapiWrapper.getState(
            this.activityId,
            this.actor,
            STATE_PROGRESS,
            null,
            function success(result) {
              if ('undefined' === typeof result || 404 === result.status) {
                Adapt.trigger('tincan:loadStateFailed');
                return;
              }

              try {
                this.set('state', JSON.parse(result.response));
                Adapt.trigger('tincan:stateLoaded');
              } catch (ex) {
                Adapt.trigger('tincan:loadStateFailed');
              }
            }
        );
      } else {
        this.set(
            'state',
            xapiWrapper.getState(
                this.activityId,
                this.actor,
                STATE_PROGRESS
            )
        );

        if (!this.get('state')) {
          Adapt.trigger('tincan:loadStateFailed');
        } else {
          Adapt.trigger('tincan:stateLoaded');
        }
      }
    },

    /**
     * Generate a statement object for the xAPI wrapper method @sendStatement
     *
     * @param {string} verb - the action to register
     * @param {string|object} [actor] - optional actor
     * @param {object} [object] - optional object - defaults to this activity
     */
    getStatement: function(verb, object) {
      var statement = {
        "verb": verb
      };

      statement.actor = this.actor;

      // object is required, but can default to the course activity
      statement.object = object || {
            "id": this.activityId
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
     * @return {object|boolean} the attribute value, or false if not found
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
      var isValid = true;
      if (!this.actor || typeof this.actor != 'object') {
        isValid = false;
      }

      if (!this.activityId) {
        isValid = false;
      }

      return isValid;
    },

    getIriForBlock() {
      return 'AU ID' + '/' + 'page' + '/' + 'pageID' + '/' + 'article' + '/' + 'articleID' + '/' + 'block' + '/' + 'blockID';
    },

    getIriForComponent() {
      return 'AU ID' + '/' + 'page' + '/' + 'pageID' + '/' + 'article' + '/' + 'articleID' + '/' + 'component' + '/' + 'componentID';
    },

    getIriForAssessment() {
      return 'AU ID' + '/' + 'page' + '/' + 'pageID' + '/' + 'article' + '/' + 'articleID' + '/' + 'assessment';
    },

    getObjectForAssessment() {
      return {
        'id' : this.getIriForAssessment()
      };
    }
  });

  Adapt.on('app:dataReady', function() {
    new TinCan();
  });
});
