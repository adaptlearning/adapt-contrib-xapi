var xapiWrapper = {
  lrs: {
    actor: "{\"objectType\": \"Agent\",\"account\": {\"homePage\": \"http://www.example.com\",\"name\": \"1625378\"}}",
    activity_id: "http://www.example.com/LA1/001/intro",
    endpoint: "http://lrs.example.com/lrslistener/",
  },

  getState: function(activityid, agent, stateid, registration, since, callback) {
    return null;
  },

  sendStatement: function(stmt, callback) {
    var a = stmt.actor.account.name;
    var v = stmt.verb.display["en-US"];
    var o = stmt.object.id;
    var r = stmt.result;

    var message = "xAPI statement sent: " + a + " " + v + " " + o;

    if (r && r.score) {
      if (r.score.scaled) {
        message += " with a scaled score of " + r.score.scaled;
      } else if (r.score.raw) {
        message += " with a raw score of " + r.score.raw;
      }
    }

    console.log(message);

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
