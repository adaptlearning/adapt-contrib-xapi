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
      console.log('xapi', xapiWrapper);
      this.set('initialised', true);
    },

    xapiEnd: function () {
      // send xapi end
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
      this.set('lastCompletedBlock', block);
      // TODO persist data
    },

    onCourseComplete: function () {
      if (Adapt.course.get('_isComplete') === true) {
        this.set('_attempts', this.get('_attempts') + 1);
      }

      _.defer(_.bind(this.checkTrackingCriteriaMet, this));
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

    checkTrackingCriteriaMet: function() {
      var criteriaMet = false;

      if (this.data._tracking._requireCourseCompleted && this.data._tracking._requireAssessmentPassed) { // user must complete all blocks AND pass the assessment
        criteriaMet = (Adapt.course.get('_isComplete') && Adapt.course.get('_isAssessmentPassed'));
      } else if (this.data._tracking._requireCourseCompleted) { //user only needs to complete all blocks
        criteriaMet = Adapt.course.get('_isComplete');
      } else if (this.data._tracking._requireAssessmentPassed) { // user only needs to pass the assessment
        criteriaMet = Adapt.course.get('_isAssessmentPassed');
      }

      if (criteriaMet) {
        // TODO set completion status
      }
    }
  });

  Adapt.on('app:dataReady', function() {
    new TinCan();
  });
});
