/**
 * Formatting helpers, in Hebrew.
 *
 * Kept in one place because the history timeline, the entry forms and the home
 * screen must agree on how a time is written -- if they drift, the same entry
 * appears to have two different timestamps.
 */

/** '04/08 14:30' -- short, since the history list shows many at once. */
export function formatDateTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date)) return String(iso);

  return date.toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

/** '14:30' */
export function formatTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date)) return '';
  return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

/** 'יום ג׳, 4 באוגוסט' -- the day heading in the history timeline. */
export function formatDayHeading(iso) {
  const date = new Date(iso);
  if (isNaN(date)) return '';

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) return 'היום';
  if (isSameDay(date, yesterday)) return 'אתמול';

  return date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/**
 * 'לפני 3 שעות'. Used on the home screen to answer the question people
 * actually have when they pick up the phone: has this already been logged?
 */
export function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  if (isNaN(then)) return '';

  const minutes = Math.floor((Date.now() - then.getTime()) / 60000);

  // A clock skew between two phones can put an entry slightly in the future.
  if (minutes < 1) return 'עכשיו';
  if (minutes === 1) return 'לפני דקה';
  if (minutes < 60) return 'לפני ' + minutes + ' דקות';

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return 'לפני שעה';
  if (hours < 24) return 'לפני ' + hours + ' שעות';

  const days = Math.floor(hours / 24);
  if (days === 1) return 'אתמול';
  if (days < 30) return 'לפני ' + days + ' ימים';

  return formatDateTime(iso);
}

/** The ISO string for 'now', which is what every new entry defaults to. */
export function nowIso() {
  return new Date().toISOString();
}
