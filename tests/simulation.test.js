import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, createGait, advanceGait, cameraRelativeMovement, digAlignment, alignmentPose, advance, rest, canWork, completeWork, growthStage, DIG_SECONDS, DIG_SPEED_MULTIPLIER, ASSUMED_MARS_DIG_SECONDS, GROW_SECONDS, PLOT_COUNT, PHASES, MARS_GRAVITY, STEP_LAUNCH_SPEED } from '../src/simulation.js';

test('movement follows the camera after orbiting, including diagonals', () => {
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.73]) {
    const forward = cameraRelativeMovement(0, 1, angle);
    const backward = cameraRelativeMovement(0, -1, angle);
    const right = cameraRelativeMovement(1, 0, angle);
    assert.ok(Math.abs(forward.x + Math.sin(angle)) < 1e-10);
    assert.ok(Math.abs(forward.z + Math.cos(angle)) < 1e-10);
    assert.ok(Math.abs(forward.x + backward.x) < 1e-10);
    assert.ok(Math.abs(forward.z + backward.z) < 1e-10);
    assert.ok(Math.abs(right.x - Math.cos(angle)) < 1e-10);
    assert.ok(Math.abs(right.z + Math.sin(angle)) < 1e-10);
    const diagonal = cameraRelativeMovement(1, 1, angle);
    assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - 1) < 1e-10);
  }
  assert.deepEqual(cameraRelativeMovement(0, 0, 1), { x: 0, z: 0 });
});

test('digging aligns the attachment to each plot without leaving the habitat', () => {
  const offset = 0.85 + 0.82 * 1.05, limit = 7.7;
  for (let row = 0; row < 5; row++) for (let col = 0; col < 8; col++) {
    const target = { x: (col - 3.5) * 2, z: (row - 2) * 2.1 - 0.3 };
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.6]) {
      const end = digAlignment({ x: 0, z: 0, angle }, target, offset, limit);
      assert.ok(Math.hypot(end.x, end.z) <= limit);
      assert.ok(Math.abs(end.x - Math.sin(end.angle) * offset - target.x) < 1e-10);
      assert.ok(Math.abs(end.z - Math.cos(end.angle) * offset - target.z) < 1e-10);
      assert.ok(Math.abs(Math.sin(end.angle * 2)) < 1e-10);
    }
  }
  const end = digAlignment({ x: 0, z: 2, angle: 0.1 }, { x: 0.2, z: 0 }, offset, limit);
  assert.ok(Math.abs(end.angle) < 1e-10);
});

test('alignment turns toward travel, walks straight, then turns to the plot', () => {
  const start = { x: 1, z: 2, angle: 0 };
  const end = { x: 3, z: 2, angle: Math.PI / 2 };
  assert.deepEqual(alignmentPose(start, end, 0), start);
  const turning = alignmentPose(start, end, 0.125);
  assert.equal(turning.x, start.x);
  assert.equal(turning.z, start.z);
  const walking = alignmentPose(start, end, 0.5);
  assert.equal(walking.x, 2);
  assert.equal(walking.z, 2);
  assert.ok(Math.abs(walking.angle + Math.PI / 2) < 1e-10);
  const aligned = alignmentPose(start, end, 1);
  assert.equal(aligned.x, end.x);
  assert.equal(aligned.z, end.z);
  assert.ok(Math.abs(Math.sin((aligned.angle - end.angle) / 2)) < 1e-10);
  const turningInPlace = alignmentPose(start, { x: 1, z: 2, angle: Math.PI / 2 }, 0.5);
  assert.equal(turningInPlace.x, 1);
  assert.ok(Math.abs(turningInPlace.angle - Math.PI / 4) < 1e-10);
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 3.2]) {
    const from = { x: 0, z: 0, angle };
    const to = digAlignment(from, { x: 3, z: -2 }, 1.711, 7.7);
    for (const progress of [0, 0.125, 0.25, 0.5, 0.75, 0.875, 1]) {
      const pose = alignmentPose(from, to, progress);
      assert.ok(Math.hypot(pose.x, pose.z) <= 7.7);
      if (progress === 0.5) {
        const dx = to.x - from.x, dz = to.z - from.z;
        const length = Math.hypot(dx, dz);
        assert.ok(Math.abs(-Math.sin(pose.angle) - dx / length) < 1e-10);
        assert.ok(Math.abs(-Math.cos(pose.angle) - dz / length) < 1e-10);
      }
    }
  }
});

test('digging is five times faster than the assumed baseline and other timings are unchanged', () => {
  const state = createState();
  assert.equal(PLOT_COUNT, 40);
  assert.equal(state.plots.length, 40);
  assert.equal(ASSUMED_MARS_DIG_SECONDS / DIG_SECONDS, DIG_SPEED_MULTIPLIER);
  assert.equal(DIG_SECONDS * PLOT_COUNT, 120);
  assert.deepEqual(PHASES.map(phase => phase.duration * PLOT_COUNT), [120, 24, 24, 18, 18, 24]);
  assert.equal(canWork(state, state.plots[0], 'auger'), false);
  assert.equal(canWork(state, state.plots[0], 'shovel'), true);
  for (const plot of state.plots) completeWork(state, plot);
  assert.equal(state.phase, 1);
  assert.equal(canWork(state, state.plots[0], 'aerator'), true);
});

test('walking follows Martian gravity and comes to rest on the ground', () => {
  const gait = createGait();
  advanceGait(gait, true, 0.1);
  assert.ok(Math.abs(gait.height - (STEP_LAUNCH_SPEED * 0.1 - MARS_GRAVITY * 0.1 ** 2 / 2)) < 1e-10);
  assert.ok(Math.abs(gait.velocity - (STEP_LAUNCH_SPEED - MARS_GRAVITY * 0.1)) < 1e-10);
  advanceGait(gait, false, 1);
  assert.equal(gait.height, 0);
  assert.equal(gait.velocity, 0);
  assert.equal(gait.steps, 1);
});

test('gravity-based gait is stable across frame sizes', () => {
  const single = createGait(), split = createGait();
  advanceGait(single, true, 1);
  for (let i = 0; i < 10; i++) advanceGait(split, true, 0.1);
  assert.equal(single.steps, split.steps);
  assert.ok(Math.abs(single.height - split.height) < 1e-10);
  assert.ok(Math.abs(single.velocity - split.velocity) < 1e-10);
});

test('five growth stages reach harvest after ten minutes, only after watering', () => {
  const state = createState();
  state.phase = 5;
  state.plots[0].stage = 5;
  state.plots[1].stage = 4;
  assert.deepEqual([0, 150, 300, 450, 600].map(growthStage), [0, 1, 2, 3, 4]);
  advance(state, GROW_SECONDS - 1);
  assert.equal(canWork(state, state.plots[0], 'shovel'), false);
  assert.equal(state.plots[1].growth, 0);
  advance(state, 1);
  assert.equal(canWork(state, state.plots[0], 'shovel'), true);
  completeWork(state, state.plots[0]);
  assert.equal(state.harvested, 1);
});

test('rest is night-only, advances to morning and speeds watered crops', () => {
  const state = createState();
  state.plots[0].stage = 5;
  assert.equal(rest(state), false);
  state.minutes = 23 * 60;
  assert.equal(rest(state), true);
  assert.equal(state.minutes, 360);
  assert.equal(state.sol, 2);
  assert.equal(state.plots[0].growth, 90);
  state.minutes = 120;
  assert.equal(rest(state), true);
  assert.equal(state.sol, 2);
});

test('all objectives progress in order through a complete harvest', () => {
  const state = createState();
  for (const tool of ['shovel', 'aerator', 'auger', 'shovel', 'shovel']) {
    const phase = state.phase;
    for (const plot of state.plots) {
      assert.equal(canWork(state, plot, tool), true);
      completeWork(state, plot);
    }
    assert.equal(state.phase, phase + 1);
  }
  assert.equal(canWork(state, state.plots[0], 'shovel'), false);
  advance(state, GROW_SECONDS);
  for (const plot of state.plots) {
    assert.equal(canWork(state, plot, 'shovel'), true);
    completeWork(state, plot);
  }
  assert.equal(state.phase, 6);
  assert.equal(state.harvested, PLOT_COUNT);
  assert.equal(canWork(state, state.plots[0], 'shovel'), false);
});
