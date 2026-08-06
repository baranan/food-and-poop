/**
 * The only module the rest of the app may use to reach the server.
 *
 * It exposes exactly four operations and picks an implementation -- real or
 * mock -- at load time. Nothing above this layer should ever know which one it
 * got, or import api.remote.js or api.mock.js directly.
 *
 * `delete` is a reserved word in JavaScript, so the fourth operation is called
 * `remove` here. The action sent over the wire is still `delete`, which is what
 * Code.gs switches on.
 */

import { isMockMode } from './config.js';
import * as remote from './api.remote.js';
import * as mock from './api.mock.js';

// Chosen once, at module load. Flipping mock mode requires a reload, which is
// a feature: it avoids half the app holding data from one backend and half from
// the other.
const implementation = isMockMode() ? mock : remote;

/** True when the app is running against the mock. The UI shows a loud banner. */
export const usingMock = isMockMode();

export function list() {
  return implementation.list();
}

export function add(record) {
  return implementation.add(record);
}

export function update(record) {
  return implementation.update(record);
}

export function remove(id) {
  return implementation.remove(id);
}

// Re-exported so the debug screen can reseed or empty the mock. These throw if
// called against the real backend, which is the intended safety behaviour.
export function resetMockData(days) {
  if (!usingMock) throw new Error('resetMockData is only available in mock mode');
  return mock.resetMockData(days);
}

export function clearMockData() {
  if (!usingMock) throw new Error('clearMockData is only available in mock mode');
  return mock.clearMockData();
}

export { NetworkError } from './errors.js';
