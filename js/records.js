/**
 * The domain model: vocabularies, and translation between the sheet's wide rows
 * and the shape the UI wants to think in.
 *
 * The sheet stores one row per entry with generic item1/amount1 … itemN/amountN
 * pairs. Forms and views would rather deal with `{ items: [{name, amount}] }`.
 * This module is the only place that knows how to go between the two.
 *
 * The server knows none of this. That is deliberate: adding a food, changing a
 * severity range, or widening the sheet never requires a redeploy.
 */

// ---------------------------------------------------------------------------
// Closed vocabularies. Enforced here, in the client, rather than by data
// validation in the sheet -- item names are an open vocabulary and a dropdown
// would fight every new food.
// ---------------------------------------------------------------------------

export const TYPES = {
  FOOD: 'אוכל',
  POOP: 'קקי',
  SYMPTOM: 'תסמין'
};

export const ALL_TYPES = [TYPES.FOOD, TYPES.POOP, TYPES.SYMPTOM];

/** The five poop consistencies, in order from firmest to loosest. */
export const POOP_KINDS = ['קשה', 'בינוני', 'רך', 'רך מאוד', 'שלשול'];

/** Gram steps, matching the calibration photographs in img/. */
export const GRAM_AMOUNTS = [10, 50, 100, 200, 300, 400];

/** Symptom severity. */
export const SEVERITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * The unit is implied by the type, which is why the sheet has no unit column.
 */
export function unitFor(type) {
  return type === TYPES.SYMPTOM ? 'דרגה' : 'גרם';
}

/** The amount options a given type offers. */
export function amountOptionsFor(type) {
  return type === TYPES.SYMPTOM ? SEVERITIES : GRAM_AMOUNTS;
}

/** Which set of calibration images a type uses, or null when it has none. */
export function imagePrefixFor(type) {
  if (type === TYPES.FOOD) return 'food';
  if (type === TYPES.POOP) return 'poop';
  return null;
}

// ---------------------------------------------------------------------------
// Slot discovery.
//
// The number of item slots is never hardcoded. It is counted from the header
// row at load time, so widening the sheet is a Sheets edit rather than a code
// change and a redeploy.
// ---------------------------------------------------------------------------

export function countItemSlots(headers) {
  const items = headers.filter(function (h) { return /^item\d+$/.test(h); }).length;
  const amounts = headers.filter(function (h) { return /^amount\d+$/.test(h); }).length;

  // A mismatch means someone added item7 but forgot amount7. Use the smaller
  // number so we never write to a column that does not exist.
  return Math.min(items, amounts);
}

// ---------------------------------------------------------------------------
// Wide row  ->  entry object.
// ---------------------------------------------------------------------------

/**
 * Turns a sheet row into `{ id, time, type, notes, items: [...] }`.
 * Empty slots are dropped, so a one-food meal yields one item.
 */
export function readRecord(row, slotCount) {
  const items = [];

  for (let slot = 1; slot <= slotCount; slot++) {
    const name = row['item' + slot];
    const amount = row['amount' + slot];

    // A slot counts as used if it has a name. An amount without a name is
    // treated as noise, since the name is what identifies the item.
    if (name !== undefined && name !== null && String(name).trim() !== '') {
      items.push({ name: String(name).trim(), amount: amount === '' ? null : Number(amount) });
    }
  }

  return {
    id: row.id,
    time: row.time,
    type: row.type,
    notes: row.notes || '',
    items: items,
    entered_by: row.entered_by || '',
    created_at: row.created_at || '',
    updated_at: row.updated_at || ''
  };
}

// ---------------------------------------------------------------------------
// Entry object  ->  wide row.
// ---------------------------------------------------------------------------

/**
 * Builds a row ready to send to the API. The client owns `id` and `time`; the
 * server owns `created_at` and `updated_at` and will overwrite anything we put
 * there, so we do not set them.
 *
 * Every slot up to slotCount is written, including the empty ones, so that a
 * record which loses an item actually clears the old value rather than leaving
 * it stranded in the sheet.
 */
export function buildRecord({ id, time, type, notes, items, enteredBy, slotCount }) {
  const record = {
    id: id || crypto.randomUUID(),
    time: time || new Date().toISOString(),
    type: type,
    notes: notes || '',
    entered_by: enteredBy || ''
  };

  for (let slot = 1; slot <= slotCount; slot++) {
    const item = items[slot - 1];
    record['item' + slot] = item ? item.name : '';
    record['amount' + slot] = item && item.amount !== null && item.amount !== undefined
      ? item.amount
      : '';
  }

  return record;
}

/** How many items an entry may still gain, given the sheet's width. */
export function remainingSlots(items, slotCount) {
  return Math.max(0, slotCount - items.length);
}

// ---------------------------------------------------------------------------
// Vocabulary derived from history.
//
// Because the columns are generic, every suggestion list is built by filtering
// on `type` first: frequent foods come from אוכל rows, frequent symptoms from
// תסמין rows.
// ---------------------------------------------------------------------------

/**
 * Every distinct item name ever used for a type, most recent first. Feeds the
 * autocomplete.
 */
export function itemNamesForType(rows, type, slotCount) {
  const seen = new Set();
  const names = [];

  // Walk newest first so the ordering is useful even before frequency matters.
  const sorted = rows
    .filter(function (row) { return row.type === type; })
    .sort(function (a, b) { return String(b.time).localeCompare(String(a.time)); });

  sorted.forEach(function (row) {
    readRecord(row, slotCount).items.forEach(function (item) {
      if (!seen.has(item.name)) {
        seen.add(item.name);
        names.push(item.name);
      }
    });
  });

  return names;
}

/**
 * The most frequently used item names for a type, counted over the most recent
 * `fromLastEntries` entries of that type. Feeds the one-tap buttons.
 */
export function frequentItemNames(rows, type, slotCount, { fromLastEntries = 50, limit = 4 } = {}) {
  const recent = rows
    .filter(function (row) { return row.type === type; })
    .sort(function (a, b) { return String(a.time).localeCompare(String(b.time)); })
    .slice(-fromLastEntries);

  const counts = new Map();
  recent.forEach(function (row) {
    readRecord(row, slotCount).items.forEach(function (item) {
      counts.set(item.name, (counts.get(item.name) || 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); })
    .slice(0, limit)
    .map(function (pair) { return pair[0]; });
}
