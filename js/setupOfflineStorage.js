import Adapt from 'core/js/adapt';
import XAPI from './XAPI';

// xAPI handler for Adapt.offlineStorage interface.
export default function setupOfflineStorage() {
  // Use a lightweight fake model to pass into xAPI.sendState
  const fakeModel = {
    get() {
      return 'offlineStorage';
    }
  };

  const store = new Backbone.Model();
  let isDataRestored = false;

  Adapt.offlineStorage.initialize({

    get(name) {
      if (!name) {
        return this.getAll();
      }

      if (!this.useTemporaryStore() && name.toLowerCase() === 'learnerinfo') {
        return this.getLearnerInfo();
      }

      return store.get(name);
    },

    getAll() {
      if (!isDataRestored) {
        const state = XAPI.get('state') || {};
        store.set(state.offlineStorage);
        isDataRestored = true;
      }

      // If not connected return just the store.
      if (this.useTemporaryStore()) {
        return store.toJSON();
      }

      return _.extend(store.toJSON(), {
        learnerInfo: this.getLearnerInfo()
      });
    },

    set(name, value) {
      store.set(name, value);

      // xAPI may not yet be initialised so use a soft trigger rather than hard calling xAPI.sendState
      Adapt.trigger('state:change', fakeModel, store.toJSON());
    },

    useTemporaryStore() {
      return !XAPI.get('isInitialised');
    },

    /**
     * @returns {{id: string, name: string, firstname: string, lastname: string}} The learner's id, full name (in the format Firstname Lastname), first and last names
     */
    getLearnerInfo() {
      const actor = XAPI.get('actor') || {};
      const name = actor.name || '';
      let lastname;
      let firstname;
      const matches = name.match(/(\S+)\s(.+)/);

      if (matches?.length > 2) {
        lastname = matches[2];
        firstname = matches[1];
      } else {
        console.log('xAPI: actor name not in "firstname lastname" format');
      }

      return {
        id: this.getLearnerId(actor),
        name,
        lastname,
        firstname
      };
    },

    /**
     * Get the learner's id by checking the actor properties in the order 'name', 'openid', 'mbox'
     * @param {object} actor
     * @return {string} the learner's unique id
     */
    getLearnerId(actor) {
      const name = actor.account?.name;

      if (name) {
        return name;
      }

      if (actor.openid) {
        return actor.openid;
      }

      if (typeof actor.mbox === 'string' && actor.mbox.length > 0) {
        return actor.mbox.replace('mailto:', '');
      }

      console.log('xAPI: could not determine the learner\'s ID');

      return null;
    }

  });
}
