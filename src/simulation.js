export const PLOT_COLUMNS = 8;
export const PLOT_ROWS = 5;
export const PLOT_COUNT = PLOT_COLUMNS * PLOT_ROWS;
export const ASSUMED_MARS_DIG_SECONDS = 15;
export const DIG_SPEED_MULTIPLIER = 5;
export const DIG_SECONDS = ASSUMED_MARS_DIG_SECONDS / DIG_SPEED_MULTIPLIER;
export const GROW_SECONDS = 600;
export const MARS_GRAVITY = 3.71;
export const STEP_LAUNCH_SPEED = 0.8;
export const PHASES = [
  { title: 'Prepare the growing beds', name: 'SOIL PREPARATION', action: 'dig', tool: 'shovel', duration: DIG_SECONDS },
  { title: 'Give the soil room to breathe', name: 'AERATION', action: 'aerate', tool: 'aerator', duration: 24 / PLOT_COUNT },
  { title: 'Drill the planting holes', name: 'DRILLING', action: 'drill', tool: 'auger', duration: 24 / PLOT_COUNT },
  { title: 'Plant the seed potatoes', name: 'PLANTING', action: 'plant', tool: null, duration: 18 / PLOT_COUNT },
  { title: 'Water the new crop', name: 'IRRIGATION', action: 'water', tool: null, duration: 18 / PLOT_COUNT },
  { title: 'Watch your potatoes grow', name: 'CROP MONITORING', action: 'harvest', tool: null, duration: 24 / PLOT_COUNT }
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

export function digAlignment(start, target, toolOffset, movementRadius) {
  let best = null, bestScore = Infinity;
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const x = target.x + Math.sin(angle) * toolOffset;
    const z = target.z + Math.cos(angle) * toolOffset;
    if (Math.hypot(x, z) > movementRadius) continue;
    const delta = Math.atan2(Math.sin(angle - start.angle), Math.cos(angle - start.angle));
    const score = Math.abs(delta) + Math.hypot(x - start.x, z - start.z) * 0.15;
    if (score < bestScore) {
      best = { x, z, angle: start.angle + delta };
      bestScore = score;
    }
  }
  if (!best) throw new RangeError('The selected plot cannot be aligned within the habitat.');
  return best;
}

export function alignmentPose(start, end, progress) {
  const smooth = value => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  };
  const shortestTurn = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
  const dx = end.x - start.x, dz = end.z - start.z;
  if (Math.hypot(dx, dz) < 0.01) {
    const t = smooth(progress);
    return { x: start.x + dx * t, z: start.z + dz * t, angle: start.angle + shortestTurn(start.angle, end.angle) * t };
  }
  const heading = start.angle + shortestTurn(start.angle, Math.atan2(-dx, -dz));
  const turnIn = smooth(progress / 0.25);
  const travel = smooth((progress - 0.25) / 0.5);
  const turnOut = smooth((progress - 0.75) / 0.25);
  return {
    x: start.x + dx * travel,
    z: start.z + dz * travel,
    angle: start.angle + (heading - start.angle) * turnIn + shortestTurn(heading, end.angle) * turnOut
  };
}

export function createGait() {
  return { height: 0, velocity: 0, steps: 0 };
}

export function advanceGait(gait, walking, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Elapsed time must be non-negative.');
  if (seconds === 0) return;
  if (gait.height === 0 && gait.velocity === 0) {
    if (!walking) return;
    gait.velocity = STEP_LAUNCH_SPEED;
  }
  const untilLanding = (gait.velocity + Math.sqrt(gait.velocity ** 2 + 2 * MARS_GRAVITY * gait.height)) / MARS_GRAVITY;
  if (seconds < untilLanding) {
    gait.height += gait.velocity * seconds - 0.5 * MARS_GRAVITY * seconds ** 2;
    gait.velocity -= MARS_GRAVITY * seconds;
    return;
  }
  gait.height = 0;
  gait.velocity = 0;
  gait.steps++;
  if (!walking) return;
  const flightTime = 2 * STEP_LAUNCH_SPEED / MARS_GRAVITY;
  const remaining = seconds - untilLanding;
  gait.steps += Math.floor(remaining / flightTime);
  const flight = remaining % flightTime;
  if (flight > 0) {
    gait.height = STEP_LAUNCH_SPEED * flight - 0.5 * MARS_GRAVITY * flight ** 2;
    gait.velocity = STEP_LAUNCH_SPEED - MARS_GRAVITY * flight;
  }
}

export function createState() {
  return {
    phase: 0,
    plots: Array.from({ length: PLOT_COUNT }, () => ({ stage: 0, growth: 0 })),
    minutes: 8 * 60,
    sol: 1,
    harvested: 0
  };
}

export function growthStage(growth) {
  return Math.min(4, Math.floor(Math.max(0, growth) / (GROW_SECONDS / 4)));
}

export function isNight(minutes) {
  return minutes >= 19 * 60 || minutes < 6 * 60;
}

export function advance(state, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Elapsed time must be non-negative.');
  const total = state.minutes + seconds * 6;
  state.sol += Math.floor(total / 1440);
  state.minutes = total % 1440;
  for (const plot of state.plots) {
    if (plot.stage === 5) plot.growth = Math.min(GROW_SECONDS, plot.growth + seconds);
  }
}

export function rest(state) {
  if (!isNight(state.minutes)) return false;
  const untilMorning = state.minutes >= 19 * 60 ? 1440 - state.minutes + 360 : 360 - state.minutes;
  state.sol += Math.floor((state.minutes + untilMorning) / 1440);
  state.minutes = 360;
  for (const plot of state.plots) {
    if (plot.stage === 5) plot.growth = Math.min(GROW_SECONDS, plot.growth + 90);
  }
  return true;
}

export function canWork(state, plot, tool) {
  if (!plot || state.phase >= PHASES.length) return false;
  const phase = PHASES[state.phase];
  if (phase.tool && phase.tool !== tool) return false;
  if (state.phase === 5) return plot.stage === 5 && plot.growth >= GROW_SECONDS;
  return plot.stage === state.phase;
}

export function completeWork(state, plot) {
  if (state.phase === 5) {
    plot.stage = 6;
    state.harvested++;
    if (state.harvested === PLOT_COUNT) state.phase = 6;
  } else {
    plot.stage++;
    if (state.plots.every(item => item.stage > state.phase)) state.phase++;
  }
}

export function phaseProgress(state) {
  if (state.phase >= 6) return PLOT_COUNT;
  if (state.phase === 5) return state.harvested;
  return state.plots.filter(plot => plot.stage > state.phase).length;
}
