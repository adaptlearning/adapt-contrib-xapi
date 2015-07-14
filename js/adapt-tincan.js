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

  var TinCan = Backbone.Model.extend({

    defaults: {
      initialised: false
    },

    initialize: function () {
      this.data = Adapt.config.get('_tincan');
      if (!this.data || this.data._isEnabled === false) {
        return;
      }

      this.xapiStart();
      $(window).unload(_.bind(this.xapiEnd, this));
      this.onDataReady();
    },

    xapiStart: function () {
      // init xapi
      xapiWrapper = ADL.XAPIWrapper;
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

    onDataReady: function () {
      this.setupListeners();
    },

    setupListeners: function () {
      Adapt.blocks.on('change:_isComplete', this.onBlockComplete, this);
      Adapt.course.on('change:_isComplete', this.onCourseComplete, this);
      Adapt.on('assessment:complete', this.onAssessmentComplete, this);
    },

    onBlockComplete: function (block) {
      console.log('block complete', block);
    },

    onCourseComplete: function () {
      if (Adapt.course.get('_isComplete') === true) {
        this.set('_attempts', this.get('_attempts') + 1);
      }

      _.defer(_.bind(this.updateTrackingStatus, this));
    },

    onAssessmentComplete: function (event) {
      Adapt.course.set('_isAssessmentPassed', event.isPass)

      // TODO persist data

      if (event.isPass) {
        _.defer(_.bind(this.checkTrackingCriteriaMet, this));
      } else if (this.data._tracking._requireAssessmentPassed) { // if the user fails, don't set the status if _requireAssessmentPassed is false - doing so could overwrite the status set as a result of the user completing all the content
        // TODO set failed/incomplete status
      }
    },

    checkTrackingCriteriaMet: function () {
      var criteriaMet = false;

      if (this.data._tracking._requireCourseCompleted && this.data._tracking._requireAssessmentPassed) { // user must complete all blocks AND pass the assessment
        criteriaMet = (Adapt.course.get('_isComplete') && Adapt.course.get('_isAssessmentPassed'));
      } else if (this.data._tracking._requireCourseCompleted) { //user only needs to complete all blocks
        criteriaMet = Adapt.course.get('_isComplete');
      } else if (this.data._tracking._requireAssessmentPassed) { // user only needs to pass the assessment
        criteriaMet = Adapt.course.get('_isAssessmentPassed');
      }

      return criteriaMet;
    },

    /**
     * checks if course tracking criteria have been met, and sends an xAPI
     * statement if appropriate
     */
    updateTrackingStatus: function () {
      if (this.checkTrackingCriteriaMet()) {
        xapiWrapper.sendStatement(this.getStatement(ADL.verbs.completed));
      }
    },

    /**
     * generates a statement object for the xAPI wrapper method @sendStatement
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
        "id": this.data._activityID
      }

      return statement;
    }
  });

  Adapt.on('app:dataReady', function() {
    new TinCan();
  });
});
