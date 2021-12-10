import Adapt from 'core/js/adapt';
import { isCORS } from './Helpers'

/**
 * Send an xAPI statement to the LRS once all async operations are complete
 * @param {ADL.XAPIStatement} statement - A valid ADL.XAPIStatement object.
 * @param {array} [attachments] - An array of attachments to pass to the LRS.
 */
export async function onStatementReady(statement, attachments, xapiWrapper) {
  try {
    await xapiWrapper.sendStatement(statement, attachments);
  } catch (error) {
    Adapt.trigger('xapi:lrs:sendStatement:error', error);
    throw error;
  }
  Adapt.trigger('xapi:lrs:sendStatement:success', statement);
}

/**
 * Process any attachments that have been added to the statement object by
 * intercepting the send operation at the xapi:preSendStatement trigger
 * If a url is specified for an attachment then retrieve the text content
 * and store this instead
 * @param {ADL.XAPIStatement} statement - A valid ADL.XAPIStatement object.
 */
async function processAttachments(statement, xapiWrapper) {
  const attachments = statement.attachments;

  for (let attachment of attachments) {
    await new Promise((resolve, reject) => {
      // First check the attachment for a value
      if (attachment.value) {
        return resolve();
      }

      if (attachment.url) {
        // If a url is specified then we need to obtain the string value
        // Use native xhr so we can set the responseType to 'blob'
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
          if (this.readyState === 4 && this.status === 200) {

            // Use FileReader to retrieve the blob contents as a string
            const reader = new FileReader();
            reader.onload = () => {
              // Store the string value in the attachment object and
              // delete the url property which is no longer needed
              attachment.value = reader.result;
              delete attachment.url;
              return resolve();
            };
            reader.readAsBinaryString(this.response);
          }
        };
        xhr.open('GET', attachment.url);
        xhr.responseType = 'blob';
        xhr.send();
      } else {
        Adapt.log.warn('Attachment object contained neither a value or url property.');
        return resolve();
      }
    });
  }

  delete statement.attachments;
  await onStatementReady(statement, attachments, xapiWrapper);
}

/**
 * Prepares to send a single xAPI statement to the LRS.
 * @param {ADL.XAPIStatement} statement - A valid ADL.XAPIStatement object.
 * @param {array} [attachments] - An array of attachments to pass to the LRS.
 */
export async function sendStatement(xapiWrapper, statement, attachments = null) {
  if (!statement) return;

  Adapt.trigger('xapi:preSendStatement', statement);

  // Allow the trigger above to augment attachments if the attachments
  // parameter is not set.
  if (attachments === undefined && statement.attachments) {
    return await processAttachments(statement, xapiWrapper);
  }
  await onStatementReady(statement, attachments, xapiWrapper);
}

/**
 * Sends multiple xAPI statements to the LRS.
 * @param {ADL.XAPIStatement[]} statements - An array of valid ADL.XAPIStatement objects.
 */
export async function sendStatements(statements) {
  if (!statements || statements.length === 0) {
    return;
  }

  Adapt.trigger('xapi:preSendStatements', statements);

  // Rather than calling the wrapper's sendStatements() function, iterate
  // over each statement and call sendStatement().
  try {
    for (let statement of statements) {
      await this.sendStatement(statement);
    }
  } catch (error) {
    Adapt.log.error('adapt-contrib-xapi:', error);
    throw error;
  }
}

/**
 * Sends statements using the Fetch API in order to make use of the keepalive
 * feature not available in AJAX requests. This makes the sending of suspended
 * and terminated statements more reliable.
 */
export async function sendStatementsSync(statements) {
  const lrs = window.ADL.XAPIWrapper.lrs;

  // Fetch not supported in IE and keepalive/custom headers
  // not supported for CORS preflight requests so attempt
  // to send the statement in the usual way
  if (!window.fetch || isCORS(lrs.endpoint)) {
    return sendStatements(statements);
  }

  let url = lrs.endpoint + 'statements';
  const credentials = window.ADL.XAPIWrapper.withCredentials ? 'include' : 'omit';
  const headers = {
    'Content-Type': 'application/json',
    Authorization: lrs.auth,
    'X-Experience-API-Version': window.ADL.XAPIWrapper.xapiVersion
  };

  // Add extended LMS-specified values to the URL
  const extended = lrs.extended.map((value, key) => {
    return key + '=' + encodeURIComponent(value);
  });

  if (extended.length > 0) {
    url += (url.indexOf('?') > -1 ? '&' : '?') + extended.join('&');
  }

  try {
    await fetch(url, {
      body: JSON.stringify(statements),
      cache: 'no-cache',
      credentials,
      headers,
      mode: 'same-origin',
      keepalive: true,
      method: 'POST'
    });
  } catch (error) {
    Adapt.trigger('xapi:lrs:sendStatement:error', error);
    return;
  }
  Adapt.trigger('xapi:lrs:sendStatement:success', statements);
}
