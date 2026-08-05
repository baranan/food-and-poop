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

  /** Splits `#food/abc` into `['food', 'abc']`. */
  function parse() {
    const raw = location.hash.replace(/^#/, '');
    if (!raw) return ['home', undefined];
    const [name, param] = raw.split('/');
    return [name || 'home', param];
  }

  function render() {
    const [name, param] = parse();
    const screen = routes[name] || routes.home;

    // Let the outgoing screen object -- an entry form with unsaved input can
    // ask for confirmation rather than being torn out from under the user.
    if (current && onBeforeLeave && onBeforeLeave(current) === false) return;

    outlet.replaceChildren(screen(param));
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
