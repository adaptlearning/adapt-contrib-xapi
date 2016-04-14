define(function(require) {

  var Adapt = require('coreJS/adapt');
  var _ = require('underscore');
  var Backbone = require('backbone');
  var QuestionComponentStatementModel = require('./question-component-statement');

  var TextInputComponentStatementModel = QuestionComponentStatementModel.extend({

    getResult: function() {
      var result = QuestionComponentStatementModel.prototype.getResult.call(this);
      var item = this.get('model').get('_items')[0];

      if (item.userAnswer != null) {
        result.response = item.userAnswer;
      }

      return result;
    },

    getScore: function() {
      var score = QuestionComponentStatementModel.prototype.getScore.call(this);

      score.scaled = score.raw;

      return score;
    },

    getObject: function() {
      var object = QuestionComponentStatementModel.prototype.getObject.call(this);
      var item = this.get('model').get('_items')[0];
      var correctResponses = [];

      object.definition.interactionType = "fill-in";

      _.each(item._answers, function(answer) {
        correctResponses.push(answer);
      });

      object.definition.correctResponsePattern = correctResponses;

      return object;
    },

  });

  return TextInputComponentStatementModel;

});
