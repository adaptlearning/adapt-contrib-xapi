import Adapt from 'core/js/adapt';

/**
 * Converts milliseconds to an ISO8601 duration
 * @param {int} inputMilliseconds - Duration in milliseconds
 * @return {string} - Duration in ISO8601 format
 */
export function convertMillisecondsToISO8601Duration(inputMilliseconds) {
  const iInputMilliseconds = parseInt(inputMilliseconds, 10);
  let inputIsNegative = '';
  let rtnStr = '';

  // Round to nearest 0.01 seconds.
  let iInputCentiseconds = Math.round(iInputMilliseconds / 10);

  if (iInputCentiseconds < 0) {
    inputIsNegative = '-';
    iInputCentiseconds = iInputCentiseconds * -1;
  }

  const hours = parseInt(((iInputCentiseconds) / 360000), 10);
  const minutes = parseInt((((iInputCentiseconds) % 360000) / 6000), 10);
  const seconds = (((iInputCentiseconds) % 360000) % 6000) / 100;

  rtnStr = inputIsNegative + 'PT';
  if (hours > 0) {
    rtnStr += hours + 'H';
  }

  if (minutes > 0) {
    rtnStr += minutes + 'M';
  }

  rtnStr += seconds + 'S';

  return rtnStr;
}
/**
 * Gets the URL the course is currently running on.
 * @return {string} The URL to the current course.
 */
export function getBaseUrl() {
  const url = window.location.origin + window.location.pathname;

  Adapt.log.info(`adapt-contrib-xapi: Using detected URL (${url}) as ActivityID`);

  return url;
}

/**
 * Retrieve a config item for the current course, e.g. '_activityID'.
 * @param {string} key - The data attribute to fetch.
 * @return {object|boolean} The attribute value, or false if not found.
 */
export function getConfig(key) {
  const config = Adapt.config?.get('_xapi');
  if (!config || key === '' || typeof config[key] === 'undefined') {
    return false;
  }

  return config[key];
}

/**
 * Replace the hard-coded _learnerInfo data in _globals with the actual data from the LRS.
 */
export function getLearnerInfo() {
  const globals = Adapt.course.get('_globals');

  if (!globals._learnerInfo) {
    globals._learnerInfo = {};
  }

  Object.assign(globals._learnerInfo, Adapt.offlineStorage.get('learnerinfo'));
}

/**
 * Determine if sending the statement involves a Cross Origin Request
 * @param {string} url - the lrs endpoint
 * @returns {boolean}
 */
export function isCORS(url) {
  const urlparts = url.toLowerCase().match(/^(.+):\/\/([^:]*):?(\d+)?(\/.*)?$/);
  let isCORS = (location.protocol.toLowerCase().replace(':', '') !== urlparts[1] || location.hostname.toLowerCase() !== urlparts[2]);
  if (isCORS) return true;
  const urlPort = (urlparts[3] === null ? (urlparts[1] === 'http' ? '80' : '443') : urlparts[3]);
  isCORS = (urlPort === location.port);

  return isCORS;
}

function getGlobals() {
  return _.defaults(
    (
      Adapt?.course?.get('_globals')?._extensions?._xapi
    ) || {},
    {
      confirm: 'OK',
      lrsConnectionErrorTitle: 'LRS not available',
      lrsConnectionErrorMessage: 'We were unable to connect to your Learning Record Store (LRS). This means that your progress cannot be recorded.'
    }
  );
}

export function showError() {
  if (getConfig('_lrsFailureBehaviour') === 'ignore') return;

  const notifyObject = {
    title: getGlobals().lrsConnectionErrorTitle,
    body: getGlobals().lrsConnectionErrorMessage,
    confirmText: getGlobals().confirm
  };

  // Setup wait so that notify does not get dismissed when the page loads
  Adapt.wait.begin();
  Adapt.notify.alert(notifyObject);
  // Ensure notify appears on top of the loading screen
  $('.notify').css({ position: 'relative', zIndex: 5001 });
  Adapt.once('notify:closed', Adapt.wait.end);
}

/**
 * Gets the activity type for a given model.
 * @param {Backbone.Model} model - An instance of Adapt.Model (or Backbone.Model).
 * @return {string} A URL to the current activity type.
 */
export function getActivityType(model) {
  let type = '';

  switch (model.get('_type')) {
    case 'component': {
      type = model.get('_isQuestionType') ? window.ADL.activityTypes.interaction : window.ADL.activityTypes.media;
      break;
    }
    case 'block':
    case 'article': {
      type = window.ADL.activityTypes.interaction;
      break;
    }
    case 'course': {
      type = window.ADL.activityTypes.course;
      break;
    }
    case 'menu': {
      type = window.ADL.activityTypes.module;
      break;
    }
    case 'page': {
      type = window.ADL.activityTypes.lesson;
      break;
    }
  }

  return type;
}

/**
 * Removes the HTML tags/attributes and returns a string.
 * @param {string} html - A string containing HTML
 * @returns {string} The same string minus HTML
 */
export function stripHtml(html) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  return tempDiv.textContent || tempDiv.innerText || '';
}

/**
 * In order to support SCORM 1.2 and SCORM 2004, some of the components return a non-standard
 * response.
 * @param {string} responseType - The type of the response.
 * @param {string} response - The unprocessed response string.
 * @returns {string} A response formatted for xAPI compatibility.
 */
export function processInteractionResponse(responseType, response) {
  switch (responseType) {
    case 'choice': {
      response = response.replace(/,|#/g, '[,]');

      break;
    }
    case 'matching': {
      // Example: 1[.]1_1[,]2[.]2_5
      response = response
        .split('#')
        .map((val, i) => {
          return (i + 1) + '[.]' + val.replace('.', '_');
        })
        .join('[,]');
      break;
    }
  }

  return response;
}

/**
 * Takes an assessment state and returns a results object based on it.
 * @param {object} assessment - An instance of the assessment state.
 * @return {object} - A result object containing score, success and completion properties.
 */
export function getAssessmentResultObject(assessment) {
  return {
    score: {
      scaled: (assessment.scoreAsPercent / 100),
      raw: assessment.score,
      min: 0,
      max: assessment.maxScore
    },
    success: assessment.isPass,
    completion: assessment.isComplete
  };
}
