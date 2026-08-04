/**
 * Food and Poop -- server.
 *
 * A deliberately generic, header-row-driven API over one sheet tab. It knows
 * about `id`, and about which columns hold date-times, and nothing else. It has
 * never heard of meals, poops or symptoms; all of that lives in the client, so
 * that adding a field or a vocabulary never requires a redeploy.
 *
 * Four operations: list, add, update, delete.
 *
 * Transport notes, both of which are load-bearing:
 *   - POST bodies arrive as Content-Type: text/plain and are parsed with
 *     JSON.parse. Apps Script does not answer CORS preflight, so application/
 *     json fails. Do not "fix" this.
 *   - Every response is JSON via ContentService.
 */

// ---------------------------------------------------------------------------
// Configuration. SHEET_NAME is the tab, not the spreadsheet -- the spreadsheet
// is whichever one this script is bound to, and is never taken from a request.
// ---------------------------------------------------------------------------

const SHEET_NAME = 'log';
const ID_COLUMN = 'id';
const LOCK_TIMEOUT_MS = 20000;

// Columns whose values must round-trip as plain ISO 8601 text. `time` is the
// user's event time; the other two are written by this file and are not the
// user's business.
const DATE_COLUMNS = ['time', 'created_at', 'updated_at'];

// ---------------------------------------------------------------------------
// Entry points.
//
// GET handles list, because a plain GET needs no preflight and is the common
// case on app start. POST handles everything, including list, so the client can
// use one code path if it prefers.
// ---------------------------------------------------------------------------

function doGet(e) {
  return handleRequest_((e && e.parameter) || {});
}

function doPost(e) {
  // The body is text/plain by design; parse it ourselves and merge in any query
  // parameters so that either transport works.
  let body = {};
  if (e && e.postData && e.postData.contents) {
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      return respond_({ ok: false, error: 'Body is not valid JSON: ' + err });
    }
  }
  const params = Object.assign({}, (e && e.parameter) || {}, body);
  return handleRequest_(params);
}

/**
 * Single dispatch point for both verbs. Checks the shared token, then routes.
 */
function handleRequest_(params) {
  try {
    if (!isTokenValid_(params.token)) {
      return respond_({ ok: false, error: 'Bad or missing token' });
    }

    switch (params.action) {
      case 'list':
        return respond_(listRecords_());
      case 'add':
        return respond_(addRecord_(params.record));
      case 'update':
        return respond_(updateRecord_(params.record));
      case 'delete':
        return respond_(deleteRecord_(params.id));
      default:
        return respond_({ ok: false, error: 'Unknown action: ' + params.action });
    }
  } catch (err) {
    // Never let a raw exception escape as an HTML error page -- the client only
    // knows how to read JSON.
    return respond_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

// ---------------------------------------------------------------------------
// Operations.
// ---------------------------------------------------------------------------

/**
 * Returns every row as an object, plus the header row itself. The client uses
 * the headers to discover how many itemN/amountN slots the sheet currently has,
 * so widening the sheet needs no code change here or there.
 */
function listRecords_() {
  const sheet = getSheet_();
  const headers = getHeaders_(sheet);

  // Give any hand-entered rows an id before handing them out, otherwise the
  // client has no stable way to edit them.
  backfillMissingIds_(sheet, headers);

  const values = sheet.getDataRange().getValues();
  const rows = [];

  // Row 0 is the header; every later row becomes an object keyed by header name.
  for (let i = 1; i < values.length; i++) {
    if (isBlankRow_(values[i])) continue;
    rows.push(rowToObject_(headers, values[i]));
  }

  return { ok: true, headers: headers, rows: rows };
}

/**
 * Appends one record. The client supplies the id and the event time; we supply
 * created_at and updated_at, which are ours and not the user's.
 */
function addRecord_(record) {
  if (!record || typeof record !== 'object') {
    return { ok: false, error: 'add requires a record object' };
  }

  return withLock_(function () {
    const sheet = getSheet_();
    const headers = getHeaders_(sheet);
    const now = nowIso_();

    // Fill in anything the client legitimately left to us.
    const complete = Object.assign({}, record);
    if (!complete[ID_COLUMN]) complete[ID_COLUMN] = Utilities.getUuid();
    complete.created_at = now;
    complete.updated_at = now;

    sheet.appendRow(objectToRow_(headers, complete));

    // appendRow can let Sheets reinterpret text that looks like a date, so
    // re-assert plain text on the row we just wrote.
    forcePlainTextOnRow_(sheet, headers, sheet.getLastRow(), complete);

    return { ok: true, record: complete };
  });
}

/**
 * Merges the supplied fields into the row with a matching id. Fields that are
 * absent from the payload are left alone, so a partial update is safe.
 */
function updateRecord_(record) {
  if (!record || !record[ID_COLUMN]) {
    return { ok: false, error: 'update requires a record with an id' };
  }

  return withLock_(function () {
    const sheet = getSheet_();
    const headers = getHeaders_(sheet);
    const rowNumber = findRowNumberById_(sheet, headers, record[ID_COLUMN]);

    if (rowNumber === -1) {
      return { ok: false, error: 'No record with id ' + record[ID_COLUMN] };
    }

    // Start from what is on the sheet so unspecified fields survive.
    const existingValues = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
    const merged = rowToObject_(headers, existingValues);

    Object.keys(record).forEach(function (key) {
      if (headers.indexOf(key) !== -1 && key !== 'created_at') {
        merged[key] = record[key];
      }
    });
    merged.updated_at = nowIso_();

    sheet.getRange(rowNumber, 1, 1, headers.length).setValues([objectToRow_(headers, merged)]);
    forcePlainTextOnRow_(sheet, headers, rowNumber, merged);

    return { ok: true, record: merged };
  });
}

/**
 * Removes the row with a matching id. Row numbers are never trusted from the
 * client -- we always rescan, because we edit this sheet by hand.
 */
function deleteRecord_(id) {
  if (!id) return { ok: false, error: 'delete requires an id' };

  return withLock_(function () {
    const sheet = getSheet_();
    const headers = getHeaders_(sheet);
    const rowNumber = findRowNumberById_(sheet, headers, id);

    if (rowNumber === -1) {
      return { ok: false, error: 'No record with id ' + id };
    }

    sheet.deleteRow(rowNumber);
    return { ok: true, id: id };
  });
}

// ---------------------------------------------------------------------------
// Sheet helpers.
// ---------------------------------------------------------------------------

/**
 * The bound spreadsheet's log tab. Note that no request can influence which
 * spreadsheet this is -- that is what keeps the blast radius to one file.
 */
function getSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No sheet named "' + SHEET_NAME + '"');
  return sheet;
}

/** The header row, trimmed, defining the whole schema. */
function getHeaders_(sheet) {
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  return headers.map(function (h) { return String(h).trim(); });
}

/** Turns a values array into an object keyed by header name. */
function rowToObject_(headers, values) {
  const record = {};
  headers.forEach(function (header, index) {
    if (!header) return;
    const value = values[index];
    record[header] = value === null || value === undefined ? '' : value;
  });
  return record;
}

/** Turns an object back into a values array in header order. */
function objectToRow_(headers, record) {
  return headers.map(function (header) {
    const value = record[header];
    return value === null || value === undefined ? '' : value;
  });
}

/** Finds the 1-based sheet row for an id, or -1. Scans; never trusts indices. */
function findRowNumberById_(sheet, headers, id) {
  const idIndex = headers.indexOf(ID_COLUMN);
  if (idIndex === -1) throw new Error('No "' + ID_COLUMN + '" column in the header row');

  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idIndex]) === String(id)) return i + 1;
  }
  return -1;
}

/**
 * Gives an id to any row that has data but no id -- typically a row someone
 * typed straight into Sheets. Without this such rows cannot be edited from the
 * app, because there is nothing stable to address them by.
 */
function backfillMissingIds_(sheet, headers) {
  const idIndex = headers.indexOf(ID_COLUMN);
  if (idIndex === -1) return;

  const values = sheet.getDataRange().getValues();
  const updates = [];

  for (let i = 1; i < values.length; i++) {
    if (isBlankRow_(values[i])) continue;
    if (!values[i][idIndex]) updates.push(i + 1);
  }
  if (updates.length === 0) return;

  // Only take the lock when there is actually something to write.
  withLock_(function () {
    updates.forEach(function (rowNumber) {
      sheet.getRange(rowNumber, idIndex + 1).setValue(Utilities.getUuid());
    });
    return { ok: true };
  });
}

/**
 * Re-asserts plain-text formatting and re-writes the date cells as strings.
 * Sheets will happily turn "2026-08-04T21:15:00.000Z" into a locale-dependent
 * date value otherwise, and the whole log would quietly drift.
 */
function forcePlainTextOnRow_(sheet, headers, rowNumber, record) {
  DATE_COLUMNS.forEach(function (columnName) {
    const index = headers.indexOf(columnName);
    if (index === -1) return;

    const cell = sheet.getRange(rowNumber, index + 1);
    cell.setNumberFormat('@');
    if (record[columnName]) cell.setValue(String(record[columnName]));
  });
}

/** True when every cell in the row is empty. */
function isBlankRow_(values) {
  return values.every(function (value) {
    return value === '' || value === null || value === undefined;
  });
}

// ---------------------------------------------------------------------------
// Plumbing.
// ---------------------------------------------------------------------------

/** Compares against the token in Script Properties, never a hardcoded string. */
function isTokenValid_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return Boolean(expected) && token === expected;
}

/**
 * Serialises writes so two phones submitting at the same moment cannot
 * interleave a read-modify-write.
 */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_TIMEOUT_MS);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** ISO 8601, always UTC, always a string. */
function nowIso_() {
  return new Date().toISOString();
}

/** Every response leaves through here, as JSON. */
function respond_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// One-off maintenance. Run by hand from the editor; not reachable over HTTP.
// ---------------------------------------------------------------------------

/**
 * Formats the date columns as plain text. The same thing SETUP.md asks you to
 * do by hand; run this if you ever add a date column and forget.
 */
function setup_formatDateColumns() {
  const sheet = getSheet_();
  const headers = getHeaders_(sheet);

  DATE_COLUMNS.forEach(function (columnName) {
    const index = headers.indexOf(columnName);
    if (index === -1) return;
    sheet.getRange(1, index + 1, sheet.getMaxRows()).setNumberFormat('@');
  });

  Logger.log('Formatted as plain text: ' + DATE_COLUMNS.join(', '));
}

// ---------------------------------------------------------------------------
// Tests. Run these from the editor with the Run button -- no deploy needed.
// They write to the sheet and then clean up after themselves.
// ---------------------------------------------------------------------------

/** Builds the fake event object that doPost would receive. */
function fakePost_(payload) {
  payload.token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return { parameter: {}, postData: { contents: JSON.stringify(payload), type: 'text/plain' } };
}

/** Runs a request and returns the parsed response, as the client would see it. */
function callPost_(payload) {
  return JSON.parse(doPost(fakePost_(payload)).getContent());
}

function test_list() {
  const result = callPost_({ action: 'list' });
  Logger.log('ok: %s, rows: %s', result.ok, result.rows && result.rows.length);
  Logger.log('headers: %s', JSON.stringify(result.headers));
  if (!result.ok) Logger.log('error: %s', result.error);
  return result;
}

/**
 * Checks the two things that must be true before anything else can work: the
 * TOKEN script property exists, and the log tab is reachable. Run this first
 * when something fails for no obvious reason.
 */
function test_environment() {
  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  Logger.log('TOKEN property set: %s', Boolean(token));
  if (token) Logger.log('TOKEN starts with: %s…', String(token).slice(0, 8));

  const properties = PropertiesService.getScriptProperties().getProperties();
  Logger.log('script properties present: %s', JSON.stringify(Object.keys(properties)));

  try {
    const sheet = getSheet_();
    Logger.log('sheet "%s" found, %s rows', SHEET_NAME, sheet.getLastRow());
    Logger.log('headers: %s', JSON.stringify(getHeaders_(sheet)));
  } catch (err) {
    Logger.log('sheet problem: %s', err.message);
  }
}

function test_badToken() {
  const response = doPost({
    parameter: {},
    postData: { contents: JSON.stringify({ action: 'list', token: 'wrong' }), type: 'text/plain' }
  });
  const result = JSON.parse(response.getContent());
  Logger.log('should be false: %s -- %s', result.ok, result.error);
  return result;
}

/**
 * Full round trip: add, confirm it lists, update it, confirm the change stuck,
 * then delete it and confirm it is gone. Leaves the sheet as it found it.
 */
function test_roundTrip() {
  const id = Utilities.getUuid();
  const eventTime = new Date().toISOString();

  // Add a throwaway meal with two items.
  const added = callPost_({
    action: 'add',
    record: {
      id: id,
      time: eventTime,
      type: 'אוכל',
      notes: 'שורת בדיקה -- אפשר למחוק',
      item1: 'בננה', amount1: 100,
      item2: 'לחם', amount2: 50,
      entered_by: 'test'
    }
  });
  Logger.log('add ok: %s', added.ok);

  // It should now come back from list, with the timestamp intact as a string.
  const listed = callPost_({ action: 'list' });
  const found = listed.rows.filter(function (r) { return r.id === id; })[0];
  Logger.log('found in list: %s', Boolean(found));
  Logger.log('time round-tripped as string: %s (%s)', found && found.time, typeof (found && found.time));
  Logger.log('time unchanged: %s', found && found.time === eventTime);

  // Partial update: change one amount, leave everything else alone.
  const updated = callPost_({ action: 'update', record: { id: id, amount1: 200 } });
  Logger.log('update ok: %s, amount1: %s, item1 still there: %s',
    updated.ok, updated.record && updated.record.amount1, updated.record && updated.record.item1);
  Logger.log('created_at preserved: %s', updated.record && updated.record.created_at === added.record.created_at);
  Logger.log('updated_at moved: %s', updated.record && updated.record.updated_at !== added.record.updated_at);

  // Clean up.
  const deleted = callPost_({ action: 'delete', id: id });
  Logger.log('delete ok: %s', deleted.ok);

  const after = callPost_({ action: 'list' });
  const stillThere = after.rows.some(function (r) { return r.id === id; });
  Logger.log('gone from sheet: %s', !stillThere);

  return { added: added, updated: updated, deleted: deleted };
}

/** Confirms the client can discover the item slot count from the headers. */
function test_slotDiscovery() {
  const headers = getHeaders_(getSheet_());
  const itemSlots = headers.filter(function (h) { return /^item\d+$/.test(h); }).length;
  const amountSlots = headers.filter(function (h) { return /^amount\d+$/.test(h); }).length;
  Logger.log('item slots: %s, amount slots: %s, matched: %s',
    itemSlots, amountSlots, itemSlots === amountSlots);
  return itemSlots;
}
