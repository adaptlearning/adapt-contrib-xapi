/*
 * adapt-contrib-xapi
 * License      - http://github.com/adaptlearning/adapt_framework/LICENSE
 * Maintainers  - Dennis Heaney <dennis@learningpool.com>
 *              - Barry McKay <barry@learningpool.com>
 *              - Brian Quinn <brian@learningpool.com>
 */
define([
  'core/js/adapt',
  'backbone'
], function(Adapt, Backbone) {

  var ErrorView = Backbone.View.extend({

    tagName: 'div',

    className: 'xapi-error',

    events: {
      'click button.continue': 'continue',
      'click button.exit': 'exit'
    },

    initialize: function() {
      _.defer(_.bind(function() {
        this.render();
      }, this));
    },

    render: function() {
      var data = _.extend({}, this.model.toJSON(), { '_globals': this.getGlobals() });

      this.$el.html(Handlebars.templates['error'](data));

      return this;
    },

    continue: function() {
      this.trigger('continue');
    },

    exit: function() {
      this.trigger('exit');
    },

    getGlobals: function() {
      return Adapt && Adapt.course &&
        Adapt.course.get('_globals') &&
        Adapt.course.get('_globals')._extensions &&
        Adapt.course.get('_globals')._extensions._xapi || {};
    }

  });

  return ErrorView;
});