/**
 * Confirmation after saving.
 *
 * Shows what was actually recorded, so a mistake is caught now rather than
 * discovered in the sheet a week later. `לתקן` reopens the same entry for
 * editing; `תודה` goes home; and the three entry buttons are repeated here
 * because logging a meal and a poop together is common.
 *
 * Note that the entry may still be in the write queue at this point. That is
 * fine and deliberate -- it is already in local state, so it displays and can
 * be edited exactly as if it had landed.
 */

import * as store from '../store.js';
import { styleFor, TYPE_ORDER } from '../typeStyle.js';
import { unitFor } from '../records.js';
import { formatDateTime } from '../format.js';

export function createSavedScreen(router) {
  return function savedScreen(id) {
    const entry = id ? store.entryById(id) : null;

    const screen = document.createElement('div');
    screen.className = 'screen';

    // The entry could be missing if the id was mistyped, or if a refresh
    // dropped it -- say so rather than showing an empty card.
    if (!entry) {
      const missing = document.createElement('div');
      missing.className = 'placeholder';
      missing.textContent = 'הרישום לא נמצא';
      const back = document.createElement('button');
      back.className = 'back-button';
      back.textContent = 'חזרה';
      back.addEventListener('click', function () { router.goHome(); });
      screen.append(missing, back);
      return screen;
    }

    const style = styleFor(entry.type);

    // ---- What was saved ----------------------------------------------------
    const card = document.createElement('div');
    card.className = 'saved-card ' + style.className;

    const title = document.createElement('div');
    title.className = 'saved-title';
    title.textContent = style.icon + ' ' + style.label + ' — נשמר';

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

    // ---- Fix it, or move on -------------------------------------------------
    const actions = document.createElement('div');
    actions.className = 'saved-actions';

    const fix = document.createElement('button');
    fix.className = 'medium-button';
    fix.textContent = 'לתקן';
    fix.addEventListener('click', function () {
      router.go(styleFor(entry.type).route + '/' + entry.id);
    });

    const thanks = document.createElement('button');
    thanks.className = 'medium-button primary';
    thanks.textContent = 'תודה';
    thanks.addEventListener('click', function () { router.goHome(); });

    actions.append(fix, thanks);

    // ---- Log something else straight away ------------------------------------
    const again = document.createElement('div');
    again.className = 'secondary-actions three';
    TYPE_ORDER.forEach(function (type) {
      const spec = styleFor(type);
      const button = document.createElement('button');
      button.className = 'medium-button';
      button.textContent = spec.icon + ' ' + spec.label;
      button.addEventListener('click', function () { router.go(spec.route); });
      again.appendChild(button);
    });

    screen.append(card, actions, again);
    return screen;
  };
}
