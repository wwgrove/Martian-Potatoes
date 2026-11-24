import { JEZERO_ELEVATIONS, JEZERO_GRID_SIZE } from './jezero-elevation.js';

export const TERRAIN_WIDTH = 160;
export const TERRAIN_SEGMENTS = JEZERO_GRID_SIZE - 1;
const METERS_PER_UNIT = 12000 / TERRAIN_WIDTH;
const BASE_ELEVATION = JEZERO_ELEVATIONS[(JEZERO_GRID_SIZE ** 2 - 1) / 2];

export function terrainHeight(x, z) {
  const column = Math.max(0, Math.min(TERRAIN_SEGMENTS, (x / TERRAIN_WIDTH + 0.5) * TERRAIN_SEGMENTS));
  const row = Math.max(0, Math.min(TERRAIN_SEGMENTS, (z / TERRAIN_WIDTH + 0.5) * TERRAIN_SEGMENTS));
  const x0 = Math.floor(column), z0 = Math.floor(row);
  const x1 = Math.min(x0 + 1, TERRAIN_SEGMENTS), z1 = Math.min(z0 + 1, TERRAIN_SEGMENTS);
  const fx = column - x0, fz = row - z0;
  const top = JEZERO_ELEVATIONS[z0 * JEZERO_GRID_SIZE + x0] * (1 - fx) + JEZERO_ELEVATIONS[z0 * JEZERO_GRID_SIZE + x1] * fx;
  const bottom = JEZERO_ELEVATIONS[z1 * JEZERO_GRID_SIZE + x0] * (1 - fx) + JEZERO_ELEVATIONS[z1 * JEZERO_GRID_SIZE + x1] * fx;
  const relativeHeight = (top * (1 - fz) + bottom * fz - BASE_ELEVATION) / METERS_PER_UNIT;
  const blend = Math.max(0, Math.min(1, (Math.hypot(x, z) - 16) / 10));
  return -0.1 + relativeHeight * blend * blend * (3 - 2 * blend);
}
