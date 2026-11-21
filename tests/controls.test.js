import test from 'node:test';
import assert from 'node:assert/strict';
import { readGamepad, newlyPressed, joystickVector } from '../src/controls.js';

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
