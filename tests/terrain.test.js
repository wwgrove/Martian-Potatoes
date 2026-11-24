import test from 'node:test';
import assert from 'node:assert/strict';
import { JEZERO_ELEVATIONS, JEZERO_GRID_SIZE } from '../src/jezero-elevation.js';
import { TERRAIN_WIDTH, TERRAIN_SEGMENTS, terrainHeight } from '../src/terrain.js';

test('Jezero terrain maps north and east to the corresponding elevation samples', () => {
  const center = (JEZERO_GRID_SIZE - 1) / 2;
  const base = JEZERO_ELEVATIONS[center * JEZERO_GRID_SIZE + center];
  const step = TERRAIN_WIDTH / TERRAIN_SEGMENTS;
  for (const [column, row] of [[center, center - 60], [center + 60, center], [center - 60, center + 40]]) {
    const height = terrainHeight((column - center) * step, (row - center) * step);
    const expected = -0.1 + (JEZERO_ELEVATIONS[row * JEZERO_GRID_SIZE + column] - base) / 75;
    assert.ok(Math.abs(height - expected) < 1e-10);
  }
});

test('terrain preserves a level habitat pad and transitions smoothly to measured terrain', () => {
  assert.equal(terrainHeight(0, 0), -0.1);
  assert.equal(terrainHeight(16, 0), -0.1);
  assert.ok(Math.abs(terrainHeight(16.001, 0) - terrainHeight(16, 0)) < 0.00001);
  assert.ok(Number.isFinite(terrainHeight(80, 80)));
});
