define([
  'core/js/adapt',
  './adapt-contrib-xapi',
  './adapt-offlineStorage-xapi'
], function(Adapt) {

  Adapt.on('app:dataLoaded', initialise);

  function initialise() {
    var config = Adapt.config.get('_xapi') || {};
    
    if (!config._isEnabled) {
      return Adapt.offlineStorage.setReadyStatus();
    }

    Adapt.wait.begin();

    Adapt.once('xapi:stateLoaded xapi:lrs:initialize:error', function() {
      Adapt.offlineStorage.get();
      Adapt.offlineStorage.setReadyStatus();
      Adapt.wait.end();
    });

  }

});