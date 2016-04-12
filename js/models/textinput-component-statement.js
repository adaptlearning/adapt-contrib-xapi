define(function(require) {

  var Adapt = require('coreJS/adapt');
  var _ = require('underscore');
  var Backbone = require('backbone');
  var QuestionComponentStatementModel = require('./question-component-statement');

  var TextInputComponentStatementModel = QuestionComponentStatementModel.extend({

    initialize: function() {
      return QuestionComponentStatementModel.prototype.initialize.call(this);
    },

    getStatement: function() {
      var statement = QuestionComponentStatementModel.prototype.getStatement.call(this);

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
      return QuestionComponentStatementModel.prototype.getVerb.call(this);
    },

    getObject: function() {
      return QuestionComponentStatementModel.prototype.getObject.call(this);
    },

    getResult: function() {
      var result = QuestionComponentStatementModel.prototype.getResult.call(this);
      var item = this.get('model').get('_items')[0];

      result.response = [];
      var response = {};

      response.userAnswer = item.userAnswer;
      response._isCorrect = item._isCorrect;
      result.response.push(response);

      return result;
    },

    getScore: function() {
      return QuestionComponentStatementModel.prototype.getScore.call(this);
    },

    getObject: function() {
      var object = QuestionComponentStatementModel.prototype.getObject.call(this);

      object.definition.interactionType = "textinput";
      object.definition.correctResponsePattern = [];

      var item = this.get('model').get('_items')[0];

      _.each(item._answers, function(answer) {
        object.definition.correctResponsePattern.push(answer);

      });

      return object;
    },

  });

  return TextInputComponentStatementModel;

});
