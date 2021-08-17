import Adapt from 'core/js/adapt';
import offlineStorage from './adapt-offlineStorage-xapi';
import xAPI from './adapt-contrib-xapi';
  
class xAPIIndex extends Backbone.Controller {
  initialise() {
    this.xAPI = this.xAPI;
    const config = Adapt.config.get('_xapi') || {};

    if (!config._isEnabled) {
      return;
    }

    offlineStorage.load();

    // Wait for offline storage to be restored if _shouldTrackState is enabled
    const successEvent = config._shouldTrackState ? 'xapi:stateLoaded' : 'xapi:lrs:initialize:success';

    // Ensure that the course still loads if there is a connection error
    Adapt.once(`xapi:lrs:initialize:error ${successEvent}`, () => {
      Adapt.offlineStorage.get();
      Adapt.offlineStorage.setReadyStatus();
    });
  }
}

Adapt.on('app:dataLoaded', new xAPIIndex().initialise);
