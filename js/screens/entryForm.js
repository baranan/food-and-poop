/**
 * The entry form.
 *
 * One implementation serves all three types, because they are the same shape:
 * a time for the whole entry, one or more items with an amount each, and a note
 * for the whole entry. Only three things vary, and they are described in CONFIG
 * below -- how an item is named, how an amount is chosen, and whether more than
 * one item is allowed.
 *
 * The same screen edits an existing entry: pass an id and it loads that record
 * and updates instead of adding.
 */

import * as store from '../store.js';
import { getEnteredBy } from '../identity.js';
import { styleFor } from '../typeStyle.js';
import {
  TYPES, POOP_KINDS, GRAM_AMOUNTS, SEVERITIES, buildRecord, unitFor
} from '../records.js';
import {
  createWhenField, createImageAmountPicker, createChoiceRow,
  createCollapsedChoice, createItemNameField, createNotesField
} from '../ui/fields.js';

// ---------------------------------------------------------------------------
// What differs between the three types. Everything else is shared.
// ---------------------------------------------------------------------------

const CONFIG = {
  [TYPES.FOOD]: {
    itemLabel: 'מזון',
    amountLabel: 'כמות',
    placeholder: 'מה הוא אכל?',
    itemInput: 'text',
    amountInput: 'images',
    imagePrefix: 'food',
    amounts: GRAM_AMOUNTS,
    repeating: true
  },
  [TYPES.POOP]: {
    itemLabel: 'סוג',
    amountLabel: 'כמות',
    itemInput: 'choice',
    options: POOP_KINDS,
    amountInput: 'images',
    imagePrefix: 'poop',
    amounts: GRAM_AMOUNTS,
    repeating: false
  },
  [TYPES.SYMPTOM]: {
    itemLabel: 'תסמין',
    amountLabel: 'חומרה',
    placeholder: 'מה מפריע לו?',
    itemInput: 'text',
    amountInput: 'severity',
    amounts: SEVERITIES,
    repeating: true
  }
};

export function createEntryFormScreen(type, router) {
  const config = CONFIG[type];
  const style = styleFor(type);

  return function entryFormScreen(editId) {
    const existing = editId ? store.entryById(editId) : null;
    const slotCount = store.getState().slotCount;

    // On the very first run there is no cached header row yet, so we do not
    // know how many item slots exist. Say so plainly rather than drawing a form
    // with no fields in it. app.js re-renders once the schema arrives.
    if (slotCount === 0) {
      const waiting = document.createElement('div');
      waiting.className = 'screen';

      const box = document.createElement('div');
      box.className = 'placeholder';
      box.textContent = 'טוען את מבנה הגיליון…';

      const back = document.createElement('button');
      back.className = 'back-button';
      back.textContent = 'חזרה';
      back.addEventListener('click', function () { router.goHome(); });

      waiting.append(box, back);
      return waiting;
    }

    const screen = document.createElement('form');
    screen.className = 'screen entry-form ' + style.className;
    screen.addEventListener('submit', function (event) { event.preventDefault(); });

    // ---- Header: what am I logging, and how do I get out of here ----------
    const header = document.createElement('div');
    header.className = 'form-header';

    const heading = document.createElement('h2');
    heading.innerHTML = '';
    heading.append(style.icon + ' ' + (existing ? 'עריכת ' : '') + style.label);

    // Every flow is cancellable, and leaves nothing behind.
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'text-button';
    cancel.textContent = 'ביטול';
    cancel.addEventListener('click', function () { router.goHome(); });

    header.append(heading, cancel);

    // ---- מתי, at entry level: one time is what makes this one entry -------
    const whenField = createWhenField(existing ? existing.time : new Date().toISOString());

    // ---- Items ------------------------------------------------------------
    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'items';

    const itemBlocks = [];

    /** One item: a name and an amount, plus a way to remove it. */
    function addItemBlock(initial) {
      if (itemBlocks.length >= slotCount) return;

      const block = document.createElement('div');
      block.className = 'item-block';

      const blockHeader = document.createElement('div');
      blockHeader.className = 'block-header';

      // The placeholder already says what this is, so the label only earns its
      // line once there are several items to tell apart.
      const nameLabel = document.createElement('span');
      nameLabel.className = 'field-label block-label';
      nameLabel.textContent = config.itemLabel;
      blockHeader.appendChild(nameLabel);

      // Only removable when there is more than one, so the form can never be
      // left with nothing to fill in.
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'remove-item';
      removeButton.textContent = '✕';
      removeButton.setAttribute('aria-label', 'הסרת פריט');
      removeButton.addEventListener('click', function () {
        const index = itemBlocks.findIndex(function (entry) { return entry.element === block; });
        if (index !== -1) itemBlocks.splice(index, 1);
        block.remove();
        refreshItemChrome();
      });
      blockHeader.appendChild(removeButton);

      // Name: free text with completion, or a fixed set of choices.
      let nameField;
      if (config.itemInput === 'choice') {
        nameField = createChoiceRow({
          options: config.options,
          value: initial ? initial.name : null
        });
      } else {
        nameField = createItemNameField({
          placeholder: config.placeholder,
          suggestions: store.knownItems(type),
          // Ten most used over the last ten days, padded with sensible defaults
          // until there is enough history for that to mean anything.
          frequent: store.frequentItems(type, { withinDays: 10, limit: 10 }),
          value: initial ? initial.name : ''
        });
      }

      // Amount: photographs for grams, plain numbers for severity. Both are
      // collapsed at rest so the whole form still fits on one screen.
      let amountField;
      if (config.amountInput === 'images') {
        amountField = createImageAmountPicker({
          prefix: config.imagePrefix,
          amounts: config.amounts,
          unit: unitFor(type),
          value: initial ? initial.amount : null
        });
      } else {
        amountField = createCollapsedChoice({
          label: config.amountLabel,
          options: config.amounts.map(String),
          unit: unitFor(type),
          value: initial && initial.amount ? String(initial.amount) : null
        });
      }

      block.append(blockHeader, nameField.element, amountField.element);
      itemsContainer.appendChild(block);
      itemBlocks.push({ element: block, nameField, amountField });
      refreshItemChrome();

      return { nameField, amountField };
    }

    /** Keeps the remove buttons and the "add another" button honest. */
    function refreshItemChrome() {
      itemBlocks.forEach(function (entry, index) {
        const removeButton = entry.element.querySelector('.remove-item');
        removeButton.hidden = itemBlocks.length < 2;
        entry.element.classList.toggle('first', index === 0);
      });

      if (addAnother) {
        addAnother.hidden = !config.repeating || itemBlocks.length >= slotCount;
        addAnother.textContent = 'פריט נוסף';
      }
    }

    // ---- Add another item --------------------------------------------------
    const addAnother = document.createElement('button');
    addAnother.type = 'button';
    addAnother.className = 'add-item';
    addAnother.addEventListener('click', function () {
      const added = addItemBlock(null);
      if (added && added.nameField.focus) added.nameField.focus();
    });

    // ---- הערות, clearly attached to the entry rather than to one item ------
    const notesField = createNotesField(existing ? existing.notes : '');

    // ---- Save ---------------------------------------------------------------
    const errorBox = document.createElement('div');
    errorBox.className = 'form-error';
    errorBox.hidden = true;

    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'submit-button';
    submit.textContent = 'גמרתי';

    submit.addEventListener('click', function () {
      // Collect whatever the user actually filled in.
      const items = itemBlocks
        .map(function (entry) {
          const name = entry.nameField.getValue();
          const amount = entry.amountField.getValue();
          return name ? { name: name, amount: amount === null ? null : Number(amount) } : null;
        })
        .filter(Boolean);

      if (items.length === 0) {
        return showError('צריך למלא לפחות ' + config.itemLabel + ' אחד');
      }

      // Refuse rather than write items into columns we cannot confirm exist.
      if (!store.schemaKnown()) {
        return showError('עוד לא ידוע מבנה הגיליון — נסה שוב בעוד רגע');
      }

      const record = buildRecord({
        id: existing ? existing.id : undefined,
        time: whenField.getValue(),
        type: type,
        notes: notesField.getValue(),
        items: items,
        enteredBy: getEnteredBy(),
        slotCount: slotCount
      });

      // Optimistic: this returns at once and the queue deals with the network.
      if (existing) store.updateEntry(record);
      else store.addEntry(record);

      router.go('saved/' + record.id);
    });

    function showError(message) {
      errorBox.textContent = message;
      errorBox.hidden = false;
    }

    // ---- Assemble -----------------------------------------------------------
    screen.append(header, whenField.element, itemsContainer, addAnother,
                  notesField.element, errorBox, submit);

    // Start with the items the entry already has, or one empty block.
    if (existing && existing.items.length > 0) {
      existing.items.forEach(function (item) { addItemBlock(item); });
    } else {
      addItemBlock(null);
    }

    return screen;
  };
}
