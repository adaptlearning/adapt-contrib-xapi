var actor = {
  "objectType": "Agent",
  "name": "Testy McTestface",
  "account": {
    "homePage": "http://www.example.com/users",
    "name": "1234567890"
  }
};

window.xapiWrapper = Object.create(window.ADL.XAPIWrapper);

Object.assign(window.xapiWrapper, {
  lrs: {
    actor: JSON.stringify(actor)
  },

  getState: function(activityid, agent, stateid, registration, since, callback) {
    var existingState = Cookies.get(stateid);

    if (existingState) {
      return callback(null, {
        status: 200,
        response: existingState
      });
    }

    return callback(null, {
      status: 404,
      response: null
    });
  },

  sendStatement: function(stmt, callback) {
    console.log("xAPI statement sent:");
    console.log(JSON.stringify(stmt));
    return callback();
  },

  sendState: function(activityid, agent, stateid, registration, stateval, matchHash, noneMatchHash, callback) {
    console.log("xAPI state sent - " + stateid + ":");
    console.log(stateval);

    Cookies.set(stateid, stateval);

    return true;
  },

  updateAuth: function(a, b, c) {
    return true;
  }
});

window.ADL.launch = function(cb, terminate_on_unload, strict_callbacks) {
  return cb(null, {
    actor: actor,
    endpoint: 'http://launch-server.example.com'
  }, window.xapiWrapper);
};

window.ADL = Object.freeze(window.ADL);
