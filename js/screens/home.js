/**
 * Home screen.
 *
 * Three large entry buttons, two smaller navigation buttons, and a deliberately
 * small link to the sheet itself. Each entry button also reports when that kind
 * of thing was last logged, which is the question you usually have when you
 * pick up the phone -- has this already been recorded, or not?
 */

import * as store from '../store.js';
import { SHEET_URL } from '../config.js';
import { timeAgo } from '../format.js';
import { TYPE_ORDER, styleFor } from '../typeStyle.js';

/** 'לפני שעה' for the most recent entry of a type, or a nudge if there is none. */
function lastEntryLabel(type) {
  const entries = store.entriesOfType(type);
  if (entries.length === 0) return 'עדיין לא נרשם';

  // entriesOfType is sorted oldest first, so the last one is the most recent.
  return timeAgo(entries[entries.length - 1].time);
}

function buildEntryButton(type, router) {
  const spec = styleFor(type);

  const button = document.createElement('button');
  button.className = 'big-button ' + spec.className;
  button.addEventListener('click', function () { router.go(spec.route); });

  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent = spec.icon;
  icon.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = spec.label;

  const sub = document.createElement('span');
  sub.className = 'sub';
  sub.textContent = lastEntryLabel(type);

  text.append(label, sub);
  button.append(icon, text);
  return button;
}

function buildMediumButton(text, route, router) {
  const button = document.createElement('button');
  button.className = 'medium-button';
  button.textContent = text;
  button.addEventListener('click', function () { router.go(route); });
  return button;
}

export function createHomeScreen(router) {
  return function homeScreen() {
    const screen = document.createElement('div');
    screen.className = 'screen';

    // The three things you came here to log.
    const primary = document.createElement('div');
    primary.className = 'primary-actions';
    TYPE_ORDER.forEach(function (type) {
      primary.appendChild(buildEntryButton(type, router));
    });

    // Looking rather than logging.
    const secondary = document.createElement('div');
    secondary.className = 'secondary-actions';
    secondary.append(
      buildMediumButton('היסטוריה', 'history', router),
      buildMediumButton('ניתוח', 'analysis', router)
    );

    // Small and out of the way on purpose -- opening the raw sheet by accident
    // in the middle of logging a meal would be irritating.
    const fileLink = document.createElement('a');
    fileLink.className = 'file-link';
    fileLink.href = SHEET_URL;
    fileLink.target = '_blank';
    fileLink.rel = 'noopener';
    fileLink.textContent = 'קובץ';

    screen.append(primary, secondary, fileLink);
    return screen;
  };
}
