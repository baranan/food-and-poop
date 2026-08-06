/**
 * Service worker.
 *
 * Its job is narrow: make the app open with no signal. The write queue already
 * handles logging offline, but that only matters if the app itself loads, which
 * without this it would not.
 *
 * Two deliberate choices:
 *
 *   1. Code and markup are fetched network-first, falling back to the cache.
 *      Cache-first would be faster, but it is also how you end up spending an
 *      hour convinced your edits did not apply. Online, you always get the
 *      current build; offline, you get the last one that worked.
 *
 *   2. Photographs are cache-first. They are large, they never change, and
 *      re-downloading a megabyte of tofu on every load is pointless.
 *
 * Requests to the Apps Script API are never touched. A cached reply would mean
 * showing a stale log, which is worse than showing none.
 *
 * Bump CACHE_VERSION whenever the precache list or the logic here changes.
 */

const CACHE_VERSION = 'v2';
const CACHE_NAME = 'food-and-poop-' + CACHE_VERSION;

// ---------------------------------------------------------------------------
// What has to be listed by hand.
//
// Note what is *not* here: the ES modules under js/. index.html loads
// js/app.js as a module, so the browser fetches the whole import graph on the
// first visit, and the network-first handler below caches each file as it goes.
// Listing them as well would mean maintaining a copy of the file tree, and the
// failure mode of forgetting one is invisible -- a module missing from the list
// only breaks the app offline, and the cache.add below merely warns. So the
// modules look after themselves, and adding one needs no edit here.
//
// What remains is what the import graph cannot reveal. The photographs are
// loading="lazy" and are never fetched until someone opens an amount picker, so
// they would otherwise be missing on a device that installed the app and went
// offline. The icons are fetched by the OS, not the page. And the shell is
// listed because a cold start with nothing cached has to render something.
//
// Relative paths, because the app is served from a project subpath on Pages.
// ---------------------------------------------------------------------------

const PRECACHE = [
  // The shell. js/app.js is the one module named here, as the entry point that
  // pulls in all the others.
  './',
  'index.html',
  'manifest.json',
  'css/app.css',
  'js/app.js',

  // The calibration photographs, plus the manifest of their true sizes.
  'img/sizes.json',
  'img/food-10.png', 'img/food-50.png', 'img/food-100.png',
  'img/food-200.png', 'img/food-300.png', 'img/food-400.png',
  'img/poop-10.png', 'img/poop-50.png', 'img/poop-100.png',
  'img/poop-200.png', 'img/poop-300.png', 'img/poop-400.png',

  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

// ---------------------------------------------------------------------------
// Install: fill the cache, then take over immediately rather than waiting for
// every tab to close.
// ---------------------------------------------------------------------------

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        // addAll fails wholesale if any single file 404s, which would leave the
        // worker uninstalled and the failure silent. Add them individually and
        // report what went missing.
        return Promise.all(PRECACHE.map(function (path) {
          return cache.add(path).catch(function (err) {
            console.warn('[sw] could not precache', path, err);
          });
        }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

// ---------------------------------------------------------------------------
// Activate: drop caches from earlier versions.
// ---------------------------------------------------------------------------

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(names
          .filter(function (name) {
            return name.startsWith('food-and-poop-') && name !== CACHE_NAME;
          })
          .map(function (name) { return caches.delete(name); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

// ---------------------------------------------------------------------------
// Fetch.
// ---------------------------------------------------------------------------

/** Photographs and icons: cache-first. They are big and they never change. */
function isImage(url) {
  return /\/(img|icons)\//.test(url.pathname) && /\.png$/.test(url.pathname);
}

self.addEventListener('fetch', function (event) {
  const request = event.request;

  // Writes and anything non-GET must reach the network untouched.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache the API. A stale log is worse than no log.
  if (url.hostname.endsWith('script.google.com')) return;

  // Only handle our own origin; leave anything else alone.
  if (url.origin !== self.location.origin) return;

  if (isImage(url)) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        return cached || fetch(request).then(function (response) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
          return response;
        });
      })
    );
    return;
  }

  // Everything else -- HTML, CSS, JS, the size manifest -- is network-first, so
  // an online device always runs the current build.
  event.respondWith(
    fetch(request)
      .then(function (response) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        return response;
      })
      .catch(function () {
        return caches.match(request).then(function (cached) {
          // A navigation that misses the cache still has to render something.
          return cached || caches.match('index.html');
        });
      })
  );
});
