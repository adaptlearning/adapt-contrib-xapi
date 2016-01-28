var xapiWrapper = {
	lrs: {
		actor: "{\"name\":\"User\", \"mbox\":\"mailto:noreply@learningpool.com\", \"objectType\":\"Agent\"}",
		activityId: "http://catalogue.learningpool.com/v2/items/0123456789",
		endpoint: "http://lrs.learningpool.com/data/xAPI/",
	},

	getState: function(activityid, agent, stateid, registration, since, callback) {
		return null;
	},
	sendStatement: function(stmt, callback) {
		outputStatement(stmt);
		return true;
	},
	sendState: function(activityid, agent, stateid, registration, stateval, matchHash, noneMatchHash, callback) {
		return true;
	},
};

function outputStatement(statement) {
	var a = this.lrs.actor.name;
	var v = statement.verb.display["en-US"];
	var o = statement.object.id;

	console.log("xAPI: \"User " + v + " " + o + "\"");
}