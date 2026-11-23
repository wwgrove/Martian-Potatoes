import test from 'node:test';
import assert from 'node:assert/strict';
import { marsSky, MARS_SOL_SECONDS, MARS_SIDEREAL_SECONDS, PHOBOS_ORBIT_SECONDS, DEIMOS_ORBIT_SECONDS } from '../src/sky.js';

function skyAtSeconds(seconds) {
  const sols = seconds / MARS_SOL_SECONDS;
  const whole = Math.floor(sols);
  return marsSky(whole + 1, (sols - whole) * 1440);
}

test('the equinox Sun rises in the east, peaks at noon and sets in the west', () => {
  assert.ok(marsSky(1, 0).sun.y < 0);
  assert.ok(marsSky(1, 360).sun.x > 0.99);
  assert.ok(Math.abs(marsSky(1, 360).sun.y) < 1e-10);
  assert.ok(marsSky(1, 720).sun.y > 0.94);
  assert.ok(marsSky(1, 1080).sun.x < -0.99);
  assert.ok(marsSky(1, 1140).sun.y < 0);
});

test('Phobos travels west to east and Deimos travels east to west', () => {
  const start = skyAtSeconds(0), hourLater = skyAtSeconds(3600);
  assert.ok(start.phobos.y > 0 && hourLater.phobos.y > 0);
  assert.ok(start.phobos.x < 0 && hourLater.phobos.x > 0);
  assert.ok(start.deimos.x > hourLater.deimos.x);
  assert.ok(start.deimos.y > 0 && hourLater.deimos.y > 0);
});

test('moon positions repeat at their surface-relative periods and remain continuous across sols', () => {
  const start = skyAtSeconds(0);
  for (const [name, period] of [['phobos', PHOBOS_ORBIT_SECONDS], ['deimos', DEIMOS_ORBIT_SECONDS]]) {
    const surfacePeriod = 1 / Math.abs(1 / MARS_SIDEREAL_SECONDS - 1 / period);
    const repeated = skyAtSeconds(surfacePeriod)[name];
    for (const axis of ['x', 'y', 'z', 'angularRadius']) assert.ok(Math.abs(repeated[axis] - start[name][axis]) < 1e-10);
  }
  const end = marsSky(1, 1440), next = marsSky(2, 0);
  for (const body of ['sun', 'phobos', 'deimos']) {
    for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(end[body][axis] - next[body][axis]) < 1e-10);
  }
});

test('both moons go below the horizon and Phobos appears larger than Deimos', () => {
  const samples = Array.from({ length: 240 }, (_, i) => skyAtSeconds(i * MARS_SOL_SECONDS / 20));
  for (const body of ['phobos', 'deimos']) {
    assert.ok(samples.some(sky => sky[body].y > 0));
    assert.ok(samples.some(sky => sky[body].y < 0));
  }
  assert.ok(samples[0].phobos.angularRadius > samples[0].deimos.angularRadius);
});
