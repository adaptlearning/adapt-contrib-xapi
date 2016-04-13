define(function(require) {

  require('../xapiwrapper.min');

  var Adapt = require('coreJS/adapt');
  var _ = require('underscore');
  var Backbone = require('backbone');

  /**
   * @typedef   {Object}      xAPI.Statement            The Statement is the core of the xAPI. All learning events are stored as Statements. A Statement is akin to a sentence of the form "I did this".
   * @property  {Object}      xAPI.Statement.actor      Who the Statement is about, as an Agent or Group Object. Represents the "I" in "I Did This".
   * @property  {xAPI.Verb}   xAPI.Statement.verb       Action of the Learner or Team Object. Represents the "Did" in "I Did This".
   * @property  {xAPI.Object} xAPI.Statement.object     Activity, Agent, or another Statement that is the Object of the Statement. Represents the "This" in "I Did This".
   * @property  {Object}      [xAPI.Statement.result]   Result Object, further details representing a measured outcome relevant to the specified Verb.
   * @property  {Object}      [xAPI.Statement.context]  Context that gives the Statement more meaning. Examples: a team the Actor is working with, altitude at which a scenario was attempted in a flight simulator.
   */

  /**
   * @typedef   {Object}            xAPI.Verb            The Verb defines the action between Actor and Activity.
   * @property  {xAPI.IRI}          xAPI.Verb.id         Corresponds to a Verb definition. Each Verb definition corresponds to the meaning of a Verb, not the word. The IRI should be human-readable and contain the Verb meaning.
   * @property  {xAPI.LanguageMap}  [xAPI.Verb.display]  The human readable representation of the Verb in one or more languages. This does not have any impact on the meaning of the Statement, but serves to give a human-readable display of the meaning already determined by the chosen Verb.
   */

  /**
   * @typedef   {Object}                          xAPI.Object              The Object of a Statement can be an Activity, Agent/Group, Sub-Statement, or Statement Reference. It is the "this" part of the Statement, i.e. "I did this".
   * @property  {xAPI.IRI}                        xAPI.Object.id           An identifier for a single unique Activity
   * @property  {string}                          [xAPI.Object.objectType] MUST be "Activity" when present and subject is an Activity
   * @property  {xAPI.Object.ActivityDefinition}  [xAPI.Object.definition] The human readable representation of the Verb in one or more languages. This does not have any impact on the meaning of the Statement, but serves to give a human-readable display of the meaning already determined by the chosen Verb.
   */

  /**
   * @typedef   {Object}            xAPI.Object.ActivityDefinition
   * @property  {xAPI.LanguageMap}  [xAPI.Object.ActivityDefinition.name]         The human readable/visual name of the Activity
   * @property  {xAPI.LanguageMap}  [xAPI.Object.ActivityDefinition.description]  A description of the Activity
   * @property  {xAPI.IRI}          [xAPI.Object.ActivityDefinition.type]         The type of Activity
   */

  /**
   * @typedef Object.<string, string> xAPI.LanguageMap
   */

  /**
   * @typedef string xAPI.IRI
   */

  return Backbone.Model.extend({

    defaults: {
      activityId: null,
      actor: null,
      registration: null,
      model: null
    },

    initialize: function() {
      if (!this.get("activityId")) {
        return null;
      }

      if (!this.get("actor")) {
        return null;
      }

      if (!this.get("registration")) {
        return null;
      }

      if (!this.get("model")) {
        return null;
      }
    },
    /**
     * Returns the Statement object itself or null if any of its required components are invalid
     * @returns {xAPI.Statement|null}
     */
    getStatement: function() {
      var statement = {};

      var verb = this.getVerb();
      var object = this.getObject();
      var context = this.getContext();

      if (!verb) {
        return null;
      }

      statement.verb = verb;

      if (!this.get('actor')) {
        return null;
      }

      statement.actor = this.get('actor');

      if (!object || !object.id) {
        return null;
      }

      statement.object = object;

      if (context) {
        statement.context = context;
      }

      return statement;
    },

    /**
     * Returns an Verb for this Statement
     * @returns {xAPI.Verb}
     */
    getVerb: function() {
      return ADL.verbs.experienced;
    },

    /**
     * Returns an Object object for this Statement
     * @returns {xAPI.Object|null}
     */
    getObject: function() {
      var object = {};

      var iri = this.getIri();
      if (!iri) {
        return null;
      }

      object.id = iri;

      object.objectType = "Activity";

      object.definition = this.getActivityDefinition();

      return object;
    },

    /**
     * Returns a Definition object for this Statement
     * @returns {xAPI.Object.ActivityDefinition}
     */
    getActivityDefinition: function() {
      var objectDefinition = {};

      objectDefinition.name = {};
      objectDefinition.name[Adapt.config.get('_defaultLanguage')] = this.get('model').get('title');

      objectDefinition.type = this.get('model').get('_type');

      objectDefinition.description = {};

      return objectDefinition;
    },

    /**
     * Returns a Context object for this Statement
     * @returns {object}
     */
    getContext: function() {
      var context = {};

      var contextActivities = this.getContextActivities();
      if (contextActivities) {
        context.contextActivities = contextActivities;
      }

      var language = Adapt.config.get('_defaultLanguage');
      if (language) {
        context.language = language
      }

      var registration = this.get("registration");
      if (registration) {
        context.registration = registration
      }

      return context;
    },

    /**
     * Returns a contextActivities object for this Statement
     * @returns {object}
     */
    getContextActivities: function() {
      return {};
    },

    getIri: function() {
      if (!this.get('activityId') || !this.get('model').get('_type') || this.get('model').get('_id')) {
        return null;
      }

      return [this.get('activityId'), this.get('model').get('_type'), this.get('model').get('_id')].join('/');
    }

  });

});
