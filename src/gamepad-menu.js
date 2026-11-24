import { newlyPressed } from './controls.js';

export function createGamepadMenu() {
  let direction = '', nextRepeat = 0, lastRoot = null;
  return {
    update(root, defaultFocus, scrollRegion, gamepad, previousButtons, now, dt, onBack) {
      if (root !== lastRoot) { direction = ''; nextRepeat = 0; lastRoot = root; }
      const vertical = gamepad.forward > 0.6 ? -1 : gamepad.forward < -0.6 ? 1 : 0;
      const horizontal = gamepad.right > 0.6 ? 1 : gamepad.right < -0.6 ? -1 : 0;
      const nextDirection = vertical ? `v${vertical}` : horizontal ? `h${horizontal}` : '';
      const activate = newlyPressed(gamepad.buttons, previousButtons, 0);
      const back = newlyPressed(gamepad.buttons, previousButtons, 1);
      if (back) { onBack(); return; }
      const items = Array.from(root.querySelectorAll('button:not([disabled]), input:not([disabled]), summary, a[href], [tabindex="0"]'))
        .filter(element => element.getClientRects().length);
      const active = root.ownerDocument.activeElement;
      if ((nextDirection || activate) && !items.includes(active)) {
        (items.includes(defaultFocus) ? defaultFocus : items[0])?.focus();
        if (nextDirection) nextRepeat = now + 350;
      } else if (nextDirection && (direction !== nextDirection || now >= nextRepeat)) {
        const selected = root.ownerDocument.activeElement;
        if (horizontal && !vertical && selected?.matches('input[type="range"]')) {
          if (horizontal > 0) selected.stepUp(); else selected.stepDown();
          selected.dispatchEvent(new Event('input', { bubbles: true }));
          selected.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (items.length) {
          const index = items.indexOf(selected);
          const offset = vertical || horizontal;
          items[(index + offset + items.length) % items.length].focus();
        }
        nextRepeat = now + (direction === nextDirection ? 140 : 350);
      }
      if (activate) {
        const selected = root.ownerDocument.activeElement;
        if (items.includes(selected) && !selected.matches('[tabindex="0"]:not(button):not(input):not(a):not(summary)')) selected.click();
      }
      if (scrollRegion && gamepad.tilt) scrollRegion.scrollTop += gamepad.tilt * dt * 400;
      direction = nextDirection;
    },
    reset() { lastRoot = null; direction = ''; nextRepeat = 0; }
  };
}
