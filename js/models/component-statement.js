define(function(require) {

  var Adapt = require('coreJS/adapt');
  var Backbone = require('backbone');

  var ComponentStatementModel = Backbone.Model.extend({

    defaults: {
      activityId: null,
      actor: null,
      registration: null,
      componentState: null
    },

    initialize: function() {
      if (!this.get("activityId")) {
        return null;
      }

      if (!this.get("actor")) {
        return null;
      }

      if (!this.get("registration")) {
        return null;
      }

      if (!this.get("componentState")) {
        return null;
      }
    },

    getStatementObject: function() {
      var statement = {};

      var verb = this.getVerb();
      var object = this.getObject();
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

      if (context) {
        statement.context = context;
      }

      return statement;
    },

    getVerb: function() {
      return ADL.verbs.experienced;
    },

    // The Object of a Statement can be an Activity, Agent/Group, Sub-Statement, or Statement Reference
    getObject: function() {
      var object = {};

      var iri = this.getIriForModel(this.get('componentState'));
      if (!iri) {
        return null;
      }

      object.id = iri;

      object.objectType = "Activity";

      object.definition = this.getActivityDefinitionObjectForModel(this.get('componentState'));

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

      if (this.get('componentState').get('_isPartOfAssessment') == true) {
        var article = this.get('componentState').getParent().getParent();

        if (article) {
          var assessmentIri = [this.get('activityId'), 'assessment', this.get('assessmentState').id].join('/');
          contextActivities.parent = {
            id : assessmentIri
          }
        }

      }

      return contextActivities;
    },

    getIriForModel: function(model) {
      if (!this.get('activityId') || !model.get('_type') || !model.get('_id')) {
        return null;
      }

      return [this.get('activityId'), model.get('_type'), model.get('_id')].join('/');
    },

    getActivityDefinitionObjectForModel: function(model) {
      var object = {};

      object.name = {};
      object.name[Adapt.config.get('_defaultLanguage')] = model.get('title');

      object.type = model.get('_type');

      return object;
    },

  });

  return ComponentStatementModel;

});
