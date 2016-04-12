define(function(require) {

  var Adapt = require('coreJS/adapt');
  var _ = require('underscore');
  var Backbone = require('backbone');
  var ADL = require('../xapiwrapper.min');
  var ComponentStatementModel = require('./component-statement');

  return ComponentStatementModel.extend({

    initialize: function() {
      return ComponentStatementModel.prototype.initialize.call(this);
    },

    getStatement: function() {
      var statement = ComponentStatementModel.prototype.getStatement.call(this);

      var verb = this.getVerb();
      var object = this.getObject();
      var context = this.getContext();
      var result = this.getResult();

      if (
        _.isEmpty(verb) ||
        _.isEmpty(object) ||
        _.isEmpty(context) ||
        _.isEmpty(result)
      ) {
        return null;
      }

      statement.verb = verb;
      statement.object = object;
      statement.context = context;
      statement.result = result;

      return statement;
    },

    getVerb: function() {
      return ADL.verbs.answered;
    },

    getObject: function() {
      var object = ComponentStatementModel.prototype.getObject.call(this);

      object.definition.type = "http://adlnet.gov/expapi/activities/cmi.interaction";

      object.definition.description[Adapt.config.get('_defaultLanguage')] = this.get('model').get('body');

      return object;
    },

    getResult: function() {
      var result = {};

      var score = this.getScore();
      if (score != null) {
        result.score = score;
      }

      if (this.get('model').get('_isCorrect') != null) {
        result.success = this.get('model').get('_isCorrect');
      }

      if (this.get('model').get('_isComplete') != null) {
        result.completion = this.get('model').get('_isComplete');
      }

      return result;
    },

    getScore: function() {
      var score = {};

      score.raw = this.get('model').get('_score');

      return score;
    }

  });

});
