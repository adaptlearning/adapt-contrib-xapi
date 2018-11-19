define([
  'core/js/adapt',
  './adapt-contrib-xapi'
], function(Adapt, xapi) {

  //xAPI handler for Adapt.offlineStorage interface.

  // Use a lightweight fake model to pass into xAPI.sendState
  var fakeModel = {
    get: function() {
      return 'offlineStorage';
    }
  };

  var store = new Backbone.Model();
  var isDataRestored = false;

  Adapt.offlineStorage.initialize({

    get: function(name) {
      if (!name) {
        return this.getAll();
      }

      if (!this.useTemporaryStore() && name.toLowerCase() === 'learnerinfo') {
        return this.getLearnerInfo();
      }

      return store.get(name);
    },

    getAll: function() {
      if (!isDataRestored) {
        var state = xapi.get('state') || {};
        store.set(state.offlineStorage);
        isDataRestored = true;
      }

      //If not connected return just the store.
      if (this.useTemporaryStore()) {
        return store.toJSON();
      }

      return _.extend(store.toJSON(), {
        learnerInfo: this.getLearnerInfo()
      });
    },

    set: function(name, value) {
      store.set(name, value);

      // xAPI may not yet be initialised so use a soft trigger rather than hard calling xAPI.sendState
      Adapt.trigger('state:change', fakeModel, store.toJSON());
    },

    useTemporaryStore: function() {
      return !xapi.get('isInitialised');
    },

    /**
     * @returns {{name: string in the format Firstname Lastname, firstname: string, lastname: string }}
     */
    getLearnerInfo: function() {
      var actor = xapi.get('actor') || {};
      var name = actor.name || '';
      var lastname;
      var firstname;
      var matches = name.match(/(\S+)\s(.+)/);

      if (matches && matches.length > 2) {
        lastname = matches[2];
        firstname = matches[1];
      } else {
        console.log('xAPI: actor name not in "firstname lastname" format');
      }

      return {
        name: name,
        lastname: lastname,
        firstname: firstname
      };
    }

  });

});