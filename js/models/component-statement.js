define(function(require) {

  require('../xapiwrapper.min');

  var Adapt = require('coreJS/adapt');
  var _ = require('underscore');
  var Backbone = require('backbone');
  var StatementModel = require('./statement');

  return StatementModel.extend({

    initialize: function() {
      return StatementModel.prototype.initialize.call(this);
    },

    getStatement: function() {
      var statement = StatementModel.prototype.getStatement.call(this);

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
      var verb = StatementModel.prototype.getVerb.call(this);

      if (
        _.isNull(verb)
      ) {
        return null;
      }

      return verb;
    },

    getObject: function() {
      var object = StatementModel.prototype.getObject.call(this);

      if (
        _.isNull(object)
      ) {
        return null;
      }

      object.id = ['http://adaptlearning.org', this.get('model').get('_type'), this.get('model').get('_component')].join('/');

      object.definition.name[Adapt.config.get('_defaultLanguage')] = this.get('model').get('title');

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
      var contextActivities = StatementModel.prototype.getContextActivities.call(this);

      if (_.isEmpty(contextActivities)) {
        contextActivities = {};
      }

      if (this.get('model').get('_isPartOfAssessment') == true) {
        // Parent is the assessment
        // component -> block -> article
        var article = this.get('model').getParent().getParent();

        if (!_.isEmpty(article)) {
          var assessmentIri = [this.get('activityId'), 'assessment', article.get('_id')].join('/');
          contextActivities.parent = {
            id: assessmentIri
          }
        }
      } else {
        // Parent is the course
        // component -> block -> article -> page -> course
        var course = this.get('model').getParent().getParent().getParent().getParent();
        if (!_.isEmpty(course)) {
          var courseIri = [this.get('activityId'), 'course', course.get('_id')].join('/');
          contextActivities.parent = {
            id: courseIri
          }
        }
      }

      return contextActivities;
    }

  });

});
