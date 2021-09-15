import Adapt from 'core/js/adapt';
import setupOfflineStorage from './setupOfflineStorage';

class XAPIIndex extends Backbone.Controller {

  initialize() {
    this.listenTo(Adapt, 'app:dataLoaded', this.onDataLoaded);
  }

  onDataLoaded() {
    const config = Adapt.config.get('_xapi') || {};

    if (!config._isEnabled) {
      return;
    }

    setupOfflineStorage();

    // Wait for offline storage to be restored if _shouldTrackState is enabled
    const successEvent = config._shouldTrackState ? 'xapi:stateLoaded' : 'xapi:lrs:initialize:success';

    // Ensure that the course still loads if there is a connection error
    this.listenToOnce(`xapi:lrs:initialize:error ${successEvent}`, this.onLRSReady);
  }

  onLRSReady() {
    Adapt.offlineStorage.get();
    Adapt.offlineStorage.setReadyStatus();
  }

}

export default new XAPIIndex();
