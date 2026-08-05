/**
 * Who is logging, per device.
 *
 * There is no login -- two people share one link. `entered_by` is therefore a
 * device setting, chosen once and rarely changed, not an authenticated identity.
 */

import { STORAGE_KEYS } from './config.js';

export const PEOPLE = ['אבא', 'אמא'];

/** The name stored on this device, or '' if it has never been set. */
export function getEnteredBy() {
  return localStorage.getItem(STORAGE_KEYS.enteredBy) || '';
}

export function setEnteredBy(name) {
  localStorage.setItem(STORAGE_KEYS.enteredBy, name);
}

/** True until someone has answered the "who are you" prompt on this device. */
export function needsIdentity() {
  return getEnteredBy() === '';
}
