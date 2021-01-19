define([
  'core/js/adapt',
  './adapt-offlineStorage-xapi',
  './adapt-contrib-xapi'
], function(Adapt, OfflineStorage) {

  Adapt.on('app:dataLoaded', initialise);

  function initialise() {
    const config = Adapt.config.get('_xapi') || {};

    if (!config._isEnabled) {
      return;
    }

    Adapt.offlineStorage.initialize(OfflineStorage);
    dapt.offlineStorage.setReadyStatus();

    // Wait for offline storage to be restored if _shouldTrackState is enabled
    const successEvent = config._shouldTrackState ? 'xapi:stateLoaded' : 'xapi:lrs:initialize:success';

    // Ensure that the course still loads if there is a connection error
    Adapt.once('xapi:lrs:initialize:error ' + successEvent, function() {
      Adapt.offlineStorage.get();
      Adapt.offlineStorage.setReadyStatus();
    });
  }

});