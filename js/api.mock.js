/**
 * Mock implementation of the API, backed by localStorage.
 *
 * Same shape as api.remote.js, so the UI cannot tell them apart. Two things
 * make it a useful test double rather than a toy:
 *
 *   - it is slow, imitating Apps Script's 0.5-2s round trips, so the optimistic
 *     UI has something to be optimistic about;
 *   - it can be told to fail, so the offline queue and retry path can be
 *     exercised deliberately instead of by waiting for bad luck.
 */

import {
  MOCK_MIN_DELAY_MS,
  MOCK_MAX_DELAY_MS,
  STORAGE_KEYS,
  getMockFailureRate
} from './config.js';

import { MOCK_HEADERS, generateSeedRows } from './seed.js';
import { NetworkError } from './errors.js';

// ---------------------------------------------------------------------------
// Storage. The mock keeps its rows in localStorage so a reload behaves like a
// real backend rather than resetting.
// ---------------------------------------------------------------------------

function loadRows() {
  const raw = localStorage.getItem(STORAGE_KEYS.mockRows);

  // First run: lay down seed data so the history and frequency lists have
  // something to show.
  if (!raw) {
    const seeded = generateSeedRows();
    saveRows(seeded);
    return seeded;
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Mock store was corrupt, reseeding.', err);
    const seeded = generateSeedRows();
    saveRows(seeded);
    return seeded;
  }
}

function saveRows(rows) {
  localStorage.setItem(STORAGE_KEYS.mockRows, JSON.stringify(rows));
}

/** Throws away the mock log and generates a fresh one. */
export function resetMockData(days = 14) {
  const seeded = generateSeedRows(days);
  saveRows(seeded);
  return seeded;
}

/** Empties the mock log entirely, for testing the no-data case. */
export function clearMockData() {
  saveRows([]);
}

// ---------------------------------------------------------------------------
// Simulated network conditions.
// ---------------------------------------------------------------------------

function randomDelay() {
  const span = MOCK_MAX_DELAY_MS - MOCK_MIN_DELAY_MS;
  return MOCK_MIN_DELAY_MS + Math.random() * span;
}

/**
 * Waits a realistic amount of time, then fails according to the injected
 * failure rate. The failure is thrown rather than returned, matching how a real
 * network error surfaces -- that distinction is what lets the queue know the
 * difference between "the server said no" and "the request never arrived".
 */
function simulateNetwork() {
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      // Must be a NetworkError, not a plain Error -- the queue branches on the
      // type, so a mock that threw something else would exercise the wrong path.
      if (Math.random() < getMockFailureRate()) {
        reject(new NetworkError('Simulated network failure'));
        return;
      }
      resolve();
    }, randomDelay());
  });
}

// ---------------------------------------------------------------------------
// The four operations.
// ---------------------------------------------------------------------------

export async function list() {
  await simulateNetwork();
  return { ok: true, headers: MOCK_HEADERS.slice(), rows: loadRows() };
}

export async function add(record) {
  await simulateNetwork();

  const rows = loadRows();
  const now = new Date().toISOString();

  // Match the server: it owns created_at and updated_at, the client owns id
  // and time.
  const complete = Object.assign({}, record, {
    id: record.id || crypto.randomUUID(),
    created_at: now,
    updated_at: now
  });

  rows.push(complete);
  saveRows(rows);
  return { ok: true, record: complete };
}

export async function update(record) {
  await simulateNetwork();

  const rows = loadRows();
  const index = rows.findIndex(function (row) { return row.id === record.id; });

  if (index === -1) {
    return { ok: false, error: 'No record with id ' + record.id };
  }

  // Partial update, exactly as the server does it: absent fields are untouched,
  // created_at is never overwritten.
  const merged = Object.assign({}, rows[index], record, {
    created_at: rows[index].created_at,
    updated_at: new Date().toISOString()
  });

  rows[index] = merged;
  saveRows(rows);
  return { ok: true, record: merged };
}

export async function remove(id) {
  await simulateNetwork();

  const rows = loadRows();
  const index = rows.findIndex(function (row) { return row.id === id; });

  if (index === -1) {
    return { ok: false, error: 'No record with id ' + id };
  }

  rows.splice(index, 1);
  saveRows(rows);
  return { ok: true, id: id };
}
