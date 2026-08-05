/**
 * Service worker registration -- production only.
 *
 * Deliberately never registers on localhost. A service worker holding an old
 * build during development is the single most expensive kind of bug here,
 * because it looks exactly like your edits not applying, and you can lose an
 * afternoon to it before suspecting the cache.
 *
 * So: on GitHub Pages it registers; on 127.0.0.1 or localhost it does not, and
 * it actively unregisters anything left behind from a previous visit.
 */

/** True when this is a development server rather than the deployed site. */
function isDevelopment() {
  return ['localhost', '127.0.0.1', '::1', ''].includes(location.hostname);
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  if (isDevelopment()) {
    // Clean up after any worker registered by an earlier build, so a stale
    // cache cannot follow you into a development session.
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      registrations.forEach(function (registration) {
        registration.unregister();
        console.log('Unregistered a service worker (development).');
      });
    });
    return;
  }

  // Register after load so it never competes with the first paint.
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js')
      .then(function (registration) {
        console.log('Service worker registered.', registration.scope);
      })
      .catch(function (err) {
        console.warn('Service worker registration failed:', err);
      });
  });
}
