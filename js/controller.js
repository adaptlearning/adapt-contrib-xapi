import Adapt from 'core/js/adapt';
import setupOfflineStorage from './setupOfflineStorage';
import XAPI from './XAPI';
import { showError } from './Helpers';

class XAPIController extends Backbone.Controller {

  initialize() {
    this.listenTo(Adapt, 'app:dataLoaded', this.onDataLoaded);
  }

  onDataLoaded() {
    const config = Adapt.config.get('_xapi') || {};

    if (!config._isEnabled) return;

    this.setupXapi();
  }

  setupXapi() {
    const xapi = new XAPI();

    xapi.listenTo(Adapt, {
      'adapt:initialize': xapi.setupListeners,
      'xapi:lrs:initialize:error': error => {
        Adapt.log.error('adapt-contrib-xapi: xAPI Wrapper initialisation failed', error);
        showError();
      },
      'xapi:lrs:sendStatement:error xapi:lrs:sendState:error': showError
    });

    setupOfflineStorage(xapi);

    // Wait for offline storage to be restored if _shouldTrackState is enabled
    const successEvent = Adapt.config.get('_xapi')._shouldTrackState ? 'xapi:stateLoaded' : 'xapi:lrs:initialize:success';

    // Ensure that the course still loads if there is a connection error
    this.listenToOnce(Adapt, `xapi:lrs:initialize:error ${successEvent}`, this.onLRSReady);
  }

  onLRSReady() {
    Adapt.offlineStorage.get();
    Adapt.offlineStorage.setReadyStatus();
  }

}

export default new XAPIController();
