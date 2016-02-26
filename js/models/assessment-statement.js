define(function(require) {

  var Adapt = require('coreJS/adapt');
  var Backbone = require('backbone');

  var AssessmentStatementModel = Backbone.Model.extend({

    defaults: {
      activityId: "",
      actor: null,
      assessmentState: null,
      registration: null
    },

    initialize: function() {
      if (!this.get("activityId")) {
        return null;
      }

      if (!this.get("actor")) {
        return null;
      }

      if (!this.get("assessmentState")) {
        return null;
      }

      if (!this.get("registration")) {
        return null;
      }
    },

    getStatementObject: function() {
      var statement = {};

      var verb = this.getVerb();
      var object = this.getObject();
      var result = this.getResult();
      var context = this.getContext();

      if (!verb) {
        console.log('Failed to generate statement for assessment: Could not generate \'verb\'');
        return null;
      }

      statement.verb = verb;

      if (!this.get('actor')) {
        console.log('Failed to generate statement for assessment: \'actor\' is missing or invalid');
        return null;
      }

      statement.actor = this.get('actor');

      if (!object || !object.id) {
        console.log('Failed to generate statement for assessment: Could not generate \'object\'');
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

    getVerb: function() {
      if (!this.get('assessmentState')) {
        return null;
      }

      return (this.get('assessmentState').isPass == true) ? ADL.verbs.passed : ADL.verbs.failed;
    },

    getObject: function() {
      var object = {};

      var iri = this.getIri();
      if (!iri) {
        return null;
      }

      object.id = iri

      return object;
    },

    getContext: function() {
      var context = {};

      var contextActivities = this.getContextActivities();

      if (contextActivities) {
        context.contextActivities = contextActivities;
      }

      var language = Adapt.config.get('_defaultLanguage');

      if (language) {
        context.language = language
      }

      var registration = this.get("registration");
      if (registration) {
        context.registration = registration
      }

      return context;
    },

    getContextActivities: function() {
      var contextActivities = {};

      if (this.get('activityId')) {
        contextActivities.parent = {
          id: this.get('activityId'),
          objectType: "Activity"
        }
      }

      return contextActivities;
    },

    getScore: function() {
      var score = {};

      if (this.get('assessmentState').scoreAsPercent != null) {
        score.scaled = this.get('assessmentState').scoreAsPercent / 100;
      }

      if (this.get('assessmentState').score != null) {
        score.raw = this.get('assessmentState').score;
      }

      return score;
    },

    getResult: function() {
      var result = {};

      var score = this.getScore();
      if (score != null) {
        result.score = score;
      }

      if (this.get('assessmentState').isPass != null) {
        result.success = this.get('assessmentState').isPass;
      }

      if (this.get('assessmentState').isComplete != null) {
        result.completion = this.get('assessmentState').isComplete;
      }

      return result != {} ? result : null;
    },

    getIri: function() {
      if (!this.get('activityId') || !this.get('assessmentState').id) {
        return null;
      }

      return [this.get('activityId'), 'assessment', this.get('assessmentState').id].join('/');
    },

  });

  return AssessmentStatementModel;

});
