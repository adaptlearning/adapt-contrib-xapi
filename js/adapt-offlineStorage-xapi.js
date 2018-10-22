define([
  'core/js/adapt',
  './xapi'
], function(Adapt, XAPI) {

  //xAPI handler for Adapt.offlineStorage interface.

  var store = {};

  Adapt.offlineStorage.initialize({

    get: function(name) {
      if (!name) {
        return this.getAll();
      }

      if (!this.useTemporaryStore() && name.toLowerCase() === 'learnerinfo') {
        return this.getLearnerInfo();
      }

      return store[name];
    },

    getAll: function() {
      //If not connected return just the store.
      if (this.useTemporaryStore()) {
        return store;
      }

      return _.extend(_.clone(store), {
        learnerInfo: this.getLearnerInfo()
      });
    },

    set: function(name, value) {
      if (typeof name === 'object') {
        store = _.extend(store, value);
      } else {
        store[name] = value;
      }

      return true;
    },

    useTemporaryStore: function() {
      var config = Adapt.config.get('_xapi') || {};

      return (!window.xapiWrapper || !config._isEnabled);
    },

    /**
     * @returns {{name: string in the format Firstname Lastname, firstname: string, lastname: string }}
     */
    getLearnerInfo: function() {
      var name = XAPI.getInstance().getLRSAttribute('actor').name;
      var lastname;
      var firstname;

      if (name && name !== 'undefined' && name.indexOf(' ') > -1) {
        var nameSplit = name.split(' ');
        lastname = $.trim(nameSplit[0]);
        firstname = $.trim(nameSplit[1]);
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