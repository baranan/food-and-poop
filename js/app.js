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
import { getEnteredBy, setEnteredBy, needsIdentity, PEOPLE } from './identity.js';

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
  food: placeholder,
  poop: placeholder,
  symptom: placeholder,
  history: placeholder,
  analysis: placeholder
});

// ---------------------------------------------------------------------------
// Sync bar. The only place the app admits that writing takes time.
// ---------------------------------------------------------------------------

function renderSyncBar(state) {
  syncBar.className = 'sync-bar';

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

  // Redraw the home screen whenever state changes, so the "last logged" lines
  // and the sync bar stay honest. Other screens redraw themselves; re-rendering
  // a form under the user would throw away what they were typing.
  store.subscribe(function (state) {
    renderSyncBar(state);
    if (router.currentName() === 'home') router.render();
  });

  renderSyncBar(store.getState());

  // Ask who is logging before anything else, but only once per device.
  if (needsIdentity()) {
    renderIdentityChooser(function () { router.start(); });
  } else {
    router.start();
  }

  // Load in the background. The app is usable before this resolves, which is
  // the point of the queue.
  await store.load();
  store.start();
}

start().catch(function (err) {
  console.error('Startup failed:', err);
});
