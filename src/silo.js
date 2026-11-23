export const SILO_RADIUS = 2.1;
export const SILO_HEIGHT = 160;
export const SILO_FLOOR_HEIGHT = 0.24;
export const SILO_POTATO_SCALE = { x: 0.14, y: 0.11, z: 0.18 };
const POTATOES_PER_LAYER = 64;
const LAYER_HEIGHT = 0.23;
const FLOOR_CLEARANCE = 0.002, HEIGHT_VARIATION = 0.0125;
export const SILO_CAPACITY = (Math.floor((SILO_HEIGHT - SILO_FLOOR_HEIGHT - FLOOR_CLEARANCE - 2 * SILO_POTATO_SCALE.z - HEIGHT_VARIATION) / LAYER_HEIGHT) + 1) * POTATOES_PER_LAYER;

export function validateSiloPreview(value) {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
    throw new RangeError('Silo preview must be a non-negative safe integer or null.');
  }
  return value;
}

function variation(index, salt) {
  let value = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function siloPotatoPose(index) {
  const slot = index % POTATOES_PER_LAYER, layer = Math.floor(index / POTATOES_PER_LAYER);
  const angle = slot * 2.39996 + layer * 0.6 + (variation(index, 1) - 0.5) * 0.2;
  const radius = (SILO_RADIUS - 0.21) * Math.sqrt((slot + 0.5) / POTATOES_PER_LAYER);
  const tiltX = (variation(index, 3) - 0.5) * 0.6;
  const yaw = variation(index, 4) * Math.PI * 2;
  const tiltZ = (variation(index, 5) - 0.5) * 0.6;
  const a = Math.cos(tiltX), b = Math.sin(tiltX), c = Math.cos(yaw), d = Math.sin(yaw);
  const e = Math.cos(tiltZ), f = Math.sin(tiltZ);
  const verticalRadius = Math.hypot(
    (a * f + b * e * d) * SILO_POTATO_SCALE.x,
    (a * e - b * f * d) * SILO_POTATO_SCALE.y,
    b * c * SILO_POTATO_SCALE.z
  );
  return {
    x: Math.cos(angle) * radius,
    y: SILO_FLOOR_HEIGHT + FLOOR_CLEARANCE + verticalRadius + layer * LAYER_HEIGHT +
      (layer ? (variation(index, 2) - 0.5) * 2 * HEIGHT_VARIATION : 0),
    z: Math.sin(angle) * radius,
    tiltX, yaw, tiltZ
  };
}

export function siloFallOffset(index, targetY, elapsed) {
  const duration = 1.4 + variation(index, 6) * 0.4;
  const progress = Math.max(0, Math.min(1, elapsed / duration));
  const height = Math.max(0, Math.min(20 + variation(index, 7) * 5, SILO_HEIGHT - 0.2 - targetY));
  return height * (1 - progress * progress);
}

export function siloRainStep(pending, falling, credit, elapsed) {
  if (pending === 0) return { count: 0, credit: 0 };
  const rate = Math.max(320, Math.min(1200, pending / 4));
  const availableCredit = Math.min(2048, credit + elapsed * rate);
  const count = Math.min(pending, 2048 - falling, Math.floor(availableCredit));
  return { count, credit: availableCredit - count };
}
