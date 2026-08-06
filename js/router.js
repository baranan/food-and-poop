/**
 * A hash router, about as small as one can be.
 *
 * Screens are functions that return a DOM element. The hash is `#name` or
 * `#name/param`, so `#edit/<uuid>` works without any parsing machinery.
 *
 * Using the hash rather than the History API matters here: the app is served
 * from a GitHub Pages subpath, and hash routes never ask the server for a URL
 * it does not have.
 */

export function createRouter({ routes, outlet, onBeforeLeave }) {
  let current = null;

  /**
   * Splits `#saved/abc/history` into `['saved', 'abc', 'history']`.
   *
   * Everything after the screen name is handed to it as arguments. The second
   * segment is usually a record id; a third is used to say where the user came
   * from, so a screen can send them back there rather than always home.
   */
  function parse() {
    const raw = location.hash.replace(/^#/, '');
    if (!raw) return ['home'];
    const segments = raw.split('/');
    return segments[0] ? segments : ['home'].concat(segments.slice(1));
  }

  function render() {
    const [name, ...args] = parse();
    const screen = routes[name] || routes.home;

    // Let the outgoing screen object -- an entry form with unsaved input can
    // ask for confirmation rather than being torn out from under the user.
    if (current && onBeforeLeave && onBeforeLeave(current) === false) return;

    outlet.replaceChildren(screen(...args));
    current = name;

    // A new screen always starts at the top; otherwise going back into a long
    // history list leaves you halfway down an unrelated page.
    window.scrollTo(0, 0);
  }

  /** Navigate. `path` is 'home', 'food', 'edit/<id>' and so on. */
  function go(path) {
    if (location.hash === '#' + path) render();
    else location.hash = path;
  }

  /** Back to the home screen. */
  function goHome() {
    go('home');
  }

  function start() {
    window.addEventListener('hashchange', render);
    render();
  }

  return { start, render, go, goHome, currentName: () => current };
}
