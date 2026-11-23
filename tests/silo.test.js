import test from 'node:test';
import assert from 'node:assert/strict';
import { SILO_CAPACITY, SILO_FLOOR_HEIGHT, SILO_HEIGHT, SILO_POTATO_SCALE, SILO_RADIUS, validateSiloPreview, siloPotatoPose, siloFallOffset, siloRainStep } from '../src/silo.js';
import { Object3D } from '../vendor/three.module.js';

test('silo preview accepts non-negative safe integers and null to restore the harvest', () => {
  assert.equal(validateSiloPreview(0), 0);
  assert.equal(validateSiloPreview(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  assert.equal(validateSiloPreview(null), null);
  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, '5', undefined]) {
    assert.throws(() => validateSiloPreview(value), RangeError);
  }
});

test('potato positions and orientations vary but remain stable and inside the silo', () => {
  const poses = Array.from({ length: 256 }, (_, index) => siloPotatoPose(index));
  assert.deepEqual(siloPotatoPose(42), poses[42]);
  assert.ok(new Set(poses.map(pose => pose.yaw)).size > 200);
  assert.ok(new Set(poses.slice(0, 64).map(pose => pose.y)).size > 50);
  for (const pose of [...poses, siloPotatoPose(SILO_CAPACITY - 1)]) {
    assert.ok(Math.hypot(pose.x, pose.z) + 0.18 <= SILO_RADIUS);
    assert.ok(pose.y > 0 && pose.y + 0.18 <= SILO_HEIGHT);
  }
});

test('every bottom-layer potato rests above the silo floor at its actual rotation', () => {
  const object = new Object3D();
  object.scale.set(SILO_POTATO_SCALE.x, SILO_POTATO_SCALE.y, SILO_POTATO_SCALE.z);
  for (let index = 0; index < 64; index++) {
    const pose = siloPotatoPose(index);
    object.rotation.set(pose.tiltX, pose.yaw, pose.tiltZ);
    object.updateMatrix();
    const matrix = object.matrix.elements;
    const verticalRadius = Math.hypot(matrix[1], matrix[5], matrix[9]);
    assert.ok(pose.y - verticalRadius >= SILO_FLOOR_HEIGHT);
    assert.ok(pose.y - verticalRadius < SILO_FLOOR_HEIGHT + 0.003);
  }
});

test('falling potatoes descend from above and settle at their assigned position', () => {
  const index = 1000, { y } = siloPotatoPose(index);
  const start = siloFallOffset(index, y, 0);
  const halfway = siloFallOffset(index, y, 1);
  assert.ok(start > halfway && halfway > 0);
  assert.equal(siloFallOffset(index, y, 2), 0);
  assert.ok(y + start < SILO_HEIGHT);
  const top = siloPotatoPose(SILO_CAPACITY - 1).y;
  assert.ok(top + siloFallOffset(SILO_CAPACITY - 1, top, 0) <= SILO_HEIGHT);
});

test('large additions rain in gradually without exceeding the animation limit', () => {
  const first = siloRainStep(1000, 0, 0, 0.1);
  assert.equal(first.count, 32);
  const full = siloRainStep(968, 2048, first.credit, 1);
  assert.equal(full.count, 0);
  const resumed = siloRainStep(968, 2036, full.credit, 0.1);
  assert.equal(resumed.count, 12);
  assert.ok(siloRainStep(10000, 0, 0, 1).count > siloRainStep(1000, 0, 0, 1).count);
  assert.deepEqual(siloRainStep(0, 12, resumed.credit, 1), { count: 0, credit: 0 });
});
