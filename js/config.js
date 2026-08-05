/**
 * Configuration and the mock-mode switch.
 *
 * The token here is not a secret. The repo is public so that GitHub Pages will
 * serve it, and CLAUDE.md accepts obscurity over security for a family log. The
 * server's blast radius is four operations on one spreadsheet.
 */

// Where the Apps Script web app lives, and the shared token it expects.
export const API_URL =
  'https://script.google.com/macros/s/AKfycbw7tbTJIN_hnflRbh9uyIx0rfjeH9nQfkubiM3t3-uDzA5cLpwy4K3_Xc8ShVBlb7pblQ/exec';

export const TOKEN = 'f2272bc1-9faf-4a94-87b5-db48f96e212d';

// The sheet itself, for the קובץ button. We just hand the OS the link and let
// it decide what opens it -- the Sheets app on a phone, a browser on a desktop.
export const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1jqMnYxqYoIjoqpZyhi7HDvjRUxK2DgVZXT7oRcVmb3A/edit';

// How the mock behaves. A mock that answers instantly would mean the optimistic
// UI and the offline queue never run in their interesting states, so this
// imitates the real thing. The range is calibrated against a measured live run:
// six round trips took 17.8s, about 3s each.
export const MOCK_MIN_DELAY_MS = 800;
export const MOCK_MAX_DELAY_MS = 3000;

// localStorage keys, collected here so nothing else has to guess at them.
export const STORAGE_KEYS = {
  mock: 'fp.mockMode',
  mockRows: 'fp.mock.rows',
  mockFailureRate: 'fp.mock.failureRate',
  enteredBy: 'fp.enteredBy',
  queue: 'fp.writeQueue',

  // The last header row we saw. Cached so that a cold start with no network
  // still knows how many item slots the sheet has -- without it, an entry
  // logged offline would sync with its items missing.
  headers: 'fp.headers'
};

// ---------------------------------------------------------------------------
// Mock mode.
//
// A runtime toggle rather than a build-time constant, because iPhone Safari
// cannot be remote-debugged here -- being able to flip an actual phone into
// mock mode is worth a lot. `?mock=1` turns it on, `?mock=0` off, and the
// choice persists until changed.
// ---------------------------------------------------------------------------

export function isMockMode() {
  const parameter = new URLSearchParams(location.search).get('mock');

  // An explicit URL parameter wins and is remembered.
  if (parameter === '1' || parameter === '0') {
    localStorage.setItem(STORAGE_KEYS.mock, parameter);
    return parameter === '1';
  }

  return localStorage.getItem(STORAGE_KEYS.mock) === '1';
}

export function setMockMode(on) {
  localStorage.setItem(STORAGE_KEYS.mock, on ? '1' : '0');
}

// ---------------------------------------------------------------------------
// Failure injection, so the retry path can be exercised on demand rather than
// only when the network happens to misbehave. 0 = never fail, 1 = always.
// ---------------------------------------------------------------------------

export function getMockFailureRate() {
  return Number(localStorage.getItem(STORAGE_KEYS.mockFailureRate) || 0);
}

export function setMockFailureRate(rate) {
  localStorage.setItem(STORAGE_KEYS.mockFailureRate, String(rate));
}
