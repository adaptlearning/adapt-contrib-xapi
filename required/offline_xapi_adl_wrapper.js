var actor = {
  objectType: "Agent",
  name: 'Testy McTestface',
  account:
    {
      'homePage': 'http://www.example.com/users',
      'name': 1234567890
    }
};

var xapiWrapper = {
  lrs: {
    actor: JSON.stringify(actor),
    activity_id: "http://www.example.com/LA1/001/intro",
    endpoint: "",
    registration: "760e3480-ba55-4991-94b0-01820dbd23a2"
  },

  getState: function(activityid, agent, stateid, registration, since, callback) {
    if (typeof callback !== 'function') {
      callback = function() {};
    }
    
    return callback(null, { status: 200, response: '[]' });
  },

  sendStatement: function(stmt, callback) {
    this.sendStatementCount = this.sendStatementCount || 1;
    this.sendStatementCount++;

    if (typeof callback !== 'function') {
      callback = function() {};
    }

    if (this.sendStatementCount > 10) {
      return callback(new Error());
    }
    
    console.log("xAPI statement sent:");
    console.log(JSON.stringify(stmt));
    return callback();
  },

  sendState: function(activityid, agent, stateid, registration, stateval, matchHash, noneMatchHash, callback) {
    this.sendStateCount = this.sendStateCount || 1;
    this.sendStateCount++;

    if (typeof callback !== 'function') {
      callback = function() {};
    }

    if (this.sendStateCount > 10) {
      return callback(new Error());
    }

    console.log("xAPI state sent:");
    console.log(stateval);
    return callback();
  },

  updateAuth: function(a, b, c) {
    return true;
  }
};

window.ADL.launch = function(callback) {
  return callback(null, {
    actor: actor,
    endpoint: 'http://launch-server.example.com'
  }, xapiWrapper);
};

window.ADL = Object.freeze(window.ADL);

// Note: remove the endpoint to use the ADL launch method