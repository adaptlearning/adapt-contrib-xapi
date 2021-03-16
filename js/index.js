define([
  'core/js/adapt',
  './adapt-offlineStorage-xapi',
  './adapt-contrib-xapi',
], function(Adapt, offlineStorage) {

  Adapt.on('app:dataLoaded', initialise);

  function initialise() {
    var config = Adapt.config.get('_xapi') || {};

    if (!config._isEnabled) {
      return;
    }

    offlineStorage.load();

    // Wait for offline storage to be restored if _shouldTrackState is enabled
    var successEvent = config._shouldTrackState ? 'xapi:stateLoaded' : 'xapi:lrs:initialize:success';

    // Ensure that the course still loads if there is a connection error
    Adapt.once('xapi:lrs:initialize:error ' + successEvent, function() {
      Adapt.offlineStorage.get();
      Adapt.offlineStorage.setReadyStatus();
    });
  }

});
