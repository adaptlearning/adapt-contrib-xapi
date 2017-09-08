
module.exports = function(fs, path, log, options, done) {
  var async = require('async');
  var pathToCourseFolder = path.join(process.cwd(), options.outputdir, 'course');
  var configJson;

  async.series([
    // Retrieve the config.json file.
    function(callback) {
      fs.readFile(path.join(pathToCourseFolder, 'config.json'), function(err, data) {
        if (err) {
          return callback(err);
        }

        configJson = JSON.parse(data.toString());
        callback();
      });
    },
    // Remove tincan.xml or cmi5.xml, depending on the configuration.
    function(callback) {
      if (!configJson._xapi || !configJson._xapi._isEnabled) {
        log('xAPI settings not found or not enabled');
        return callback();
      }

      // xAPI has been enabled, check if the activityID has been set.
      if (configJson._xapi.hasOwnProperty('_activityID') && configJson._xapi._activityID == '') {
        log('WARNING: xAPI activityID has not been set');
      }

      // cmi5 is a profile of the xAPI specification and some systems, e.g. SCORM Cloud
      // do not work well with both manifest types, so remove the one which is not being used.
      if (!configJson._xapi.hasOwnProperty('_specification') || configJson._xapi._specification === 'xAPI') {
        // TODO - This will change once cmi5 is supported.
        // Remove the cmi5.xml file (default behaviour).
        // fs.unlink(path.join(options.outputdir, 'cmi5.xml'), callback);
        callback();
      } else if (configJson._xapi._specification === 'cmi5') {
        // Remove the tincan.xml file.
        fs.unlink(path.join(options.outputdir, 'tincan.xml'), callback);
      }
    }
  ], function(err, info) {
    if (err) {
      return done(err);
    }

    done();
  });
};