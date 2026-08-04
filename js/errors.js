/**
 * Shared error types.
 *
 * Lives in its own module so that api.mock.js and api.remote.js can both throw
 * the same thing without one importing the other. The write queue decides
 * whether to retry based on this distinction, so mock mode has to be able to
 * reproduce it faithfully.
 */

/**
 * The request never reached the server, or the server's answer was unusable.
 * Retryable: queue it and try again later.
 *
 * Anything else -- a response with `ok: false` -- means the server understood
 * and refused. Not retryable; retrying would just fail identically.
 */
export class NetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NetworkError';
  }
}
