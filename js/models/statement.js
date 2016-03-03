define(function(require) {

  var Adapt = require('coreJS/adapt');
  var _ = require('underscore');
  var Backbone = require('backbone');

  var StatementModel = Backbone.Model.extend({

    defaults: {
      activityId: null,
      actor: null,
      registration: null,
      model: null,
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

      if (!this.get("model")) {
        return null;
      }
    },

    getStatementObject: function() {
      var statement = {};

      var verb = this.getVerb();
      var object = this.getObject();
      var context = this.getContext();

      if (!verb) {
        return null;
      }

      statement.verb = verb;

      if (!this.get('actor')) {
        return null;
      }

      statement.actor = this.get('actor');

      if (!object || !object.id) {
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

    getObject: function() {
      var object = {};

      var iri = this.getIri();
      if (!iri) {
        return null;
      }

      object.id = iri;

      object.objectType = "Activity";

      object.definition = this.getActivityDefinitionObject(this.get('model'));

      return object;
    },

    getActivityDefinitionObject: function() {
      var object = {};

      object.name = {};
      object.name[Adapt.config.get('_defaultLanguage')] = this.get('model').get('title');

      object.type = this.get('model').get('_type');

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
      return {};
    },

    getIri: function() {
      if (!this.get('activityId') || !this.get('model').get('_type') || this.get('model').get('_id')) {
        return null;
      }

      return [this.get('activityId'), this.get('model').get('_type'), this.get('model').get('_id')].join('/');
    },

  });

  return StatementModel;

});
