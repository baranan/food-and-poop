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
 * Bump CACHE_VERSION whenever the precache list changes.
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = 'food-and-poop-' + CACHE_VERSION;

// Everything needed for a cold start with no network. Relative paths, because
// the app is served from a project subpath on GitHub Pages.
const PRECACHE = [
  './',
  'index.html',
  'manifest.json',
  'css/app.css',

  'js/app.js',
  'js/api.js',
  'js/api.mock.js',
  'js/api.remote.js',
  'js/config.js',
  'js/errors.js',
  'js/format.js',
  'js/identity.js',
  'js/imageSizes.js',
  'js/queue.js',
  'js/records.js',
  'js/router.js',
  'js/seed.js',
  'js/store.js',
  'js/serviceWorker.js',
  'js/typeStyle.js',
  'js/ui/debug.js',
  'js/ui/fields.js',
  'js/screens/entryForm.js',
  'js/screens/history.js',
  'js/screens/home.js',
  'js/screens/placeholder.js',
  'js/screens/saved.js',

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
