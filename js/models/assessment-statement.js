define(function(require) {

  require('../xapiwrapper.min');

  var Adapt = require('coreJS/adapt');
  var _ = require('underscore');
  var Backbone = require('backbone');
  var StatementModel = require('./statement');

  var AssessmentStatementModel = StatementModel.extend({

    initialize: function() {
      return StatementModel.prototype.initialize.call(this);
    },

    getStatement: function() {
      var statement = StatementModel.prototype.getStatement.call(this);

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
      if (_.isEmpty(this.get('model')) || typeof this.get("model").isPass == "undefined") {
        return null;
      }

      return (this.get('model').isPass == true) ? ADL.verbs.passed : ADL.verbs.failed;
    },

    getObject: function() {
      var object = {};

      var iri = this.getIri();
      if (!iri) {
        return null;
      }

      object.id = iri;

      return object;
    },

    getContext: function() {
      var context = StatementModel.prototype.getContext.call(this);

      var contextActivities = this.getContextActivities();
      if (!_.isEmpty(contextActivities)) {
        context.contextActivities = contextActivities;
      }

      return context;
    },

    getContextActivities: function() {
      return StatementModel.prototype.getContextActivities.call(this);
    },

    getScore: function() {
      var score = {};

      if (typeof this.get('model').scoreAsPercent != 'undefined') {
        score.scaled = this.get('model').scoreAsPercent / 100;
      }

      if (typeof this.get('model').score != 'undefined') {
        score.raw = this.get('model').score;
      }

      return score;
    },

    getResult: function() {
      var result = {};

      var score = this.getScore();
      if (score != null) {
        result.score = score;
      }

      if (this.get('model').isPass != null) {
        result.success = this.get('model').isPass;
      }

      if (this.get('model').isComplete != null) {
        result.completion = this.get('model').isComplete;
      }

      return result != {} ? result : null;
    },

    getIri: function() {
      if (!this.get('activityId') || !this.get('model').id) {
        return null;
      }

      return [this.get('activityId'), 'assessment', this.get('model').id].join('/');
    },

  });

  return AssessmentStatementModel;

});
