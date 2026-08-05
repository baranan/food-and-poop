/**
 * The reusable input controls the entry forms are built from.
 *
 * Each factory returns `{ element, getValue, setValue }` so a form can compose
 * them without knowing how any of them works inside.
 *
 * Density is a design constraint here, not a preference: the whole form has to
 * fit on a phone screen without scrolling, or logging a meal stops being a
 * five-second job. Anything not needed at rest is collapsed behind a summary
 * row that states the current value.
 */

import { relativeWidth } from '../imageSizes.js';

// ---------------------------------------------------------------------------
// A collapsed section: a summary row that expands on tap.
//
// Used for amounts and notes. Keeps the resting form short while leaving every
// value one tap away and visible without opening anything.
// ---------------------------------------------------------------------------

export function createCollapsible({ label, summary, expanded = false }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'collapsible';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'collapsible-toggle';

  const labelEl = document.createElement('span');
  labelEl.className = 'field-label';
  labelEl.textContent = label;

  const summaryEl = document.createElement('span');
  summaryEl.className = 'collapsible-summary';
  summaryEl.textContent = summary || '';

  const chevron = document.createElement('span');
  chevron.className = 'chevron';
  chevron.textContent = '⌄';

  toggle.append(labelEl, summaryEl, chevron);

  const panel = document.createElement('div');
  panel.className = 'collapsible-panel';
  panel.hidden = !expanded;

  toggle.addEventListener('click', function () {
    panel.hidden = !panel.hidden;
    wrapper.classList.toggle('open', !panel.hidden);
  });

  wrapper.classList.toggle('open', expanded);
  wrapper.append(toggle, panel);

  return {
    element: wrapper,
    panel: panel,
    setSummary: function (text) { summaryEl.textContent = text || ''; },
    setFilled: function (filled) { wrapper.classList.toggle('filled', Boolean(filled)); },
    open: function () { panel.hidden = false; wrapper.classList.add('open'); },
    close: function () { panel.hidden = true; wrapper.classList.remove('open'); }
  };
}

// ---------------------------------------------------------------------------
// מתי -- when the event happened.
//
// Defaults to now. The time is directly editable. The date button steps back to
// yesterday on the first tap, because "yesterday evening" is overwhelmingly the
// common correction; tapping again opens the full picker for anything older.
// ---------------------------------------------------------------------------

export function createWhenField(initialIso) {
  let value = new Date(initialIso || Date.now());

  const row = document.createElement('div');
  row.className = 'when-row';

  const caption = document.createElement('span');
  caption.className = 'field-label when-caption';
  caption.textContent = 'מתי';

  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.className = 'time-input';
  timeInput.addEventListener('change', function () {
    const [hours, minutes] = timeInput.value.split(':').map(Number);
    if (!isNaN(hours)) {
      value.setHours(hours, minutes || 0, 0, 0);
      redraw();
    }
  });

  const dateButton = document.createElement('button');
  dateButton.type = 'button';
  dateButton.className = 'date-button';

  // Present only so the native picker has something to open; never shown.
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.className = 'hidden-date';
  dateInput.addEventListener('change', function () {
    if (!dateInput.value) return;
    const [year, month, day] = dateInput.value.split('-').map(Number);
    value.setFullYear(year, month - 1, day);
    redraw();
  });

  dateButton.addEventListener('click', function () {
    if (isToday(value)) {
      value.setDate(value.getDate() - 1);
      redraw();
      return;
    }
    try {
      dateInput.showPicker();
    } catch (err) {
      dateInput.click();
    }
  });

  row.append(caption, timeInput, dateButton, dateInput);

  function isToday(date) {
    const now = new Date();
    return date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate();
  }

  function dateLabel(date) {
    if (isToday(date)) return 'היום';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'אתמול';
    return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
  }

  function redraw() {
    timeInput.value = String(value.getHours()).padStart(2, '0') + ':' +
                      String(value.getMinutes()).padStart(2, '0');
    dateButton.textContent = dateLabel(value);
    dateButton.classList.toggle('is-today', isToday(value));
    dateInput.value = value.getFullYear() + '-' +
      String(value.getMonth() + 1).padStart(2, '0') + '-' +
      String(value.getDate()).padStart(2, '0');
  }

  redraw();

  return {
    element: row,
    getValue: function () { return new Date(value).toISOString(); },
    setValue: function (iso) { value = new Date(iso); redraw(); }
  };
}

// ---------------------------------------------------------------------------
// כמות -- the calibration photographs, collapsed until asked for.
//
// Only the number is ever stored. The pictures exist so that two people
// estimating "about 100 grams" mean roughly the same thing, and they are drawn
// at their true relative sizes for the same reason. Six photographs is a lot of
// screen, so at rest this is one row showing the chosen amount.
// ---------------------------------------------------------------------------

export function createImageAmountPicker({ prefix, amounts, unit, value, onChange }) {
  let selected = value === undefined || value === null || value === '' ? null : Number(value);

  const collapsible = createCollapsible({
    label: 'כמות',
    summary: summaryText()
  });

  const grid = document.createElement('div');
  grid.className = 'amount-grid';

  const buttons = new Map();

  amounts.forEach(function (amount) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'amount-button';

    const frame = document.createElement('span');
    frame.className = 'amount-image';

    const img = document.createElement('img');
    img.src = 'img/' + prefix + '-' + amount + '.png';
    img.alt = '';
    img.loading = 'lazy';

    // Honest relative scale: the widest tile fills the frame, the rest are drawn
    // in proportion to it. Never make these uniform.
    img.style.width = Math.round(relativeWidth(prefix, amount, amounts) * 100) + '%';

    const caption = document.createElement('span');
    caption.className = 'amount-caption';
    caption.textContent = amount;

    frame.appendChild(img);
    button.append(frame, caption);

    button.addEventListener('click', function () {
      selected = selected === amount ? null : amount;
      refresh();
      // Choosing is the reason the panel was opened, so close it again.
      if (selected !== null) collapsible.close();
      if (onChange) onChange(selected);
    });

    buttons.set(amount, button);
    grid.appendChild(button);
  });

  collapsible.panel.appendChild(grid);

  function summaryText() {
    return selected === null ? 'בחר' : selected + ' ' + (unit || '');
  }

  function refresh() {
    buttons.forEach(function (button, amount) {
      button.classList.toggle('selected', amount === selected);
    });
    collapsible.setSummary(summaryText());
    collapsible.setFilled(selected !== null);
  }

  refresh();

  return {
    element: collapsible.element,
    getValue: function () { return selected; },
    setValue: function (next) { selected = next === null ? null : Number(next); refresh(); }
  };
}

// ---------------------------------------------------------------------------
// A row of plain choice buttons: poop consistencies, symptom severities, and
// the one-tap item shortcuts.
// ---------------------------------------------------------------------------

export function createChoiceRow({ options, value, onChange, className = '' }) {
  let selected = value === undefined ? null : value;

  const wrapper = document.createElement('div');
  wrapper.className = ('choice-row ' + className).trim();

  const buttons = new Map();

  options.forEach(function (option) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-button';
    button.textContent = option;

    button.addEventListener('click', function () {
      selected = selected === option ? null : option;
      refresh();
      if (onChange) onChange(selected);
    });

    buttons.set(option, button);
    wrapper.appendChild(button);
  });

  function refresh() {
    buttons.forEach(function (button, option) {
      button.classList.toggle('selected', option === selected);
    });
  }

  refresh();

  return {
    element: wrapper,
    getValue: function () { return selected; },
    setValue: function (next) { selected = next; refresh(); }
  };
}

/** The same choice row, collapsed behind a summary. Used for severity. */
export function createCollapsedChoice({ label, options, value, unit, onChange }) {
  const collapsible = createCollapsible({
    label: label,
    summary: value ? value + ' ' + (unit || '') : 'בחר'
  });

  const row = createChoiceRow({
    options: options,
    value: value,
    className: 'severity',
    onChange: function (chosen) {
      collapsible.setSummary(chosen ? chosen + ' ' + (unit || '') : 'בחר');
      collapsible.setFilled(Boolean(chosen));
      if (chosen) collapsible.close();
      if (onChange) onChange(chosen);
    }
  });

  collapsible.setFilled(Boolean(value));
  collapsible.panel.appendChild(row.element);

  return {
    element: collapsible.element,
    getValue: row.getValue,
    setValue: function (next) {
      row.setValue(next);
      collapsible.setSummary(next ? next + ' ' + (unit || '') : 'בחר');
      collapsible.setFilled(Boolean(next));
    }
  };
}

// ---------------------------------------------------------------------------
// מזון / תסמין -- free text with completion.
//
// The vocabulary is open, so this never restricts what can be typed. It only
// offers what has been used lately, which after a few days is almost always
// what you were about to type anyway. The shortcut chips are small on purpose:
// ten of them have to fit above the input without pushing it off screen.
// ---------------------------------------------------------------------------

export function createItemNameField({ placeholder, suggestions, frequent, value, onChange }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'item-name-field';

  let shortcuts = null;
  if (frequent && frequent.length > 0) {
    shortcuts = createChoiceRow({
      options: frequent,
      value: value,
      className: 'shortcuts',
      onChange: function (chosen) {
        input.value = chosen || '';
        hideSuggestions();
        if (onChange) onChange(input.value);
      }
    });
    wrapper.appendChild(shortcuts.element);
  }

  const inputRow = document.createElement('div');
  inputRow.className = 'input-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'text-input';
  input.placeholder = placeholder || '';
  input.value = value || '';
  input.autocomplete = 'off';
  input.enterKeyHint = 'done';

  const list = document.createElement('div');
  list.className = 'suggestions';
  list.hidden = true;

  function hideSuggestions() {
    list.hidden = true;
    list.replaceChildren();
  }

  function showSuggestions() {
    const typed = input.value.trim();
    if (typed === '') return hideSuggestions();

    const matches = suggestions
      .filter(function (name) { return name !== typed && name.includes(typed); })
      .slice(0, 6);

    if (matches.length === 0) return hideSuggestions();

    list.replaceChildren();
    matches.forEach(function (name) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'suggestion';
      option.textContent = name;
      option.addEventListener('click', function () {
        input.value = name;
        if (shortcuts) shortcuts.setValue(name);
        hideSuggestions();
        if (onChange) onChange(name);
      });
      list.appendChild(option);
    });
    list.hidden = false;
  }

  input.addEventListener('input', function () {
    if (shortcuts) shortcuts.setValue(input.value);
    showSuggestions();
    if (onChange) onChange(input.value);
  });

  // Leaving the field must not steal a tap aimed at a suggestion.
  input.addEventListener('blur', function () { setTimeout(hideSuggestions, 150); });

  inputRow.append(input, list);
  wrapper.appendChild(inputRow);

  return {
    element: wrapper,
    getValue: function () { return input.value.trim(); },
    setValue: function (next) {
      input.value = next || '';
      if (shortcuts) shortcuts.setValue(next);
    },
    focus: function () { input.focus(); }
  };
}

// ---------------------------------------------------------------------------
// הערות -- one note for the whole entry, collapsed since most entries have none.
// ---------------------------------------------------------------------------

export function createNotesField(value) {
  const collapsible = createCollapsible({
    label: 'הערות',
    summary: value ? value : 'אין',
    expanded: Boolean(value)
  });

  const input = document.createElement('textarea');
  input.className = 'notes-input';
  input.rows = 2;
  input.value = value || '';
  input.placeholder = 'לא חובה';
  input.addEventListener('input', function () {
    collapsible.setSummary(input.value.trim() || 'אין');
    collapsible.setFilled(Boolean(input.value.trim()));
  });

  collapsible.setFilled(Boolean(value));
  collapsible.panel.appendChild(input);

  return {
    element: collapsible.element,
    getValue: function () { return input.value.trim(); },
    setValue: function (next) { input.value = next || ''; }
  };
}
