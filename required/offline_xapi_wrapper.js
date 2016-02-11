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

		console.log("xAPI statement sent: \"" + a + " " + v + " " + o + "\"");

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
