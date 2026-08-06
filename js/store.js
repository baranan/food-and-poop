/**
 * Application state, and the only place the UI reads data from.
 *
 * The central idea is that the visible rows are always *derived*, never edited
 * in place:
 *
 *     visible rows  =  last known server rows  +  everything still queued
 *
 * So an optimistic write is just an item in the queue, and undoing one is just
 * removing it and recomputing. There is no separate "pending" copy of a record
 * to keep in sync, and a reload with unsent writes still shows them, because
 * the queue is persisted.
 */

import * as api from './api.js';
import { createQueue } from './queue.js';
import { STORAGE_KEYS } from './config.js';
import {
  countItemSlots, readRecord, frequentItemNames, itemNamesForType, normalizeTime
} from './records.js';

// ---------------------------------------------------------------------------
// State.
// ---------------------------------------------------------------------------

const state = {
  headers: [],
  slotCount: 0,
  serverRows: [],   // last known truth from the sheet
  rows: [],         // serverRows with queued operations applied
  loaded: false,
  loadError: null,
  pending: [],
  lastError: null
};

// True while a load is in flight, so overlapping triggers collapse into one.
let loading = false;

const listeners = new Set();

/** Subscribe to any change. Returns an unsubscribe function. */
export function subscribe(listener) {
  listeners.add(listener);
  return function () { listeners.delete(listener); };
}

function notify() {
  listeners.forEach(function (listener) { listener(getState()); });
}

/** A read-only snapshot for the UI to render from. */
export function getState() {
  return {
    headers: state.headers.slice(),
    slotCount: state.slotCount,
    rows: state.rows.slice(),
    loaded: state.loaded,
    loadError: state.loadError,
    pendingCount: state.pending.length,
    lastError: state.lastError
  };
}

// ---------------------------------------------------------------------------
// Deriving the visible rows.
// ---------------------------------------------------------------------------

/**
 * Replays queued operations on top of the server's rows, in order. This is what
 * makes writes appear instantly and survive a reload while still unsent.
 */
function applyPending(serverRows, pendingItems) {
  let rows = serverRows.slice();

  pendingItems.forEach(function (item) {
    if (item.kind === 'add') {
      // A refresh can return a row whose add is still sitting in the queue --
      // the write landed but onSuccess has not run yet. Pushing again would
      // show the same meal twice, so only add it when it is not already here.
      const alreadyThere = rows.some(function (row) { return row.id === item.payload.id; });
      if (!alreadyThere) rows.push(item.payload);
    } else if (item.kind === 'update') {
      rows = rows.map(function (row) {
        return row.id === item.payload.id ? Object.assign({}, row, item.payload) : row;
      });
    } else if (item.kind === 'remove') {
      rows = rows.filter(function (row) { return row.id !== item.payload; });
    }
  });

  // Everything sorts on event time -- never on created_at, and never on the
  // order rows happen to sit in the sheet.
  rows.sort(function (a, b) { return String(a.time).localeCompare(String(b.time)); });
  return rows;
}

function recompute() {
  state.pending = queue.pending();
  state.rows = applyPending(state.serverRows, state.pending);
  notify();
}

// ---------------------------------------------------------------------------
// The queue, wired to keep server rows and the derived view honest.
// ---------------------------------------------------------------------------

const queue = createQueue({
  onPendingChange: function () {
    recompute();
  },

  // A write landed. Fold it into the server rows so it stops being "pending"
  // without the row flickering out of existence.
  onSuccess: function (item, result) {
    if (item.kind === 'add' && result.record) {
      state.serverRows = state.serverRows
        .filter(function (row) { return row.id !== result.record.id; })
        .concat([result.record]);
    } else if (item.kind === 'update' && result.record) {
      state.serverRows = state.serverRows.map(function (row) {
        return row.id === result.record.id ? result.record : row;
      });
    } else if (item.kind === 'remove') {
      state.serverRows = state.serverRows.filter(function (row) { return row.id !== item.payload; });
    }
    recompute();
  },

  // The server refused. The optimistic change has already been removed from the
  // queue, so recomputing is the undo; we only need to surface why.
  onPermanentFailure: function (item, error) {
    state.lastError = {
      message: error.message,
      kind: item.kind,
      at: new Date().toISOString()
    };
    console.error('Write dropped:', item, error);
    recompute();
  }
});

// ---------------------------------------------------------------------------
// Loading.
// ---------------------------------------------------------------------------

/**
 * Remembers the header row, so a later cold start with no network still knows
 * the schema. Without this, slotCount would be 0 offline and an entry logged
 * then would sync with all of its items missing.
 */
function cacheSchema(headers) {
  state.headers = headers;
  state.slotCount = countItemSlots(headers);
  try {
    localStorage.setItem(STORAGE_KEYS.headers, JSON.stringify(headers));
  } catch (err) {
    console.warn('Could not cache the header row.', err);
  }
}

/** Falls back to the last header row we saw. Returns true if one was found. */
function restoreCachedSchema() {
  if (state.headers.length > 0) return true;

  try {
    const cached = JSON.parse(localStorage.getItem(STORAGE_KEYS.headers) || 'null');
    if (Array.isArray(cached) && cached.length > 0) {
      state.headers = cached;
      state.slotCount = countItemSlots(cached);
      return true;
    }
  } catch (err) {
    console.warn('Cached header row was unreadable.', err);
  }
  return false;
}

/**
 * Rewrites a row's `time` into ISO if someone typed it by hand. Returns the
 * original object when nothing changed, so an untouched sheet costs no copies.
 */
function withNormalizedTime(row) {
  const normalized = normalizeTime(row.time);
  return normalized === row.time ? row : Object.assign({}, row, { time: normalized });
}

/**
 * Fetches everything from the sheet and discovers the schema from its header
 * row. Safe to call again -- a refresh keeps any still-queued writes visible.
 *
 * A failure here is not fatal: the app stays usable, writing into the queue
 * against the cached schema, and catches up when the network returns.
 */
export async function load() {
  // Foreground, reconnect and startup can all ask at once. One at a time is
  // enough, and it keeps us well inside the Apps Script quota.
  if (loading) return;
  loading = true;

  try {
    const result = await api.list();

    if (!result.ok) {
      state.loadError = result.error || 'Unknown error';
      state.loaded = true;
      restoreCachedSchema();
      recompute();
      return;
    }

    cacheSchema(result.headers);
    state.serverRows = result.rows.map(withNormalizedTime);
    state.loadError = null;
    state.loaded = true;
    recompute();
  } catch (err) {
    // Offline on a cold start. Anything already queued is still shown, so the
    // app is usable; it just has no history behind it yet.
    state.loadError = err.message;
    state.loaded = true;
    restoreCachedSchema();
    recompute();
  } finally {
    loading = false;
  }
}

/**
 * True when the schema is known well enough to write an entry -- either from a
 * successful load or from the cache. The entry forms should refuse to save when
 * this is false, rather than write items into columns that may not exist.
 */
export function schemaKnown() {
  return state.slotCount > 0;
}

/**
 * Begins draining the queue, and starts keeping the read side fresh.
 *
 * Nothing pushes from the sheet, so this device's copy goes stale the moment
 * the other phone writes. We re-read at the two moments it matters: when the
 * app is brought back into view, and when the device reconnects.
 *
 * Deliberately not a timer. A 60s poll from three devices is roughly 4300 calls
 * a day, and at one to three seconds each that alone would approach the Apps
 * Script daily runtime limit -- so the app would break in the evening, every
 * day, for no benefit. Two phones open side by side still will not see each
 * other live; switching away and back is the fix, and that is a fair trade.
 */
export function start() {
  queue.start();

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) load();
  });

  window.addEventListener('online', function () { load(); });
}

// ---------------------------------------------------------------------------
// Writes. All three return immediately; nothing here awaits the network.
// ---------------------------------------------------------------------------

export function addEntry(record) {
  queue.enqueue('add', record);
  return record;
}

/**
 * A partial update: pass the id plus whatever changed. Fields left out are
 * untouched, matching how the server merges.
 */
export function updateEntry(record) {
  queue.enqueue('update', record);
  return record;
}

export function deleteEntry(id) {
  queue.enqueue('remove', id);
  return id;
}

// ---------------------------------------------------------------------------
// Selectors. The UI should ask these rather than filter rows itself.
// ---------------------------------------------------------------------------

/** Entries of one type, oldest first, as entry objects rather than raw rows. */
export function entriesOfType(type) {
  return state.rows
    .filter(function (row) { return row.type === type; })
    .map(function (row) { return readRecord(row, state.slotCount); });
}

/** Every entry, oldest first, as entry objects. Feeds the history timeline. */
export function allEntries() {
  return state.rows.map(function (row) { return readRecord(row, state.slotCount); });
}

/** One entry by id, or null. */
export function entryById(id) {
  const row = state.rows.find(function (candidate) { return candidate.id === id; });
  return row ? readRecord(row, state.slotCount) : null;
}

/** The most used item names for a type lately, for the one-tap chips. */
export function frequentItems(type, options) {
  return frequentItemNames(state.rows, type, state.slotCount, options);
}

/** Every item name ever used for a type, newest first, for the autocomplete. */
export function knownItems(type) {
  return itemNamesForType(state.rows, type, state.slotCount);
}

/** True when a write is still waiting to reach the sheet. */
export function hasPendingWrites() {
  return state.pending.length > 0;
}

/**
 * Acknowledges a dropped write. The record is already gone from the visible
 * rows -- this only clears the message, once the user has actually seen it.
 */
export function clearLastError() {
  if (!state.lastError) return;
  state.lastError = null;
  notify();
}

/** Debug only: throw away everything queued, abandoning those writes. */
export function clearQueue() {
  queue.clear();
  recompute();
}

// ---------------------------------------------------------------------------
// Restore the cached schema synchronously, at import time.
//
// Without this, any screen rendered before load() resolves sees slotCount 0 and
// cannot draw its item slots -- which is what happens on every reload, since
// the router starts before the network call finishes.
// ---------------------------------------------------------------------------

restoreCachedSchema();
