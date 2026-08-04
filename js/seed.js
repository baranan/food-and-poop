/**
 * Seed data for the mock.
 *
 * An empty log makes half the UI impossible to judge: the four most-frequent
 * food buttons, the autocomplete, and the three-column history all need real
 * volume before you can tell whether they feel right. This generates a couple
 * of weeks of plausible entries.
 *
 * Nothing here is used in production.
 */

// Mirrors the real sheet exactly, so slot discovery from the header row is
// exercised in mock mode too.
export const MOCK_HEADERS = [
  'id', 'time', 'type', 'notes',
  'item1', 'amount1', 'item2', 'amount2', 'item3', 'amount3',
  'item4', 'amount4', 'item5', 'amount5', 'item6', 'amount6',
  'entered_by', 'created_at', 'updated_at'
];

// Vocabularies. Foods are weighted by position -- the earlier ones recur more
// often, so the "four most frequent" buttons have something stable to find.
const FOODS = [
  'לחם', 'בננה', 'יוגורט', 'אורז',
  'עוף', 'פסטה', 'גבינה לבנה', 'ביצה',
  'תפוח', 'מלפפון', 'עגבנייה', 'אבוקדו',
  'קורנפלקס', 'טונה', 'חלב', 'תפוח אדמה'
];

const SYMPTOMS = ['כאב בטן', 'גזים', 'עייפות', 'חוסר תיאבון', 'בחילה', 'פריחה'];

const POOP_KINDS = ['קשה', 'בינוני', 'רך', 'רך מאוד', 'שלשול'];

const AMOUNTS = [10, 50, 100, 200, 300, 400];

const PEOPLE = ['אבא', 'אמא'];

const NOTES = ['', '', '', '', 'אכל הכל', 'סירב לאכול', 'אחרי הגן', 'לפני השינה'];

// ---------------------------------------------------------------------------
// Small random helpers. Deliberately not seeded -- we want a different-looking
// log each time the mock is reset, so the UI is not tuned to one lucky dataset.
// ---------------------------------------------------------------------------

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/** Biased towards the start of the list, so some foods genuinely dominate. */
function pickWeighted(list) {
  const index = Math.floor(Math.abs(Math.random() - Math.random()) * list.length);
  return list[index];
}

function chance(probability) {
  return Math.random() < probability;
}

/** An ISO string for `daysAgo` days back, at the given hour and minute. */
function isoAt(daysAgo, hour, minute) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

/** Builds a blank record with every column present, so rows stay rectangular. */
function blankRecord() {
  const record = {};
  MOCK_HEADERS.forEach(function (header) { record[header] = ''; });
  return record;
}

/** Wraps the shared bookkeeping every generated row needs. */
function makeRecord(time, type, items) {
  const record = blankRecord();
  record.id = crypto.randomUUID();
  record.time = time;
  record.type = type;
  record.notes = pick(NOTES);
  record.entered_by = pick(PEOPLE);
  record.created_at = time;
  record.updated_at = time;

  // Items arrive as [name, amount] pairs and fill item1/amount1 onwards.
  items.forEach(function (pair, index) {
    record['item' + (index + 1)] = pair[0];
    record['amount' + (index + 1)] = pair[1];
  });

  return record;
}

// ---------------------------------------------------------------------------
// Generation.
// ---------------------------------------------------------------------------

/** One day's meals: breakfast, lunch, dinner, and often a snack. */
function generateMeals(daysAgo) {
  const meals = [];
  const sittings = [[7, 45], [12, 30], [18, 15]];
  if (chance(0.6)) sittings.push([16, 0]);

  sittings.forEach(function ([hour, minute]) {
    // One to three foods per meal, which is what makes the item slots worth
    // having in the first place.
    const itemCount = 1 + Math.floor(Math.random() * 3);
    const items = [];
    for (let i = 0; i < itemCount; i++) {
      items.push([pickWeighted(FOODS), pick(AMOUNTS)]);
    }
    meals.push(makeRecord(isoAt(daysAgo, hour, minute), 'אוכל', items));
  });

  return meals;
}

/** Usually one poop a day, occasionally two, occasionally none. */
function generatePoops(daysAgo) {
  const poops = [];
  const count = chance(0.15) ? 0 : (chance(0.25) ? 2 : 1);

  for (let i = 0; i < count; i++) {
    const hour = 8 + Math.floor(Math.random() * 12);
    poops.push(makeRecord(
      isoAt(daysAgo, hour, Math.floor(Math.random() * 60)),
      'קקי',
      [[pick(POOP_KINDS), pick(AMOUNTS)]]
    ));
  }

  return poops;
}

/** Symptoms are the rare event -- roughly one day in three. */
function generateSymptoms(daysAgo) {
  if (!chance(0.35)) return [];

  const itemCount = chance(0.25) ? 2 : 1;
  const items = [];
  for (let i = 0; i < itemCount; i++) {
    items.push([pick(SYMPTOMS), 1 + Math.floor(Math.random() * 10)]);
  }

  const hour = 9 + Math.floor(Math.random() * 12);
  return [makeRecord(isoAt(daysAgo, hour, Math.floor(Math.random() * 60)), 'תסמין', items)];
}

/**
 * A full seed log, newest last, covering `days` days back from today.
 */
export function generateSeedRows(days = 14) {
  let rows = [];

  for (let daysAgo = days; daysAgo >= 0; daysAgo--) {
    rows = rows
      .concat(generateMeals(daysAgo))
      .concat(generatePoops(daysAgo))
      .concat(generateSymptoms(daysAgo));
  }

  // Sort by event time, which is what every view and analysis sorts on.
  rows.sort(function (a, b) { return a.time.localeCompare(b.time); });
  return rows;
}
