/**
 * Entry detail.
 *
 * Shown twice: straight after saving, so a mistake is caught now rather than
 * discovered in the sheet a week later, and again when an entry is tapped in
 * היסטוריה. Both cases want the same thing -- see what is recorded, then either
 * correct it or move on -- so they are the same screen.
 *
 * The route carries where the user came from: `saved/<id>` returns home,
 * `saved/<id>/history` returns to the history list at the position they left.
 *
 * Note that a freshly saved entry may still be in the write queue. That is fine
 * and deliberate: it is already in local state, so it displays and edits
 * exactly as if it had landed.
 */

import * as store from '../store.js';
import { styleFor, TYPE_ORDER } from '../typeStyle.js';
import { unitFor } from '../records.js';
import { formatDateTime } from '../format.js';

export function createSavedScreen(router) {
  return function savedScreen(id, from) {
    const entry = id ? store.entryById(id) : null;
    const cameFromHistory = from === 'history';

    // Where תודה goes, and what suffix keeps the trail intact.
    const goBack = function () {
      if (cameFromHistory) router.go('history');
      else router.goHome();
    };
    const trail = cameFromHistory ? '/history' : '';

    const screen = document.createElement('div');
    screen.className = 'screen';

    // The entry can be missing if the id was mistyped or the row was deleted
    // elsewhere -- say so rather than showing an empty card.
    if (!entry) {
      const missing = document.createElement('div');
      missing.className = 'placeholder';
      missing.textContent = 'הרישום לא נמצא';

      const back = document.createElement('button');
      back.className = 'back-button';
      back.textContent = 'חזרה';
      back.addEventListener('click', goBack);

      screen.append(missing, back);
      return screen;
    }

    const style = styleFor(entry.type);

    // ---- What is recorded ---------------------------------------------------
    const card = document.createElement('div');
    card.className = 'saved-card ' + style.className;

    const title = document.createElement('div');
    title.className = 'saved-title';
    title.textContent = style.icon + ' ' + style.label +
      (cameFromHistory ? '' : ' — נשמר');

    const when = document.createElement('div');
    when.className = 'saved-when';
    when.textContent = formatDateTime(entry.time);

    const list = document.createElement('ul');
    list.className = 'saved-items';
    entry.items.forEach(function (item) {
      const row = document.createElement('li');

      const name = document.createElement('span');
      name.textContent = item.name;

      const amount = document.createElement('span');
      amount.className = 'saved-amount';
      amount.textContent = item.amount === null || item.amount === undefined || item.amount === ''
        ? ''
        : item.amount + ' ' + unitFor(entry.type);

      row.append(name, amount);
      list.appendChild(row);
    });

    card.append(title, when, list);

    if (entry.notes) {
      const notes = document.createElement('div');
      notes.className = 'saved-notes';
      notes.textContent = entry.notes;
      card.appendChild(notes);
    }

    // ---- Correct it, or move on ----------------------------------------------
    const actions = document.createElement('div');
    actions.className = 'saved-actions';

    const fix = document.createElement('button');
    fix.className = 'medium-button';
    fix.textContent = 'לתקן';
    fix.addEventListener('click', function () {
      router.go(style.route + '/' + entry.id + trail);
    });

    const thanks = document.createElement('button');
    thanks.className = 'medium-button primary';
    thanks.textContent = 'תודה';
    thanks.addEventListener('click', goBack);

    actions.append(fix, thanks);

    // ---- Somewhere else to go --------------------------------------------------
    // Logging a meal and a poop in one sitting is common, and after either you
    // often want to look at the list.
    const elsewhere = document.createElement('div');
    elsewhere.className = 'secondary-actions';

    TYPE_ORDER.forEach(function (type) {
      const spec = styleFor(type);
      const button = document.createElement('button');
      button.className = 'medium-button';
      button.textContent = spec.icon + ' ' + spec.label;
      button.addEventListener('click', function () { router.go(spec.route); });
      elsewhere.appendChild(button);
    });

    const history = document.createElement('button');
    history.className = 'medium-button';
    history.textContent = 'היסטוריה';
    history.addEventListener('click', function () { router.go('history'); });
    elsewhere.appendChild(history);

    screen.append(card, actions, elsewhere);
    return screen;
  };
}
