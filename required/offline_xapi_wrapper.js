var xapiWrapper = {
	lrs: {
		actor: "{\"objectType\": \"Agent\",\"account\": {\"homePage\": \"http://www.example.com\",\"name\": \"1625378\"}}",
		activityId: "http://www.example.com/LA1/001/intro",
		endpoint: "http://lrs.example.com/lrslistener/",
	},

	getState: function(activityid, agent, stateid, registration, since, callback) {
		return null;
	},

	sendStatement: function(stmt, callback) {
		var a = this.lrs.actor.name;
		var v = statement.verb.display["en-US"];
		var o = statement.object.id;

		console.log("xAPI: \"" + a + " " + v + " " + o + "\"");

		return true;
	},

	sendState: function(activityid, agent, stateid, registration, stateval, matchHash, noneMatchHash, callback) {
		console.log("xAPI: State sent to LRS");
		console.log(stateval);

		return true;
	},
};