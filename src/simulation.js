export const PLOT_COLUMNS = 5;
export const PLOT_ROWS = 4;
export const PLOT_COUNT = PLOT_COLUMNS * PLOT_ROWS;
export const GROW_SECONDS = 30;
export const REST_GROWTH_SECONDS = 15;
export const REST_DOOR = { x: 0, z: -9.05, reach: 2.5 };
export const MOVEMENT_RADIUS = 7.7;
export const WALK_RADIUS = 8.9;
export const WATER_SWITCH = { x: -8.15, z: -2, reach: 1.65 };
export const IRRIGATION_SECONDS = 5;
export const TOOL_TYPES = ['tiller', 'plow', 'auger', 'sifter'];
export const PHASES = [
  { title: 'Loosen and mix the soil', name: 'SOIL PREPARATION', action: 'till', tool: 'tiller', duration: 1.2 },
  { title: 'Open the planting furrows', name: 'FURROWING', action: 'furrow', tool: 'plow', duration: 1 },
  { title: 'Bore the planting holes', name: 'DRILLING', action: 'drill', tool: 'auger', duration: 1 },
  { title: 'Plant the seed potatoes', name: 'PLANTING', action: 'plant', tool: null, duration: 3 },
  { title: 'Start the sprinklers', name: 'IRRIGATION SETUP', action: 'water', tool: null, duration: IRRIGATION_SECONDS },
  { title: 'Hill the growing rows', name: 'HILLING', action: 'hill', tool: 'plow', duration: 0.8 },
  { title: 'Water the growing tubers', name: 'IRRIGATION CHECK', action: 'water', tool: null, duration: IRRIGATION_SECONDS },
  { title: 'Lift the potato harvest', name: 'HARVEST', action: 'harvest', tool: 'sifter', duration: 1 }
];

export function cameraRelativeMovement(right, forward, cameraAngle) {
  const length = Math.hypot(right, forward);
  if (length === 0) return { x: 0, z: 0 };
  const cos = Math.cos(cameraAngle), sin = Math.sin(cameraAngle);
  return {
    x: (right * cos - forward * sin) / length,
    z: (-right * sin - forward * cos) / length
  };
}

const shortestTurn = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function followCameraTurn(facing, previousCameraAngle, cameraAngle) {
  return facing + shortestTurn(previousCameraAngle, cameraAngle);
}

export function digAlignment(start, target, toolOffset, movementRadius, pivotOffset = 0) {
  let best = null, bestScore = Infinity;
  const startX = start.x - Math.sin(start.angle) * pivotOffset;
  const startZ = start.z - Math.cos(start.angle) * pivotOffset;
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const x = target.x + Math.sin(angle) * toolOffset;
    const z = target.z + Math.cos(angle) * toolOffset;
    if (Math.hypot(x, z) > movementRadius) continue;
    const dx = x - Math.sin(angle) * pivotOffset - startX;
    const dz = z - Math.cos(angle) * pivotOffset - startZ;
    const distance = Math.hypot(dx, dz);
    const heading = distance > 1e-8 ? Math.atan2(-dx, -dz) : start.angle;
    const delta = shortestTurn(start.angle, angle);
    const score = distance / 2.3 + (Math.abs(shortestTurn(start.angle, heading)) + Math.abs(shortestTurn(heading, angle))) / 2.5;
    if (score < bestScore) {
      best = { x, z, angle: start.angle + delta };
      bestScore = score;
    }
  }
  if (!best) throw new RangeError('The selected plot cannot be aligned within the habitat.');
  return best;
}

export function nextSerpentinePlot(eligible, current, direction) {
  const row = Math.floor(current / PLOT_COLUMNS), column = current % PLOT_COLUMNS;
  const sameRow = eligible.filter(index => Math.floor(index / PLOT_COLUMNS) === row);
  if (sameRow.length) {
    let ahead = sameRow.filter(index => (index % PLOT_COLUMNS - column) * direction > 0);
    if (!ahead.length) {
      direction = -direction;
      ahead = sameRow.filter(index => (index % PLOT_COLUMNS - column) * direction > 0);
    }
    if (ahead.length) {
      return { index: ahead.reduce((best, index) => Math.abs(index % PLOT_COLUMNS - column) < Math.abs(best % PLOT_COLUMNS - column) ? index : best), direction };
    }
  }
  if (!eligible.length) return null;
  const score = index => Math.abs(Math.floor(index / PLOT_COLUMNS) - row) * PLOT_COLUMNS + Math.abs(index % PLOT_COLUMNS - column);
  return { index: eligible.reduce((best, index) => score(index) < score(best) ? index : best), direction: -direction };
}

export function createApproach(start, end, pivotOffset = 0) {
  const startPivot = { x: start.x - Math.sin(start.angle) * pivotOffset, z: start.z - Math.cos(start.angle) * pivotOffset };
  const endPivot = { x: end.x - Math.sin(end.angle) * pivotOffset, z: end.z - Math.cos(end.angle) * pivotOffset };
  const dx = endPivot.x - startPivot.x, dz = endPivot.z - startPivot.z, distance = Math.hypot(dx, dz);
  const heading = distance > 1e-8 ? Math.atan2(-dx, -dz) : start.angle;
  const turnIn = shortestTurn(start.angle, heading);
  const turnOut = shortestTurn(heading, end.angle);
  const turnInDuration = Math.abs(turnIn) / 2.5;
  const travelDuration = distance / 2.3;
  const turnOutDuration = Math.abs(turnOut) / 2.5;
  return {
    start, end, startPivot, endPivot, pivotOffset, distance, turnIn, turnOut, turnInDuration, travelDuration, turnOutDuration, elapsed: 0,
    duration: Math.max(0.15, turnInDuration + travelDuration + turnOutDuration)
  };
}

function approachAt(approach, elapsed) {
  const { start, startPivot, endPivot, pivotOffset, distance, turnIn, turnOut, turnInDuration, travelDuration, turnOutDuration } = approach;
  const smooth = value => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  };
  if (turnInDuration > 0 && elapsed < turnInDuration) {
    const angle = start.angle + turnIn * smooth(elapsed / turnInDuration);
    return { pose: { x: startPivot.x + Math.sin(angle) * pivotOffset, z: startPivot.z + Math.cos(angle) * pivotOffset, angle }, distance: 0 };
  }
  if (travelDuration > 0 && elapsed < turnInDuration + travelDuration) {
    const progress = smooth((elapsed - turnInDuration) / travelDuration);
    const angle = start.angle + turnIn;
    return { pose: { x: startPivot.x + (endPivot.x - startPivot.x) * progress + Math.sin(angle) * pivotOffset, z: startPivot.z + (endPivot.z - startPivot.z) * progress + Math.cos(angle) * pivotOffset, angle }, distance: distance * progress };
  }
  const progress = turnOutDuration > 0 ? smooth((elapsed - turnInDuration - travelDuration) / turnOutDuration) : 1;
  const angle = start.angle + turnIn + turnOut * progress;
  return { pose: { x: endPivot.x + Math.sin(angle) * pivotOffset, z: endPivot.z + Math.cos(angle) * pivotOffset, angle }, distance };
}

export function advanceApproach(approach, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Elapsed time must be non-negative.');
  const remaining = approach.duration - approach.elapsed;
  const used = Math.min(remaining, seconds);
  const previous = approachAt(approach, approach.elapsed);
  approach.elapsed += used;
  const current = approachAt(approach, approach.elapsed);
  return { pose: current.pose, travel: current.distance - previous.distance, turn: current.pose.angle - previous.pose.angle, workSeconds: seconds - used };
}

export function createGait() {
  return { phase: 0, blend: 0 };
}

export function advanceGait(gait, distance, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(distance) || distance < 0) {
    throw new RangeError('Movement and elapsed time must be non-negative.');
  }
  gait.phase = (gait.phase + distance / 1.2) % 1;
  const target = distance > 1e-6 ? 1 : 0;
  gait.blend = target + (gait.blend - target) * Math.exp(-seconds * 8);
}

export function gaitBodyOffset(gait) {
  return (-0.05 + 0.006 * (1 - Math.cos(gait.phase * Math.PI * 4))) * gait.blend;
}

export function gaitArmSwing(gait, arm) {
  return -0.3 * Math.cos((gait.phase + arm * 0.5) * Math.PI * 2) * gait.blend;
}

export function gaitLegPose(gait, leg) {
  const phase = (gait.phase + leg * 0.5) % 1;
  const stance = phase < 0.6;
  const progress = stance ? phase / 0.6 : (phase - 0.6) / 0.4;
  const smooth = progress * progress * (3 - 2 * progress);
  const z = stance ? -0.25 + 0.5 * progress : 0.25 - 0.5 * smooth;
  const lift = stance ? 0 : 0.065 * Math.sin(Math.PI * progress);
  const y = -0.7 + lift;
  const upper = 0.4, lower = 0.35, length = Math.hypot(y, z);
  const hip = Math.atan2(-z, -y) + Math.acos(Math.max(-1, Math.min(1, (upper ** 2 + length ** 2 - lower ** 2) / (2 * upper * length))));
  const knee = -Math.acos(Math.max(-1, Math.min(1, (length ** 2 - upper ** 2 - lower ** 2) / (2 * upper * lower))));
  const pitch = stance ? 0.08 * Math.max(0, 1 - progress * 4) - 0.06 * Math.max(0, (progress - 0.75) * 4) : -0.06 * (1 - smooth) + 0.08 * smooth + 0.04 * Math.sin(Math.PI * progress);
  return { hip: hip * gait.blend, knee: knee * gait.blend, ankle: (-hip - knee + pitch) * gait.blend, lift: lift * gait.blend };
}

export function plantingPose(progress) {
  const t = Math.max(0, Math.min(1, progress));
  const smooth = value => {
    const p = Math.max(0, Math.min(1, value));
    return p * p * (3 - 2 * p);
  };
  const points = [
    { time: 0, x: 0, z: 1.05, angle: 0 },
    { time: 0.16, x: 1.02, z: 0.85, angle: -Math.PI / 2 },
    { time: 0.32, x: 1.02, z: -0.35, angle: 0 },
    { time: 0.43, x: 1.02, z: -0.35, angle: Math.PI / 2 },
    { time: 0.55, x: 0.72, z: -1.15, angle: 1.05 },
    { time: 0.7, x: 0.72, z: -1.15, angle: 1.05 },
    { time: 0.86, x: 1.02, z: 0.85, angle: Math.PI },
    { time: 1, x: 0, z: 1.05, angle: 0 }
  ];
  const index = Math.min(points.length - 2, points.findIndex((point, i) => i > 0 && t <= point.time) - 1);
  const from = points[index], to = points[index + 1];
  const p = smooth((t - from.time) / (to.time - from.time));
  const pickup = smooth((t - 0.30) / 0.07) * (1 - smooth((t - 0.42) / 0.06));
  const planting = smooth((t - 0.54) / 0.07) * (1 - smooth((t - 0.70) / 0.07));
  return {
    x: from.x + (to.x - from.x) * p,
    z: from.z + (to.z - from.z) * p,
    angle: from.angle + shortestTurn(from.angle, to.angle) * p,
    bend: Math.max(pickup, planting),
    carrying: t >= 0.4 && t < 0.72,
    drop: smooth((t - 0.65) / 0.07),
    planted: t >= 0.72
  };
}

export function createState() {
  return {
    phase: 0,
    plots: Array.from({ length: PLOT_COUNT }, () => ({ stage: 0, growth: 0 })),
    minutes: 8 * 60,
    sol: 1,
    harvested: 0,
    totalHarvested: 0
  };
}

export function growthStage(growth) {
  return Math.min(4, Math.floor(Math.max(0, growth) / (GROW_SECONDS / 4)));
}

export function isNight(minutes) {
  return minutes >= 19 * 60 || minutes < 6 * 60;
}

export function nearRestDoor(position) {
  return Math.hypot(position.x - REST_DOOR.x, position.z - REST_DOOR.z) <= REST_DOOR.reach;
}

export function nearWaterSwitch(position) {
  return Math.hypot(position.x - WATER_SWITCH.x, position.z - WATER_SWITCH.z) <= WATER_SWITCH.reach;
}

export function canStartIrrigation(state) {
  if (PHASES[state.phase]?.action !== 'water') return false;
  return state.plots.some(plot => plot.stage === state.phase) && state.plots.every(plot => plot.stage === state.phase + 1 ||
    (plot.stage === state.phase && (state.phase !== 6 || plot.growth >= GROW_SECONDS / 2)));
}

export function completeIrrigation(state) {
  if (!canStartIrrigation(state)) throw new Error('The field is not ready for irrigation.');
  const phase = state.phase;
  for (const plot of state.plots) if (plot.stage === phase) completeWork(state, plot);
}

export function advance(state, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Elapsed time must be non-negative.');
  const total = state.minutes + seconds * 6;
  state.sol += Math.floor(total / 1440);
  state.minutes = total % 1440;
  for (const plot of state.plots) {
    advanceGrowth(plot, seconds);
  }
}

function advanceGrowth(plot, seconds) {
  const limit = plot.stage === 5 ? GROW_SECONDS / 4 : plot.stage === 6 ? GROW_SECONDS / 2 : plot.stage === 7 ? GROW_SECONDS : 0;
  if (limit) plot.growth = Math.min(limit, plot.growth + seconds);
}

export function rest(state) {
  if (!isNight(state.minutes)) return false;
  const untilMorning = state.minutes >= 19 * 60 ? 1440 - state.minutes + 360 : 360 - state.minutes;
  state.sol += Math.floor((state.minutes + untilMorning) / 1440);
  state.minutes = 360;
  for (const plot of state.plots) {
    advanceGrowth(plot, REST_GROWTH_SECONDS);
  }
  return true;
}

export function canWork(state, plot, tool) {
  if (!plot || state.phase >= PHASES.length) return false;
  const phase = PHASES[state.phase];
  if (phase.action === 'water') return false;
  if (phase.tool && phase.tool !== tool) return false;
  if (state.phase === 5) return plot.stage === 5 && plot.growth >= GROW_SECONDS / 4;
  if (state.phase === PHASES.length - 1) return plot.stage === state.phase && plot.growth >= GROW_SECONDS;
  return plot.stage === state.phase;
}

export function isTillerRunning(state, { working, parked, switching, activeTool }) {
  return working && !parked && !switching && activeTool === 'tiller'
    && PHASES[state.phase]?.action === 'till' && state.plots.some(plot => canWork(state, plot, activeTool));
}

export function completeWork(state, plot) {
  if (state.phase === PHASES.length - 1) {
    plot.stage++;
    state.harvested++;
    state.totalHarvested++;
    if (state.harvested === PLOT_COUNT) state.phase = PHASES.length;
  } else {
    plot.stage++;
    if (state.plots.every(item => item.stage > state.phase)) state.phase++;
  }
}

export function startNextCycle(state) {
  if (state.phase !== PHASES.length) throw new Error('The harvest is not complete.');
  state.phase = 0;
  state.harvested = 0;
  for (const plot of state.plots) { plot.stage = 0; plot.growth = 0; }
}

export function phaseProgress(state) {
  if (state.phase >= PHASES.length) return PLOT_COUNT;
  if (state.phase === PHASES.length - 1) return state.harvested;
  return state.plots.filter(plot => plot.stage > state.phase).length;
}
