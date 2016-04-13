define(function(require) {

  require('../xapiwrapper.min');

  var Adapt = require('coreJS/adapt');
  var _ = require('underscore');
  var Backbone = require('backbone');
  var QuestionComponentStatementModel = require('./question-component-statement');

  var MCQComponentStatementModel = QuestionComponentStatementModel.extend({

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
      var object = QuestionComponentStatementModel.prototype.getObject.call(this);
      
      if (
        _.isNull(object)
      ) {
        return null;
      }

      object.definition.interactionType = "choice";

      object.definition.correctResponsePattern = "";
      var correctResponses = [];
      _.each(this.get('model').get('_items'), function(item) {
        if (item._shouldBeSelected) {
          correctResponses.push(item._index);
        }
      });

      object.definition.correctResponsePattern = correctResponses.join("[,]");

      object.definition.choices = this.getDefinitionChoices();

      return object;
    },

    getResult: function() {
      var result = QuestionComponentStatementModel.prototype.getResult.call(this);

      result.response = [];
      _.each(this.get('model').get('_selectedItems'), function(item) {
        result.response.push(item._index);
      });

      return result;
    },

    getScore: function() {
      var score = QuestionComponentStatementModel.prototype.getScore.call(this);

      // MCQ is either 0 or 1
      score.scaled = score.raw;

      return score;
    },

    getObject: function() {
      var object = QuestionComponentStatementModel.prototype.getObject.call(this);

      object.definition.interactionType = "choice";

      object.definition.correctResponsePattern = "";
      var correctResponses = [];
      _.each(this.get('model').get('_items'), function(item) {
        if (item._shouldBeSelected) {
          correctResponses.push(item._index);
        }
      });

      object.definition.correctResponsePattern = correctResponses.join("[,]");

      object.definition.choices = this.getDefinitionChoices();

      return object;
    },

    getDefinitionChoices: function() {
      var choices = [];

      if (
        _.isEmpty(this.get('model').get('_items'))
      ) {
        return null;
      }

      _.each(this.get('model').get('_items'), function(item) {
        var choice = {};
        choice.id = item._index;
        choice.description = {};
        choice.description[Adapt.config.get('_defaultLanguage')] = item.text;

        choices.push(choice);
      });

      return choices;
    },

  });

  return MCQComponentStatementModel;

});
