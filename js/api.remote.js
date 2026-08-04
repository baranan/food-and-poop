/**
 * Real implementation of the API, talking to the Apps Script web app.
 *
 * The one non-obvious thing here is the Content-Type. Apps Script does not
 * answer CORS preflight requests, so `application/json` fails outright. Sending
 * `text/plain` keeps the request "simple" in CORS terms, no preflight is made,
 * and the server parses the body with JSON.parse. This is deliberate and
 * documented in CLAUDE.md -- do not change it back.
 */

import { API_URL, TOKEN } from './config.js';
import { NetworkError } from './errors.js';

/**
 * Single transport for all four operations. Everything is a POST with a
 * text/plain body; keeping one code path means one place to get the transport
 * details right.
 */
async function request(payload) {
  let response;

  // Anything that stops the request reaching the server -- offline, DNS, CORS,
  // timeout -- lands here and is retryable.
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ token: TOKEN }, payload)),
      redirect: 'follow'
    });
  } catch (err) {
    throw new NetworkError('Request did not reach the server: ' + err.message);
  }

  if (!response.ok) {
    throw new NetworkError('Server returned HTTP ' + response.status);
  }

  // Apps Script returns an HTML error page rather than JSON when the script
  // itself throws before our handler runs. Treat that as retryable too, since
  // it is usually a transient deployment or quota problem.
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new NetworkError('Server did not return JSON: ' + text.slice(0, 200));
  }
}

// ---------------------------------------------------------------------------
// The four operations. Each returns the server's parsed response as-is.
// ---------------------------------------------------------------------------

export function list() {
  return request({ action: 'list' });
}

export function add(record) {
  return request({ action: 'add', record: record });
}

export function update(record) {
  return request({ action: 'update', record: record });
}

export function remove(id) {
  return request({ action: 'delete', id: id });
}
