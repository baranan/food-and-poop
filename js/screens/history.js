/**
 * היסטוריה -- everything logged, on one shared time axis.
 *
 * A single chronological column rather than three parallel ones. The point of
 * this screen is to see what went in against what came out, and on a phone
 * three columns are too narrow to read; interleaving them in time order says
 * the same thing and stays legible. Type is carried by colour and icon instead
 * of by position.
 *
 * Tap an entry to edit it. בחירה turns on checkboxes for deleting several.
 */

import * as store from '../store.js';
import { styleFor } from '../typeStyle.js';
import { unitFor } from '../records.js';
import { formatTime, formatDayHeading } from '../format.js';

// Older entries are revealed a week at a time, so opening this screen after six
// months does not mean laying out thousands of rows.
const DAYS_PER_PAGE = 7;

export function createHistoryScreen(router) {
  return function historyScreen() {
    let visibleDays = DAYS_PER_PAGE;
    let selecting = false;
    const selected = new Set();

    const screen = document.createElement('div');
    screen.className = 'screen history';

    // ---- Header ----------------------------------------------------------
    const header = document.createElement('div');
    header.className = 'form-header';

    const heading = document.createElement('h2');
    heading.textContent = 'היסטוריה';

    const controls = document.createElement('div');
    controls.className = 'history-controls';

    const selectButton = document.createElement('button');
    selectButton.type = 'button';
    selectButton.className = 'text-button';

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'text-button';
    back.textContent = 'חזרה';
    back.addEventListener('click', function () { router.goHome(); });

    controls.append(selectButton, back);
    header.append(heading, controls);

    // ---- Delete bar, only while selecting ---------------------------------
    const deleteBar = document.createElement('div');
    deleteBar.className = 'delete-bar';
    deleteBar.hidden = true;

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'delete-button';

    deleteButton.addEventListener('click', function () {
      if (selected.size === 0) return;

      const message = selected.size === 1
        ? 'למחוק את הרישום?'
        : 'למחוק ' + selected.size + ' רישומים?';
      if (!confirm(message)) return;

      // Optimistic, like every other write: they vanish now and the queue
      // catches up.
      selected.forEach(function (id) { store.deleteEntry(id); });
      selected.clear();
      selecting = false;
      redraw();
    });

    deleteBar.appendChild(deleteButton);

    selectButton.addEventListener('click', function () {
      selecting = !selecting;
      selected.clear();
      redraw();
    });

    // ---- The list ----------------------------------------------------------
    const list = document.createElement('div');
    list.className = 'history-list';

    const moreButton = document.createElement('button');
    moreButton.type = 'button';
    moreButton.className = 'add-item';
    moreButton.textContent = 'הצג עוד';
    moreButton.addEventListener('click', function () {
      visibleDays += DAYS_PER_PAGE;
      redraw();
    });

    /** 'בננה 100, לחם 50' -- enough to recognise an entry without opening it. */
    function summarise(entry) {
      const unit = unitFor(entry.type);
      return entry.items.map(function (item) {
        if (item.amount === null || item.amount === undefined || item.amount === '') {
          return item.name;
        }
        return item.name + ' ' + item.amount + ' ' + unit;
      }).join(' · ');
    }

    function buildCard(entry) {
      const style = styleFor(entry.type);

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'entry-card ' + style.className;
      card.classList.toggle('selected', selected.has(entry.id));

      // While selecting, a tap picks rather than navigates -- otherwise it is
      // far too easy to open an entry you meant to tick.
      card.addEventListener('click', function () {
        if (selecting) {
          if (selected.has(entry.id)) selected.delete(entry.id);
          else selected.add(entry.id);
          redraw();
          return;
        }
        router.go(style.route + '/' + entry.id);
      });

      if (selecting) {
        const tick = document.createElement('span');
        tick.className = 'entry-tick';
        tick.textContent = selected.has(entry.id) ? '✓' : '';
        card.appendChild(tick);
      }

      const icon = document.createElement('span');
      icon.className = 'entry-icon';
      icon.textContent = style.icon;
      icon.setAttribute('aria-hidden', 'true');

      const body = document.createElement('span');
      body.className = 'entry-body';

      const items = document.createElement('span');
      items.className = 'entry-items';
      items.textContent = summarise(entry);
      body.appendChild(items);

      if (entry.notes) {
        const notes = document.createElement('span');
        notes.className = 'entry-notes';
        notes.textContent = entry.notes;
        body.appendChild(notes);
      }

      const time = document.createElement('span');
      time.className = 'entry-time';
      time.textContent = formatTime(entry.time);

      card.append(icon, body, time);
      return card;
    }

    /** Groups entries by calendar day, newest day first. */
    function groupByDay(entries) {
      const days = new Map();

      entries.forEach(function (entry) {
        const date = new Date(entry.time);
        if (isNaN(date)) return;
        const key = date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate();
        if (!days.has(key)) days.set(key, { time: entry.time, entries: [] });
        days.get(key).entries.push(entry);
      });

      return Array.from(days.values())
        .sort(function (a, b) { return String(b.time).localeCompare(String(a.time)); });
    }

    function redraw() {
      selectButton.textContent = selecting ? 'סיום' : 'בחירה';
      deleteBar.hidden = !selecting;
      deleteButton.textContent = selected.size === 0
        ? 'בחר רישומים למחיקה'
        : 'מחק ' + selected.size;
      deleteButton.disabled = selected.size === 0;

      // Newest first, which is what you want when checking what just happened.
      const entries = store.allEntries().slice().reverse();
      const days = groupByDay(entries);

      list.replaceChildren();

      if (days.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'placeholder';
        empty.textContent = 'עדיין אין רישומים';
        list.appendChild(empty);
        moreButton.hidden = true;
        return;
      }

      days.slice(0, visibleDays).forEach(function (day) {
        const dayHeading = document.createElement('div');
        dayHeading.className = 'day-heading';
        dayHeading.textContent = formatDayHeading(day.time);
        list.appendChild(dayHeading);

        // Within a day, earliest first, so a meal reads above the poop that
        // followed it rather than below.
        day.entries
          .slice()
          .sort(function (a, b) { return String(a.time).localeCompare(String(b.time)); })
          .forEach(function (entry) { list.appendChild(buildCard(entry)); });
      });

      moreButton.hidden = days.length <= visibleDays;
    }

    screen.append(header, deleteBar, list, moreButton);
    redraw();

    // Keep the list live: a write landing, or an entry deleted on the other
    // phone, should show up without navigating away and back.
    const unsubscribe = store.subscribe(function () {
      if (screen.isConnected) redraw();
      else unsubscribe();
    });

    return screen;
  };
}
