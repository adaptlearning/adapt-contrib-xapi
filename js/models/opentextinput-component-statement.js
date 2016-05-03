define(function(require) {

  var Adapt = require('coreJS/adapt');
  var _ = require('underscore');
  var Backbone = require('backbone');
  var QuestionComponentStatementModel = require('./question-component-statement');
  var StatementModel = require('./statement');

  var OpenTextInputComponentStatementModel = QuestionComponentStatementModel.extend({

    getResult: function() {
      var result = QuestionComponentStatementModel.prototype.getResult.call(this);
      var item = this.get('model').attributes;

      if (item._userAnswer !== null) {
        result.response = item._userAnswer;
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
      var item = this.get('model').attributes;
      var correctResponses = [];

      object.definition.interactionType = "long-fill-in";
      var defaultLang = Adapt.config.get('_defaultLanguage');
      var responsePatternString = '{case_matters=false}{lang='+defaultLang+'}' + item.modelAnswer;

      object.definition.correctResponsePattern = [responsePatternString];

      return object;
    },

  });

  return OpenTextInputComponentStatementModel;

});
