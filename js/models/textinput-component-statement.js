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

      object.definition.interactionType = "fill-in";

      object.definition.correctResponsePattern = "";
      var correctResponses = [];

      var item = this.get('model').get('_items')[0];
      _.each(item._answers, function(answer) {
        correctResponses.push(answer);

      });

      object.definition.correctResponsePattern = correctResponses.join("[,]");

      return object;
    },

  });

  return TextInputComponentStatementModel;

});
