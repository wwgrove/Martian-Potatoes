import test from 'node:test';
import assert from 'node:assert/strict';
import { createGamepadMenu } from '../src/gamepad-menu.js';

function setup() {
  const document = { activeElement: null };
  const item = name => ({
    name, clicks: 0,
    focus() { document.activeElement = this; },
    click() { this.clicks++; },
    matches() { return false; },
    getClientRects() { return [1]; }
  });
  const items = [item('instructions'), item('start'), item('reset'), item('music')];
  const root = { ownerDocument: document, querySelectorAll() { return items; } };
  const scroll = { scrollTop: 0 };
  const menu = createGamepadMenu();
  const input = (overrides = {}) => ({ right: 0, forward: 0, tilt: 0, buttons: [], ...overrides });
  const update = (pad, previous = [], now = 0, onBack = () => {}) =>
    menu.update(root, items[1], scroll, pad, previous, now, 0.1, onBack);
  return { document, items, scroll, menu, input, update };
}

test('menu defaults to start, navigates with repeat, and activates only on a new press', () => {
  const { document, items, input, update } = setup();
  update(input({ forward: -1 }));
  assert.equal(document.activeElement, items[1]);
  update(input({ forward: -1 }), [], 100);
  assert.equal(document.activeElement, items[1]);
  update(input({ forward: -1 }), [], 360);
  assert.equal(document.activeElement, items[2]);
  update(input({ buttons: [true] }), [], 400);
  assert.equal(items[2].clicks, 1);
  update(input({ buttons: [true] }), [true], 500);
  assert.equal(items[2].clicks, 1);
});

test('first confirm starts, back closes, and right stick scrolls independently', () => {
  const { items, scroll, input, update } = setup();
  update(input({ buttons: [true] }));
  assert.equal(items[1].clicks, 1);
  let back = 0;
  update(input({ buttons: [false, true], tilt: 1 }), [], 100, () => { back++; });
  assert.equal(back, 1);
  update(input({ tilt: 0.5 }), [], 200);
  assert.equal(scroll.scrollTop, 20);
});

test('left and right adjust focused sliders instead of moving focus', () => {
  const { document, items, input, update } = setup();
  const slider = items[2];
  slider.matches = selector => selector === 'input[type="range"]';
  slider.stepUp = () => { slider.value = (slider.value || 0) + 1; };
  slider.dispatchEvent = event => { (slider.events ||= []).push(event.type); };
  slider.focus();
  update(input({ right: 1 }));
  assert.equal(document.activeElement, slider);
  assert.equal(slider.value, 1);
  assert.deepEqual(slider.events, ['input', 'change']);
});
