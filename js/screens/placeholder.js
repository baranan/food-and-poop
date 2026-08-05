/**
 * Stand-in for screens not built yet.
 *
 * It exists so the home buttons all lead somewhere with a way back, rather than
 * silently doing nothing -- which on a phone is indistinguishable from a bug.
 */

export function createPlaceholderScreen(router) {
  return function placeholderScreen(title) {
    const screen = document.createElement('div');
    screen.className = 'screen';

    const box = document.createElement('div');
    box.className = 'placeholder';
    box.textContent = 'המסך הזה עדיין לא נבנה';

    const back = document.createElement('button');
    back.className = 'back-button';
    back.textContent = 'חזרה';
    back.addEventListener('click', function () { router.goHome(); });

    screen.append(box, back);
    return screen;
  };
}
