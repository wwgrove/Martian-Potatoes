import test from 'node:test';
import assert from 'node:assert/strict';
import { pressKeyboardKey, readGamepad, newlyPressed, joystickVector, createTouchCamera, wheelZoomDelta } from '../src/controls.js';

test('system shortcuts release held keys and stray repeats cannot restart movement', () => {
  const keys = new Set();
  assert.equal(pressKeyboardKey(keys, { code: 'KeyW' }), true);
  assert.equal(keys.has('KeyW'), true);
  assert.equal(pressKeyboardKey(keys, { code: 'MetaLeft', metaKey: true }), false);
  assert.equal(keys.size, 0);
  assert.equal(pressKeyboardKey(keys, { code: 'KeyW', repeat: true }), false);
  assert.equal(keys.has('KeyW'), false);
  assert.equal(pressKeyboardKey(keys, { code: 'KeyW' }), true);
  assert.equal(pressKeyboardKey(keys, { code: 'KeyW', repeat: true }), true);
  assert.equal(keys.has('KeyW'), true);
});

test('modified movement shortcuts do not start movement', () => {
  const keys = new Set(['KeyW', 'KeyD']);
  assert.equal(pressKeyboardKey(keys, { code: 'KeyA', ctrlKey: true }), false);
  assert.equal(keys.size, 0);
});

test('gamepad input applies a deadzone and supports the D-pad', () => {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
  buttons[0].pressed = true;
  buttons[12].pressed = true;
  buttons[15].pressed = true;
  const input = readGamepad({ axes: [0.1, -0.5, 0.6, -0.1], buttons });
  assert.equal(input.right, 1);
  assert.equal(input.forward, 1.5);
  assert.equal(input.orbit, 0.6);
  assert.equal(input.tilt, 0);
  assert.equal(input.buttons[0], true);
  assert.equal(newlyPressed(input.buttons, [], 0), true);
  assert.equal(newlyPressed(input.buttons, input.buttons, 0), false);
});

test('a disconnected gamepad releases all controls', () => {
  const input = readGamepad(null);
  assert.equal(input.right, 0);
  assert.equal(input.forward, 0);
  assert.equal(input.orbit, 0);
  assert.equal(input.buttons.some(Boolean), false);
});

test('joystick deadzone, direction and maximum travel', () => {
  assert.deepEqual(joystickVector(2, 0, 50), { right: 0, forward: 0 });
  assert.deepEqual(joystickVector(0, -25, 50), { right: 0, forward: 0.5 });
  const diagonal = joystickVector(100, -100, 50);
  assert.ok(Math.abs(Math.hypot(diagonal.right, diagonal.forward) - 1) < 1e-10);
  assert.ok(diagonal.right > 0 && diagonal.forward > 0);
});

test('wheel zoom responds to small trackpad scrolls and pinches without oversized mouse steps', () => {
  assert.equal(wheelZoomDelta(4, 0, false), 0.1);
  assert.equal(wheelZoomDelta(-4, 0, true), -0.2);
  assert.equal(wheelZoomDelta(100, 0, false), 1);
  assert.equal(wheelZoomDelta(-100, 0, false), -1);
  assert.equal(wheelZoomDelta(1, 1, false), 0.4);
  assert.equal(wheelZoomDelta(1, 2, false), 1);
});

test('two-finger pinch zooms in and out without selecting a plot or jumping back to orbit', () => {
  const camera = createTouchCamera();
  assert.equal(camera.start(1, 100, 100), true);
  assert.equal(camera.start(2, 200, 100), true);
  assert.deepEqual(camera.move(2, 300, 100), { zoom: 0.5 });
  assert.deepEqual(camera.move(2, 200, 100), { zoom: 2 });
  assert.equal(camera.end(2), false);
  assert.deepEqual(camera.move(1, 110, 105), { dx: 10, dy: 5 });
  assert.equal(camera.end(1), false);
});

test('single-finger taps and swipes still work, and cancellation clears gestures', () => {
  const camera = createTouchCamera();
  camera.start(1, 100, 100);
  assert.equal(camera.move(1, 104, 100), null);
  assert.equal(camera.end(1), true);
  camera.start(2, 100, 100);
  assert.deepEqual(camera.move(2, 120, 110), { dx: 20, dy: 10 });
  assert.equal(camera.end(2), false);
  camera.start(3, 100, 100);
  camera.start(4, 100, 100);
  assert.equal(camera.move(4, 120, 100), null);
  assert.equal(camera.start(5, 200, 100), false);
  assert.equal(camera.end(4, true), false);
  assert.equal(camera.end(3), false);
  camera.start(6, 100, 100);
  camera.clear();
  assert.equal(camera.end(6), false);
});
