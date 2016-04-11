define(function(require) {

  var Adapt = require('coreJS/adapt');
  var _ = require('underscore');
  var Backbone = require('backbone');
  var ComponentStatementModel = require('./component-statement');

  var QuestionComponentStatementModel = ComponentStatementModel.extend({

    initialize: function() {
      return ComponentStatementModel.prototype.initialize.call(this);
    },

    getStatementObject: function() {
      var statement = ComponentStatementModel.prototype.getStatementObject.call(this);

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

      return object;
    },

    getResult: function() {
      var result = {};

      var score = this.getScore();
      if (score != null) {
        result.score = score;
      }

      if (this.get('model').isCorrect != null) {
        result.success = this.get('model').isCorrect;
      }

      if (this.get('model').isComplete != null) {
        result.completion = this.get('model').isComplete;
      }

      return result;
    },

    getScore: function() {
      var score = {};

      score.raw = this.get('model').get('_score');

      return score;
    },

    getObject: function() {
      var object = ComponentStatementModel.prototype.getObject.call(this);

      object.type = this.get('model').get('_component');

      object.definition.description = {};
      object.definition.description[Adapt.config.get('_defaultLanguage')] = this.get('model').get('body');

      return object;
    },

  });

  return QuestionComponentStatementModel;

});
