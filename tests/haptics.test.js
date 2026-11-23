import test from 'node:test';
import assert from 'node:assert/strict';
import { createHaptics } from '../src/haptics.js';

test('touch feedback repeats at a controlled cadence and stops when movement stops', () => {
  const calls = [];
  const haptics = createHaptics({ vibrate: pattern => { calls.push(pattern); return true; } });
  haptics.setSource('touch');
  haptics.update('walk', 0);
  haptics.update('walk', 100);
  assert.equal(calls.length, 1);
  haptics.update('walk', 400);
  assert.equal(calls.length, 2);
  haptics.update(null, 401);
  assert.equal(calls.at(-1), 0);
  haptics.update(null, 900);
  assert.equal(calls.length, 3);
});

test('tool actions have distinct feedback and completion is not immediately interrupted', () => {
  const calls = [];
  const haptics = createHaptics({ vibrate: pattern => { calls.push(pattern); return true; } });
  haptics.setSource('touch');
  haptics.update('till', 0);
  haptics.update('drill', 1);
  haptics.update('harvest', 2);
  assert.equal(new Set(calls.map(pattern => pattern.join(','))).size, 3);
  haptics.trigger('complete', 3);
  const count = calls.length;
  haptics.update(null, 10);
  assert.equal(calls.length, count);
  haptics.update(null, 100);
  assert.equal(calls.at(-1), 0);
});

test('gamepad rumble is routed to the controller and stopped on disconnect or disable', () => {
  const calls = [], phone = [];
  const actuator = {
    playEffect: (type, options) => { calls.push({ type, options }); return Promise.resolve('complete'); },
    reset: () => { calls.push('reset'); return Promise.resolve('complete'); }
  };
  const haptics = createHaptics({ vibrate: pattern => { phone.push(pattern); return true; } });
  haptics.setGamepad({ index: 0, vibrationActuator: actuator });
  haptics.setSource('gamepad');
  haptics.update('tracks', 0);
  assert.equal(calls[0].type, 'dual-rumble');
  assert.ok(calls[0].options.strongMagnitude > 0);
  assert.equal(phone.length, 0);
  haptics.setGamepad(null);
  assert.equal(calls.at(-1), 'reset');
  haptics.setSource('touch');
  haptics.update('walk', 100);
  haptics.setEnabled(false);
  assert.equal(phone.at(-1), 0);
  haptics.update('till', 500);
  assert.equal(phone.length, 2);
});

test('unsupported devices are safe and rejected controller effects are reported once', async () => {
  const errors = [];
  const haptics = createHaptics({}, error => errors.push(error));
  haptics.setSource('touch');
  haptics.update('walk', 0);
  haptics.setSource('gamepad');
  haptics.setGamepad({ index: 1, vibrationActuator: {
    playEffect: () => Promise.reject(new Error('blocked')),
    reset: () => Promise.resolve('complete')
  } });
  haptics.update('till', 10);
  await Promise.resolve();
  haptics.update('drill', 20);
  await Promise.resolve();
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /blocked/);
});
