var actor = {
  "objectType": "Agent",
  "account": {
    "homePage": "http://www.example.com",
    "name": "1625378"
  }
};

window.xapiWrapper = Object.create(window.ADL.XAPIWrapper);

Object.assign(window.xapiWrapper, {
  lrs: {
    actor: JSON.stringify(actor),
    activity_id: "http://www.example.com/LA1/001/intro",
    endpoint: "http://lrs.example.com/lrslistener/",
    registration: "760e3480-ba55-4991-94b0-01820dbd23a2"
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