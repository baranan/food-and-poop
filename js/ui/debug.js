/**
 * On-screen debug log.
 *
 * There is no Mac here, so iPhone Safari cannot be remote-debugged. Without
 * this panel, a bug that only happens on the iPhone is invisible. It mirrors
 * console output and catches uncaught errors, so something is always recorded
 * by the time you think to look.
 *
 * Opened by long-pressing the title, or with ?debug=1. Deliberately hard to
 * reach by accident.
 */

const MAX_LINES = 300;
const lines = [];
let listEl = null;
let panelEl = null;

/** Adds a line to the buffer and, if the panel is open, to the screen. */
function record(level, args) {
  const text = args.map(function (value) {
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch (err) { return String(value); }
  }).join(' ');

  const stamp = new Date().toLocaleTimeString('he-IL');
  lines.push({ level, text: stamp + '  ' + text });
  if (lines.length > MAX_LINES) lines.shift();

  if (listEl) appendLine(lines[lines.length - 1]);
}

function appendLine(line) {
  const div = document.createElement('div');
  if (line.level !== 'log') div.className = line.level;
  div.textContent = line.text;
  listEl.appendChild(div);
  listEl.scrollTop = listEl.scrollHeight;
}

/**
 * Wraps console so ordinary logging from anywhere in the app ends up here too,
 * without every module needing to know this panel exists.
 */
function interceptConsole() {
  ['log', 'warn', 'error'].forEach(function (level) {
    const original = console[level].bind(console);
    console[level] = function (...args) {
      record(level, args);
      original(...args);
    };
  });

  window.addEventListener('error', function (event) {
    record('error', ['Uncaught:', event.message, 'at', event.filename + ':' + event.lineno]);
  });

  window.addEventListener('unhandledrejection', function (event) {
    record('error', ['Unhandled rejection:', String(event.reason)]);
  });
}

/** Builds the panel, hidden until asked for. */
function buildPanel() {
  const panel = document.createElement('div');
  panel.className = 'debug-panel';
  panel.hidden = true;

  const bar = document.createElement('div');
  bar.className = 'bar';

  const title = document.createElement('strong');
  title.textContent = 'יומן';
  title.style.marginInlineEnd = 'auto';

  const copyButton = document.createElement('button');
  copyButton.textContent = 'העתק';
  copyButton.addEventListener('click', function () {
    const text = lines.map(function (line) { return line.text; }).join('\n');
    navigator.clipboard.writeText(text).then(
      function () { copyButton.textContent = 'הועתק'; },
      function () { copyButton.textContent = 'נכשל'; }
    );
    setTimeout(function () { copyButton.textContent = 'העתק'; }, 1500);
  });

  const clearButton = document.createElement('button');
  clearButton.textContent = 'נקה';
  clearButton.addEventListener('click', function () {
    lines.length = 0;
    listEl.replaceChildren();
  });

  const closeButton = document.createElement('button');
  closeButton.textContent = 'סגור';
  closeButton.addEventListener('click', function () { panel.hidden = true; });

  bar.append(title, copyButton, clearButton, closeButton);

  listEl = document.createElement('div');
  listEl.className = 'lines';

  panel.append(bar, listEl);
  return panel;
}

/** Opens the panel, redrawing everything buffered so far. */
export function openDebugPanel() {
  if (!panelEl) return;
  listEl.replaceChildren();
  lines.forEach(appendLine);
  panelEl.hidden = false;
}

/**
 * Makes an element a long-press target for opening the panel. Used on the
 * title, so there is a way in from a phone with no keyboard and no dev tools.
 */
export function attachLongPress(element, holdMs = 900) {
  let timer = null;

  const start = function () {
    clearTimeout(timer);
    timer = setTimeout(openDebugPanel, holdMs);
  };
  const cancel = function () { clearTimeout(timer); };

  element.addEventListener('touchstart', start, { passive: true });
  element.addEventListener('touchend', cancel);
  element.addEventListener('touchmove', cancel, { passive: true });
  element.addEventListener('mousedown', start);
  element.addEventListener('mouseup', cancel);
  element.addEventListener('mouseleave', cancel);
}

/** Call once at startup, before anything else logs. */
export function initDebug() {
  interceptConsole();
  panelEl = buildPanel();
  document.body.appendChild(panelEl);

  if (new URLSearchParams(location.search).get('debug') === '1') openDebugPanel();

  console.log('Debug panel ready.', navigator.userAgent);
}
