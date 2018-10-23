define([
  'core/js/adapt',
  './adapt-contrib-xapi',
  './adapt-offlineStorage-xapi'
], function(Adapt) {

  Adapt.once('xapi:stateLoaded', onPrepareOfflineStorage);

  function onPrepareOfflineStorage() {
    var config = Adapt.config.get('_xapi') || {};

    if (config._isEnabled) {
      Adapt.offlineStorage.get();
    }

    Adapt.offlineStorage.setReadyStatus();
  }

});