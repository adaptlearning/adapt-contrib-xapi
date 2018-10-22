define([
  'core/js/adapt',
  './xapi',
  './adapt-offlineStorage-xapi'
], function(Adapt) {

  Adapt.once('xapi:stateLoaded', onPrepareOfflineStorage);

  function onPrepareOfflineStorage() {
    var config = Adapt.config.get('_xapi') || {};

    if (!config._isEnabled) {
      return Adapt.offlineStorage.setReadyStatus();
    }

    Adapt.offlineStorage.get();
    Adapt.offlineStorage.setReadyStatus();
  }

});