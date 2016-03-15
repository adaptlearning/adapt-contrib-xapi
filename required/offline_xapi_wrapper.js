var xapiWrapper = {
  lrs: {
    actor: "{\"objectType\": \"Agent\",\"account\": {\"homePage\": \"http://www.example.com\",\"name\": \"1625378\"}}",
    activity_id: "http://www.example.com/LA1/001/intro",
    endpoint: "http://lrs.example.com/lrslistener/",
    registration: "760e3480-ba55-4991-94b0-01820dbd23a2"
  },

  getState: function(activityid, agent, stateid, registration, since, callback) {
    return null;
  },

  sendStatement: function(stmt, callback) {
    console.log("xAPI statement sent:");
    console.log(JSON.stringify(stmt));
    return true;
  },

  sendState: function(activityid, agent, stateid, registration, stateval, matchHash, noneMatchHash, callback) {
    console.log("xAPI state sent:");
    console.log(stateval);

    return true;
  },

  updateAuth: function(a, b, c) {
    return true;
  }
};
