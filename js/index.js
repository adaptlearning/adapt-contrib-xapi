define([
  'core/js/adapt',
  './adapt-offlineStorage-xapi',
  './adapt-contrib-xapi'
], function(Adapt, OfflineStorage) {

  Adapt.on('app:dataLoaded', initialise);

  Adapt.once('offlineStorage:ready', readyOfflineStorage);

  Adapt.on('offlineStorage:prepare', prepareOfflineStorage);

  function prepareOfflineStorage() {
    console.log('in prepare offline');
    console.log(Adapt.offlineStorage);
    Adapt.offlineStorage.initialize(OfflineStorage);
    console.log(Adapt.offlineStorage);
  }

  function readyOfflineStorage() {
    const config = Adapt.config.get('_xapi') || {};

    if (!config._isEnabled) {
      return;
    }

    Adapt.offlineStorage.get();
    Adapt.offlineStorage.setReadyStatus();
    console.log('here');
    console.log(Adapt.offlineStorage);
  }

  function initialise() {
    const config = Adapt.config.get('_xapi') || {};

    if (!config._isEnabled) {
      return;
    }

    // Wait for offline storage to be restored if _shouldTrackState is enabled
    const successEvent = config._shouldTrackState ? 'xapi:stateLoaded' : 'xapi:lrs:initialize:success';

    // Ensure that the course still loads if there is a connection error
    Adapt.once('xapi:lrs:initialize:error ' + successEvent, function() {
      Adapt.offlineStorage.get();
      Adapt.offlineStorage.setReadyStatus();
    });
  }
});