define([
  'core/js/adapt',
  './xapi',
  './adapt-offlineStorage-xapi'
], function(Adapt, XAPI) {

  Adapt.once('offlineStorage:prepare', onPrepareOfflineStorage);

  function onPrepareOfflineStorage() {
    var config = Adapt.get('_xapi') || {};

    if (!config._isEnabled) {
      return Adapt.offlineStorage.setReadyStatus();
    }

    Adapt.offlineStorage.get();

    Adapt.offlineStorage.setReadyStatus();
  }

});