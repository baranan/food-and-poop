/**
 * The offline write queue.
 *
 * Apps Script round trips take up to three seconds, and phones lose signal. So
 * no write is ever awaited by the UI: it goes in here, the UI redraws
 * immediately from local state, and this drains in the background.
 *
 * Two rules make it behave:
 *
 *   1. Strict FIFO, stopping at the first failure. An update to a record whose
 *      add has not landed yet must not overtake it.
 *   2. NetworkError is retried forever; anything else is terminal. If the
 *      server understood the request and refused it, retrying will fail the
 *      same way, so the operation is dropped and reported so the UI can undo.
 *
 * The queue survives reloads, which is the whole point -- so it holds plain
 * serialisable data and no callbacks.
 */

import * as api from './api.js';
import { NetworkError } from './errors.js';
import { STORAGE_KEYS } from './config.js';

const MAX_BACKOFF_MS = 30000;
const BASE_BACKOFF_MS = 1000;

export function createQueue({ onPendingChange, onSuccess, onPermanentFailure } = {}) {
  let items = load();
  let flushing = false;
  let timer = null;

  // ---- Persistence -------------------------------------------------------

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.queue) || '[]');
    } catch (err) {
      console.warn('Write queue was corrupt, discarding it.', err);
      return [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEYS.queue, JSON.stringify(items));
    if (onPendingChange) onPendingChange(items.slice());
  }

  // ---- Public surface ----------------------------------------------------

  /**
   * Adds an operation and kicks the drain. `kind` is 'add', 'update' or
   * 'remove'; payload is the record, or the id for a remove.
   */
  function enqueue(kind, payload) {
    items.push({
      qid: crypto.randomUUID(),
      kind: kind,
      payload: payload,
      attempts: 0,
      queuedAt: new Date().toISOString()
    });
    save();
    flush();
  }

  /** The operations still waiting, oldest first. */
  function pending() {
    return items.slice();
  }

  /**
   * Sends whatever is queued, in order, stopping at the first network failure
   * and scheduling a retry with backoff.
   */
  async function flush() {
    if (flushing || items.length === 0) return;
    flushing = true;
    clearTimeout(timer);

    try {
      while (items.length > 0) {
        const item = items[0];
        let result;

        try {
          result = await send(item);
        } catch (err) {
          if (err instanceof NetworkError) {
            // Transient. Leave it at the head of the queue and come back.
            item.attempts += 1;
            save();
            scheduleRetry(item.attempts);
            return;
          }
          // A bug in our own code rather than a transport problem. Treat it as
          // terminal so one bad item cannot block the queue forever.
          drop(item, err);
          continue;
        }

        if (result && result.ok) {
          items.shift();
          save();
          if (onSuccess) onSuccess(item, result);
        } else {
          // The server understood and refused. Retrying cannot help.
          drop(item, new Error((result && result.error) || 'Server refused the write'));
        }
      }
    } finally {
      flushing = false;
    }
  }

  /** Dispatches one queued operation to the API. */
  function send(item) {
    if (item.kind === 'add') return api.add(item.payload);
    if (item.kind === 'update') return api.update(item.payload);
    if (item.kind === 'remove') return api.remove(item.payload);
    return Promise.reject(new Error('Unknown queue operation: ' + item.kind));
  }

  /** Removes a permanently failed operation and tells the store to undo it. */
  function drop(item, error) {
    items = items.filter(function (queued) { return queued.qid !== item.qid; });
    save();
    if (onPermanentFailure) onPermanentFailure(item, error);
  }

  /** Exponential backoff, capped, so a long outage does not hammer the network. */
  function scheduleRetry(attempts) {
    const delay = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempts - 1), MAX_BACKOFF_MS);
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  }

  /** Starts draining, and retries the moment the device reports it is online. */
  function start() {
    window.addEventListener('online', flush);

    // A tab that was backgrounded for hours should catch up when looked at.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) flush();
    });

    flush();
  }

  /** Throws away everything queued. Only for the debug screen. */
  function clear() {
    items = [];
    save();
  }

  return { enqueue, pending, flush, start, clear };
}
