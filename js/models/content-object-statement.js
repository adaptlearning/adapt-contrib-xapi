define(function(require) {

  var Adapt = require('coreJS/adapt');
  var _ = require('underscore');
  var Backbone = require('backbone');
  var StatementModel = require('./statement');

  var ContentObjectStatementModel = StatementModel.extend({

    initialize: function() {
      return StatementModel.prototype.initialize.call(this);
    },

    getStatementObject: function() {
      var statement = StatementModel.prototype.getStatementObject.call(this);

      var verb = this.getVerb();
      var object = this.getObject();
      var context = this.getContext();

      if (
        _.isEmpty(verb) ||
        _.isEmpty(object) ||
        _.isEmpty(context)
      ) {
        return null;
      }

      statement.verb = verb;
      statement.object = object;
      statement.context = context;

      return statement;
    },

    getVerb: function() {
      return StatementModel.prototype.getVerb.call(this);
    },

    getObject: function() {
      return StatementModel.prototype.getObject.call(this);
    },

    getActivityDefinitionObject: function() {
      var object = StatementModel.prototype.getActivityDefinitionObject.call(this);

      if (_.isEmpty(object)) {
        object = {};
      }

      object.name = {};
      object.name[Adapt.config.get('_defaultLanguage')] = this.get('model').get('title');

      object.type = ['http://adaptlearning.org', this.get('model').get('_type'), this.get('model').get('_id')].join('/');

      return object;
    },

    getIri: function() {
      if (
        _.isEmpty(this.get('activityId')) ||
        _.isEmpty(this.get('model')) ||
        _.isEmpty(this.get('model').get('_type')) ||
        _.isEmpty(this.get('model').get('_id'))
      ) {
        return null;
      }

      return [this.get('activityId'), this.get('model').get('_type'), this.get('model').get('_id')].join('/');
    },

    getContext: function() {
      return StatementModel.prototype.getContext.call(this);
    },

    getContextActivities: function() {
      return StatementModel.prototype.getContextActivities.call(this);
    },

  });

  return ContentObjectStatementModel;

});
