/**
 * Application bootstrap.
 *
 * Wires together the debug panel, the mock banner, the identity prompt, the
 * router and the sync bar, then hands control to the store.
 *
 * Note the deliberate absence of a service worker registration here. It belongs
 * in production only -- a stale cache during development costs hours convincing
 * yourself your edits did not apply -- and is added in a later step.
 */

import * as store from './store.js';
import { usingMock } from './api.js';
import { createRouter } from './router.js';
import { initDebug, attachLongPress } from './ui/debug.js';
import { createHomeScreen } from './screens/home.js';
import { createPlaceholderScreen } from './screens/placeholder.js';
import { createEntryFormScreen } from './screens/entryForm.js';
import { createSavedScreen } from './screens/saved.js';
import { createHistoryScreen } from './screens/history.js';
import { getEnteredBy, setEnteredBy, needsIdentity, PEOPLE } from './identity.js';
import { loadImageSizes } from './imageSizes.js';
import { registerServiceWorker } from './serviceWorker.js';
import { TYPES } from './records.js';

// ---------------------------------------------------------------------------
// Elements from the shell.
// ---------------------------------------------------------------------------

const bannerSlot = document.getElementById('banner');
const outlet = document.getElementById('outlet');
const syncBar = document.getElementById('sync');
const titleEl = document.getElementById('title');
const whoButton = document.getElementById('who');

// ---------------------------------------------------------------------------
// Mock banner. Loud on purpose: logging real meals into localStorage and losing
// them is the failure this prevents.
// ---------------------------------------------------------------------------

function renderMockBanner() {
  if (!usingMock) return;
  const banner = document.createElement('div');
  banner.className = 'mock-banner';
  banner.textContent = 'מצב בדיקה — הנתונים אינם נשמרים בגיליון';
  bannerSlot.appendChild(banner);
}

// ---------------------------------------------------------------------------
// Identity. There is no login; `entered_by` is a per-device setting, asked once.
// ---------------------------------------------------------------------------

function renderIdentityChooser(onChosen) {
  const box = document.createElement('div');
  box.className = 'identity';

  const question = document.createElement('h2');
  question.textContent = 'מי רושם?';

  const hint = document.createElement('p');
  hint.style.color = 'var(--muted)';
  hint.style.margin = '0';
  hint.textContent = 'נשמר במכשיר הזה, אפשר לשנות בכל רגע';

  const choices = document.createElement('div');
  choices.className = 'choices';

  PEOPLE.forEach(function (person) {
    const button = document.createElement('button');
    button.textContent = person;
    button.addEventListener('click', function () {
      setEnteredBy(person);
      updateWhoButton();
      onChosen();
    });
    choices.appendChild(button);
  });

  box.append(question, hint, choices);
  outlet.replaceChildren(box);
}

function updateWhoButton() {
  whoButton.textContent = getEnteredBy() || 'מי?';
}

// ---------------------------------------------------------------------------
// Router.
// ---------------------------------------------------------------------------

// Screens need the router in order to navigate, and the router needs the
// screens in order to render them. The knot is untied by handing the router an
// empty object and filling it afterwards -- it holds the same reference, so the
// screens are there by the time anything is rendered.
const routes = {};

const router = createRouter({ outlet: outlet, routes: routes });

const placeholder = createPlaceholderScreen(router);

Object.assign(routes, {
  home: createHomeScreen(router),

  // One form implementation, three types. The differences live in CONFIG inside
  // entryForm.js: how an item is named, how an amount is picked, and whether
  // more than one item is allowed.
  food: createEntryFormScreen(TYPES.FOOD, router),
  poop: createEntryFormScreen(TYPES.POOP, router),
  symptom: createEntryFormScreen(TYPES.SYMPTOM, router),
  saved: createSavedScreen(router),

  history: createHistoryScreen(router),
  analysis: placeholder
});

// ---------------------------------------------------------------------------
// Sync bar. The only place the app admits that writing takes time.
// ---------------------------------------------------------------------------

/** What was lost, in the words of the thing the user was doing at the time. */
function failureText(kind) {
  if (kind === 'update') return 'תיקון לא נשמר';
  if (kind === 'remove') return 'מחיקה לא בוצעה';
  return 'רישום לא נשמר';
}

function renderSyncBar(state) {
  syncBar.className = 'sync-bar';

  // A dropped write outranks everything else here. The row has already vanished
  // from the screen, so without this the meal you just logged would disappear
  // with no explanation at all.
  if (state.lastError) {
    syncBar.classList.add('error');
    syncBar.textContent = failureText(state.lastError.kind) + ' — הקש לסגירה';
    return;
  }

  if (state.pendingCount > 0) {
    syncBar.classList.add('pending');
    syncBar.textContent = state.pendingCount === 1
      ? 'רישום אחד ממתין לשמירה'
      : state.pendingCount + ' רישומים ממתינים לשמירה';
    return;
  }

  if (state.loadError) {
    syncBar.classList.add('error');
    syncBar.textContent = 'אין חיבור — אפשר להמשיך לרשום, זה יישמר אחר כך';
    return;
  }

  if (!state.loaded) {
    syncBar.textContent = 'טוען…';
    return;
  }

  syncBar.textContent = 'הכול שמור';
}

// ---------------------------------------------------------------------------
// Startup.
// ---------------------------------------------------------------------------

async function start() {
  initDebug();
  attachLongPress(titleEl);
  renderMockBanner();
  updateWhoButton();

  whoButton.addEventListener('click', function () {
    renderIdentityChooser(function () { router.render(); });
  });

  // The failure message stays until it is acknowledged, so it cannot be missed
  // by looking away for a moment.
  syncBar.addEventListener('click', function () { store.clearLastError(); });

  // Redraw the home screen whenever state changes, so the "last logged" lines
  // and the sync bar stay honest. Other screens are left alone -- re-rendering
  // a form under the user would throw away what they were typing.
  //
  // The one exception is the moment the schema first becomes known: a form
  // rendered before that has no item slots to draw, so it must be rebuilt.
  let schemaWasKnown = store.schemaKnown();

  store.subscribe(function (state) {
    renderSyncBar(state);

    const schemaIsKnown = store.schemaKnown();
    const schemaJustArrived = schemaIsKnown && !schemaWasKnown;
    schemaWasKnown = schemaIsKnown;

    // Nothing here may draw before the router has put up a screen of its own.
    // On a device's first run the identity chooser is sitting in the outlet
    // waiting for an answer, and the schema arriving a second or two later
    // would otherwise paint the home screen straight over it -- leaving
    // entered_by empty for good.
    if (router.currentName() === null) return;

    if (router.currentName() === 'home' || schemaJustArrived) router.render();
  });

  // The app title and the identity chip only earn their row on the home screen.
  // Every other screen names itself, so hide the chrome there.
  function updateChrome() {
    const onHome = (location.hash.replace(/^#/, '').split('/')[0] || 'home') === 'home';
    document.querySelector('.header').hidden = !onHome;
  }
  window.addEventListener('hashchange', updateChrome);
  updateChrome();

  renderSyncBar(store.getState());

  // The quantity buttons need the tiles' true sizes before they can be drawn in
  // proportion, and this is a 600-byte local file.
  await loadImageSizes();

  // Ask who is logging before anything else, but only once per device.
  if (needsIdentity()) {
    renderIdentityChooser(function () { router.start(); });
  } else {
    router.start();
  }

  // Production only -- see the comment in serviceWorker.js for why.
  registerServiceWorker();

  // Load in the background. The app is usable before this resolves, which is
  // the point of the queue.
  await store.load();
  store.start();
}

start().catch(function (err) {
  console.error('Startup failed:', err);
});
