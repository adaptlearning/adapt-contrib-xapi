/*
* adapt-tincan
* License - http://github.com/adaptlearning/adapt_framework/LICENSE
* Maintainers - Dennis Heaney <dennis@learningpool.com>
*/
define(function(require) {

  var Adapt = require('coreJS/adapt');
  var _ = require('underscore');
  var xapi = require('extensions/adapt-tincan/js/xapiwrapper.min');
  var xapiWrapper;
  var actor;
  var activityId;
  var STATE_PROGRESS = 'adapt-course-progress';

  var TinCan = Backbone.Model.extend({

    defaults: {
      initialised: false,
      state: null
    },

    initialize: function () {

      if (undefined === Adapt.config.get("_extensions")._tincan) {
        console.log("No configuration found for tincan in config.json");
        return;
      }

      this.setConfig(Adapt.config.get("_extensions")._tincan);

      if (false === this.getConfig('_isEnabled')) {
        return;
      }

      this.setupListeners();
      this.xapiStart();
      $(window).unload(_.bind(this.xapiEnd, this));
    },

    xapiStart: function () {
      xapiWrapper = ADL.XAPIWrapper;
      
      actor = this.getLRSAttribute('actor');
      activityId = this.getLRSAttribute('activityId');
      
      try {
          actor = JSON.parse(actor);
      } catch(e) {
          console.log("Failed to parse 'actor' JSON string");
      }
      
      if (!this.validateParams()) {
        return;
      }
      
      this.loadState();
      this.set('initialised', true);
    },

    xapiEnd: function () {
      if (!this.checkTrackingCriteriaMet()) {
        // send suspended statement
        xapiWrapper.sendStatement(this.getStatement(ADL.verbs.suspended));
      }
      // send xapi end
      xapiWrapper.sendStatement(this.getStatement(ADL.verbs.terminated));
    },

    setupListeners: function () {
      Adapt.blocks.on('change:_isComplete', this.onBlockComplete, this);
      Adapt.course.on('change:_isComplete', this.onCourseComplete, this);
      Adapt.on('assessment:complete', this.onAssessmentComplete, this);
      Adapt.on('tincan:stateChanged', this.onStateChanged, this);
      Adapt.on('tincan:stateLoaded', this.restoreState, this);
    },

    onBlockComplete: function (block) {
      var state = this.get('state') || {};

      if (!state.blocks) {
        state.blocks = [];
      }

      // check if we've already recorded state for this block.
      var existingBlock = _.find(state.blocks, function findBlock (b) {
        return b._id == block.get('_id');
      });

      // only fire state changes for newly completed blocks
      if (!existingBlock) {
        state.blocks.push({
          _id: block.get('_id'),
          _trackingId: block.get('_trackingId'),
          _isComplete: block.get('_isComplete'),
        });

        this.set('state', state);
        Adapt.trigger('tincan:stateChanged');
      }

    },

    onCourseComplete: function () {
      if (Adapt.course.get('_isComplete') === true) {
        this.set('_attempts', this.get('_attempts') + 1);
      }

      _.defer(_.bind(this.updateTrackingStatus, this));
    },

    onAssessmentComplete: function (event) {
      Adapt.course.set('_isAssessmentPassed', event.isPass);
      var tracking = this.getConfig('_tracking');

      if (!tracking) {
        return;
      }

      // persist data
      if (event.isPass) {
        _.defer(_.bind(this.updateTrackingStatus, this));
      } else if (tracking._requireAssessmentPassed) {
        // TODO set failed/incomplete status
      }
    },

    onStateChanged: function (event) {
      this.saveState();
    },

    /**
    * Check if course tracking criteria have been met
    * @return {boolean} - true, if criteria have been met; otherwise false
    */
    checkTrackingCriteriaMet: function () {
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
    updateTrackingStatus: function () {
      if (this.checkTrackingCriteriaMet()) {
        xapiWrapper.sendStatement(this.getStatement(ADL.verbs.completed));
      }
    },

    /**
    * Send the current state of the course (completed blocks, duration, etc)
    * to the LRS
    */
    saveState: function () {
      if (this.get('state')) {
        xapiWrapper.sendState(
          activityId,
          actor,
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
    restoreState: function () {
      var state = this.get('state');

      if (!state) {
        return;
      }

      state.blocks && _.each(state.blocks, function (block) {
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
    loadState: function (async) {
      if (async) {
        xapiWrapper.getState(
          activityId,
          actor,
          STATE_PROGRESS,
          null,
          function success (result) {
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
            activityId,
            actor,
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
    getStatement: function (verb, actor, object) {
      var statement = {
        "verb": verb
      };

      // if actor is missing on statement, xapiWrapper will set it for us
      actor && (statement.actor = actor);

      // object is required, but can default to the course activity
      statement.object = object || {
        "id": activityId
      }

      return statement;
    },

    /**
    * Set the extension config
    *
    * @param {object} key - the data attribute to fetch
    */
    setConfig: function (conf) {
      this.data = conf;
    },

    /**
    * Retrieve a config item for the current course, e.g. '_activityID'
    *
    * @param {string} key - the data attribute to fetch
    * @return {object|boolean} the attribute value, or false if not found
    */
    getConfig: function (key) {
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
    getLRSAttribute: function (key) {
      if (!xapiWrapper || !xapiWrapper.lrs || undefined === xapiWrapper.lrs[key]) {
        return false;
      }

      try {
        return xapiWrapper.lrs[key];
      } catch(e) {
        return false;
      }

      return false;
    },

    markBlockAsComplete: function (block) {
      if (!block || block.get('_isComplete')) {
        return;
      }

      block.getChildren().each(function (child) {
        child.set('_isComplete', true);
      }, this);
    },
    
    validateParams: function() {
        var isValid = true;
        if (!actor || typeof actor != 'object') {
            console.log('actor object not valid' + typeof actor);
            isValid = false;
        }

        if (!activityId) {
            console.log('activityId not valid');
            isValid = false;
        }

        return isValid;
    }
  });

  Adapt.on('app:dataReady', function() {
    new TinCan();
  });
});
