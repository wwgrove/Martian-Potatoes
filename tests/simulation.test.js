import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, createGait, advanceGait, gaitBodyOffset, gaitArmSwing, gaitLegPose, plantingPose, cameraRelativeMovement, gridAlignedMovement, constrainGridMovement, followCameraTurn, digAlignment, nextSerpentinePlot, createApproach, advanceApproach, advance, rest, isNight, nearRestDoor, nearWaterSwitch, canStartIrrigation, completeIrrigation, canWork, shouldGuideToMachine, isTillerRunning, completeWork, startNextCycle, growthStage, GROW_SECONDS, WATER_SWITCH, REST_DOOR, REST_GROWTH_SECONDS, PLOT_COLUMNS, PLOT_ROWS, PLOT_COUNT, PHASES, requiredToolForPhase } from '../src/simulation.js';
import { loadProgress, saveProgress, resetProgress, SAVE_KEY } from '../src/persistence.js';
import { detachUpright, cameraTilt, createDottedGuide } from '../src/scene-helpers.js';
import { Group, Matrix4, Scene, Vector3 } from '../vendor/three.module.js';

test('required attachment follows the objective and allows restarting after harvest', () => {
  assert.deepEqual(PHASES.map((_, phase) => requiredToolForPhase(phase)),
    ['tiller', 'plow', 'auger', null, null, 'plow', null, 'sifter']);
  assert.equal(requiredToolForPhase(PHASES.length), 'tiller');
});

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

test('Wii movement stays square to the field while following the nearest camera direction', () => {
  for (const angle of [-Math.PI, -2.4, -1.2, -0.3, 0.38, 1, 2.5, Math.PI]) {
    for (const [right, forward] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const direction = gridAlignedMovement(right, forward, angle);
      assert.ok(direction.x === 0 || direction.z === 0);
      assert.ok(Math.abs(Math.hypot(direction.x, direction.z) - 1) < 1e-10);
      const cameraDirection = cameraRelativeMovement(right, forward, angle);
      assert.ok(direction.x * cameraDirection.x + direction.z * cameraDirection.z >= Math.SQRT1_2 - 1e-10);
    }
  }
  assert.deepEqual(gridAlignedMovement(-1, 0, 0.38), { x: -1, z: 0 });
  assert.deepEqual(gridAlignedMovement(-1, 0, Math.PI / 2), { x: 0, z: 1 });
});

test('Wii movement stops at the field boundary without sliding off its grid line', () => {
  assert.deepEqual(constrainGridMovement(5, 4, { x: 1, z: 0 }, 5), { x: 3, z: 4 });
  assert.deepEqual(constrainGridMovement(4, -5, { x: 0, z: -1 }, 5), { x: 4, z: -3 });
  assert.deepEqual(constrainGridMovement(2, 4, { x: 1, z: 0 }, 5), { x: 2, z: 4 });
});

test('a parked astronaut keeps the same camera-relative facing as the camera orbits', () => {
  for (const [facing, before, after] of [[0.4, 0, 1], [-1, 1, -0.5], [2, Math.PI - 0.1, -Math.PI + 0.1]]) {
    const updated = followCameraTurn(facing, before, after);
    assert.ok(Math.abs(Math.sin(updated - after - facing + before)) < 1e-10);
    assert.ok(Math.abs(updated - facing) <= Math.PI);
  }
  assert.equal(followCameraTurn(0.7, 1, 1), 0.7);
});

test('camera tilts above the horizon without moving its orbit below the ground', () => {
  const distance = 11;
  assert.deepEqual(cameraTilt(0.45, distance), { orbitPitch: 0.45, aimOffset: 0 });
  const horizon = cameraTilt(0, distance);
  assert.equal(horizon.orbitPitch, 0.3);
  assert.ok(Math.abs(horizon.aimOffset - Math.sin(0.3) * distance) < 1e-10);
  const sky = cameraTilt(-1.1, distance);
  assert.equal(sky.orbitPitch, 0.3);
  assert.ok(sky.aimOffset > horizon.aimOffset && Number.isFinite(sky.aimOffset));
});

test('watering guide forms a floating dotted route that follows the player and flows toward the station', () => {
  const scene = new Scene(), guide = createDottedGuide(scene);
  const start = new Vector3(0, 0, 0), end = new Vector3(-8, 2, 0), matrix = new Matrix4();
  const point = index => {
    guide.dots.getMatrixAt(index, matrix);
    return new Vector3().setFromMatrixPosition(matrix);
  };
  assert.equal(guide.dots.visible, false);
  guide.update(start, end, 0, true);
  assert.equal(guide.dots.visible, true);
  assert.equal(guide.dots.count, 20);
  assert.ok(point(0).distanceTo(new Vector3(0, 1.15, 0)) < 1e-6);
  assert.ok(point(10).y > point(0).y);
  assert.ok(point(19).x < -7.5 && point(19).x > end.x);
  guide.update(start, end, 0.25, true);
  assert.ok(point(0).x < -0.1);
  start.set(2, 0, 3);
  guide.update(start, end, 0, true);
  assert.ok(point(0).distanceTo(new Vector3(2, 1.15, 3)) < 1e-6);
  guide.update(start, end, 0, false);
  assert.equal(guide.dots.visible, false);
  guide.update(end, end, 0, true);
  assert.equal(guide.dots.visible, false);
});

test('the parked machine guide appears only when field work is ready and the handle is out of reach', () => {
  const state = createState(), astronaut = { x: 4, z: 0 }, handle = { x: 0, z: 0 };
  assert.equal(shouldGuideToMachine(state, true, astronaut, handle), true);
  assert.equal(shouldGuideToMachine(state, false, astronaut, handle), false);
  assert.equal(shouldGuideToMachine(state, true, { x: 1.4, z: 0 }, handle), false);
  state.phase = 3;
  state.plots.forEach(plot => { plot.stage = 3; });
  assert.equal(shouldGuideToMachine(state, true, astronaut, handle), true);
  state.phase = 4;
  state.plots.forEach(plot => { plot.stage = 4; });
  assert.equal(shouldGuideToMachine(state, true, astronaut, handle), false);
  state.phase = 5;
  state.plots.forEach(plot => { plot.stage = 5; plot.growth = 0; });
  assert.equal(shouldGuideToMachine(state, true, astronaut, handle), false);
  state.plots[0].growth = GROW_SECONDS / 4;
  assert.equal(shouldGuideToMachine(state, true, astronaut, handle), true);
  state.phase = 7;
  state.plots.forEach(plot => { plot.stage = 7; plot.growth = GROW_SECONDS - 1; });
  assert.equal(shouldGuideToMachine(state, true, astronaut, handle), false);
  state.plots[0].growth = GROW_SECONDS;
  assert.equal(shouldGuideToMachine(state, true, astronaut, handle), true);
  state.phase = PHASES.length;
  assert.equal(shouldGuideToMachine(state, true, astronaut, handle), false);
});

test('detaching at any heading preserves an upright astronaut that can turn correctly', () => {
  for (const rigAngle of [-2.7, -1.7, 0, 1.7, 2.7]) {
    const scene = new Scene(), rig = new Group(), astronaut = new Group();
    scene.add(rig); rig.add(astronaut);
    rig.position.set(1, 0, -2); rig.rotation.y = rigAngle;
    astronaut.position.set(0, 0, 1.05); astronaut.rotation.y = 0.1;
    const position = astronaut.getWorldPosition(new Vector3());
    const direction = astronaut.getWorldDirection(new Vector3());
    detachUpright(scene, astronaut);
    assert.ok(astronaut.getWorldPosition(new Vector3()).distanceTo(position) < 1e-10);
    assert.ok(astronaut.getWorldDirection(new Vector3()).distanceTo(direction) < 1e-10);
    assert.equal(astronaut.rotation.x, 0);
    assert.equal(astronaut.rotation.z, 0);
    for (const heading of [-2.2, 0, 2.2]) {
      astronaut.rotation.y = heading;
      const actual = astronaut.getWorldDirection(new Vector3());
      assert.ok(actual.distanceTo(new Vector3(Math.sin(heading), 0, Math.cos(heading))) < 1e-10);
    }
  }
});

test('the tool can align to every plot from anywhere in the movement area', () => {
  const offset = 0.85 + 0.82 * 1.05, limit = 7.7;
  for (let row = 0; row < PLOT_ROWS; row++) for (let col = 0; col < PLOT_COLUMNS; col++) {
    const target = { x: (col - (PLOT_COLUMNS - 1) / 2) * 2, z: (row - (PLOT_ROWS - 1) / 2) * 2.1 - 0.3 };
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.6]) {
      for (const start of [{ x: 0, z: 0, angle }, { x: 7.7, z: 0, angle }, { x: 0, z: -7.7, angle }]) {
        const end = digAlignment(start, target, offset, limit, 0.85);
        assert.ok(Math.hypot(end.x, end.z) <= limit);
        assert.ok(Math.abs(end.x - Math.sin(end.angle) * offset - target.x) < 1e-10);
        assert.ok(Math.abs(end.z - Math.cos(end.angle) * offset - target.z) < 1e-10);
        const approach = createApproach(start, end, 0.85);
        for (let i = 0; i < 10; i++) {
          const { pose } = advanceApproach(approach, approach.duration / 10);
          assert.ok(Math.hypot(pose.x, pose.z) <= limit + 1.7 + 1e-10);
        }
      }
    }
  }
});

test('the tracks turn in place before driving forward and align at the target', () => {
  const start = { x: 0, z: 0, angle: 0 }, end = { x: 2, z: 0, angle: 0 }, offset = 0.85;
  const approach = createApproach(start, end, offset);
  const center = pose => ({ x: pose.x - Math.sin(pose.angle) * offset, z: pose.z - Math.cos(pose.angle) * offset });
  const turning = advanceApproach(approach, approach.turnInDuration / 2);
  assert.equal(turning.travel, 0);
  assert.ok(Math.abs(turning.turn) > 0);
  assert.ok(Math.abs(center(turning.pose).x) < 1e-10);
  assert.ok(Math.abs(center(turning.pose).z + offset) < 1e-10);
  advanceApproach(approach, approach.turnInDuration / 2);
  const driving = advanceApproach(approach, approach.travelDuration / 2);
  assert.ok(driving.travel > 0);
  assert.equal(driving.turn, 0);
  assert.ok(Math.abs(-Math.sin(driving.pose.angle) - 1) < 1e-10);
  advanceApproach(approach, approach.travelDuration / 2);
  const finalTurn = advanceApproach(approach, approach.turnOutDuration / 2);
  assert.equal(finalTurn.travel, 0);
  assert.ok(Math.abs(center(finalTurn.pose).x - 2) < 1e-10);
  assert.ok(Math.abs(center(finalTurn.pose).z + offset) < 1e-10);
  const done = advanceApproach(approach, approach.duration);
  assert.ok(Math.abs(done.pose.x - end.x) < 1e-10);
  assert.ok(Math.abs(done.pose.z - end.z) < 1e-10);
  assert.ok(Math.abs(Math.sin(done.pose.angle - end.angle)) < 1e-10);
});

test('approach finishes before work begins, including when a frame crosses the boundary', () => {
  const approach = createApproach({ x: 0, z: 0, angle: 3.1 }, { x: 2, z: 0, angle: -3.1 });
  const first = advanceApproach(approach, approach.duration / 2);
  assert.equal(first.workSeconds, 0);
  const second = advanceApproach(approach, approach.duration);
  assert.ok(Math.abs(second.workSeconds - approach.duration / 2) < 1e-10);
  assert.equal(second.pose.x, 2);
  assert.equal(advanceApproach(approach, 0.5).workSeconds, 0.5);
  assert.throws(() => advanceApproach(approach, -1), RangeError);
});

test('automatic routing follows rows from any starting plot and skips unavailable plots', () => {
  const remaining = new Set(Array.from({ length: PLOT_COUNT }, (_, index) => index));
  let current = 0, direction = 1;
  const visited = [current]; remaining.delete(current);
  while (remaining.size) {
    const next = nextSerpentinePlot([...remaining], current, direction);
    current = next.index; direction = next.direction;
    visited.push(current); remaining.delete(current);
  }
  assert.deepEqual(visited, [0, 1, 2, 3, 4, 9, 8, 7, 6, 5, 10, 11, 12, 13, 14, 19, 18, 17, 16, 15]);
  assert.deepEqual(nextSerpentinePlot([10, 13, 18], 12, 1), { index: 13, direction: 1 });
  assert.deepEqual(nextSerpentinePlot([10, 18], 13, 1), { index: 10, direction: -1 });
  assert.deepEqual(nextSerpentinePlot([5, 16, 19], 10, -1), { index: 5, direction: 1 });
  assert.equal(nextSerpentinePlot([], 0, 1), null);
  for (let start = 0; start < PLOT_COUNT; start++) {
    const pending = new Set(Array.from({ length: PLOT_COUNT }, (_, index) => index));
    let plot = start, step = start % PLOT_COLUMNS < PLOT_COLUMNS / 2 ? -1 : 1;
    pending.delete(plot);
    while (pending.size) {
      const next = nextSerpentinePlot([...pending], plot, step);
      assert.ok(pending.has(next.index));
      pending.delete(next.index); plot = next.index; step = next.direction;
    }
  }
});
test('mission has 20 plots and requires the appropriate powered heads', () => {
  const state = createState();
  assert.equal(PLOT_COUNT, 20);
  assert.equal(state.plots.length, 20);
  assert.ok(PHASES.every(phase => phase.action === 'plant' ? phase.duration === 3 : phase.action === 'water' ? phase.duration === 5 : phase.duration <= 1.2));
  assert.equal(canWork(state, state.plots[0], 'auger'), false);
  assert.equal(canWork(state, state.plots[0], 'tiller'), true);
  for (const plot of state.plots) completeWork(state, plot);
  assert.equal(state.phase, 1);
  assert.equal(canWork(state, state.plots[0], 'plow'), true);
});

test('hand planting reaches the bin, carries and places a potato, and returns to the handle', () => {
  const start = plantingPose(0), pickup = plantingPose(0.4), carry = plantingPose(0.5);
  const deposit = plantingPose(0.72), finish = plantingPose(1);
  assert.deepEqual([start.x, start.z, start.bend, start.carrying], [0, 1.05, 0, false]);
  assert.ok(pickup.bend > 0.9 && pickup.carrying);
  assert.equal(carry.carrying, true);
  assert.equal(deposit.carrying, false);
  assert.equal(deposit.planted, true);
  assert.equal(deposit.drop, 1);
  assert.ok(Math.abs(finish.x) < 1e-10 && Math.abs(finish.z - 1.05) < 1e-10);
  assert.equal(finish.bend, 0);
});

test('walking alternates foot lift with planted stance and settles smoothly', () => {
  const gait = createGait();
  advanceGait(gait, 0.3, 0.3);
  const left = gaitLegPose(gait, 0), right = gaitLegPose(gait, 1);
  assert.equal(left.lift, 0);
  assert.ok(right.lift > 0);
  assert.ok(left.knee < 0 && right.knee < 0);
  assert.ok(Math.abs(left.hip + left.knee + left.ankle) < 0.01);
  assert.ok(gaitBodyOffset(gait) < 0);
  const previous = gait.blend;
  advanceGait(gait, 0, 1);
  assert.ok(gait.blend < previous / 100);
  assert.ok(Math.abs(gaitBodyOffset(gait)) < 0.001);
  assert.throws(() => advanceGait(gait, -1, 0.1), RangeError);
});

test('distance-based gait is stable across frame sizes and continuous between steps', () => {
  const single = createGait(), split = createGait();
  advanceGait(single, 0.9, 1);
  for (let i = 0; i < 10; i++) advanceGait(split, 0.09, 0.1);
  assert.ok(Math.abs(single.phase - split.phase) < 1e-10);
  assert.ok(Math.abs(single.blend - split.blend) < 1e-10);
  const before = gaitLegPose({ phase: 0.6 - 1e-6, blend: 1 }, 0);
  const after = gaitLegPose({ phase: 0.6 + 1e-6, blend: 1 }, 0);
  assert.ok(Math.abs(before.hip - after.hip) < 0.001);
  assert.ok(Math.abs(before.knee - after.knee) < 0.001);
  assert.ok(Math.abs(before.ankle - after.ankle) < 0.001);
});

test('walking arms alternate opposite the legs and settle when stopped', () => {
  const gait = { phase: 0, blend: 1 };
  assert.ok(gaitArmSwing(gait, 0) < 0);
  assert.ok(gaitArmSwing(gait, 1) > 0);
  gait.phase = 0.5;
  assert.ok(gaitArmSwing(gait, 0) > 0);
  assert.ok(gaitArmSwing(gait, 1) < 0);
  advanceGait(gait, 0, 1);
  assert.ok(Math.abs(gaitArmSwing(gait, 0)) < 0.001);
});

test('tiller runs only while work is held with a mounted tiller and tillable ground remains', () => {
  const state = createState();
  const input = { working: true, parked: false, switching: null, activeTool: 'tiller' };
  assert.equal(isTillerRunning(state, input), true);
  assert.equal(isTillerRunning(state, { ...input, working: false }), false);
  assert.equal(isTillerRunning(state, { ...input, parked: true }), false);
  assert.equal(isTillerRunning(state, { ...input, switching: {} }), false);
  assert.equal(isTillerRunning(state, { ...input, activeTool: 'plow' }), false);
  for (const plot of state.plots.slice(0, -1)) completeWork(state, plot);
  assert.equal(isTillerRunning(state, input), true);
  completeWork(state, state.plots.at(-1));
  assert.equal(isTillerRunning(state, input), false);
  state.phase = PHASES.length;
  startNextCycle(state);
  assert.equal(isTillerRunning(state, input), true);
});

test('growth pauses at hilling and irrigation checks until each plot is serviced', () => {
  const state = createState();
  state.phase = 5;
  state.plots.forEach(plot => { plot.stage = 5; });
  assert.deepEqual([0, 0.25, 0.5, 0.75, 1].map(fraction => growthStage(fraction * GROW_SECONDS)), [0, 1, 2, 3, 4]);
  assert.equal(canWork(state, state.plots[0], 'plow'), false);
  advance(state, GROW_SECONDS * 2);
  assert.equal(state.plots[0].growth, GROW_SECONDS / 4);
  assert.equal(canWork(state, state.plots[0], 'plow'), true);
  for (const plot of state.plots) completeWork(state, plot);
  assert.equal(state.phase, 6);
  assert.equal(canWork(state, state.plots[0], 'plow'), false);
  advance(state, GROW_SECONDS * 2);
  assert.equal(state.plots[0].growth, GROW_SECONDS / 2);
  assert.equal(canStartIrrigation(state), true);
  completeIrrigation(state);
  assert.equal(state.phase, 7);
  assert.equal(canWork(state, state.plots[0], 'sifter'), false);
  advance(state, GROW_SECONDS);
  assert.equal(canWork(state, state.plots[0], 'plow'), false);
  assert.equal(canWork(state, state.plots[0], 'sifter'), true);
});

test('rest is night-only, advances to morning and speeds watered crops', () => {
  const state = createState();
  state.plots[0].stage = 7;
  assert.equal(rest(state), false);
  state.minutes = 23 * 60;
  assert.equal(rest(state), true);
  assert.equal(state.minutes, 360);
  assert.equal(state.sol, 2);
  assert.equal(state.plots[0].growth, REST_GROWTH_SECONDS);
  state.minutes = 120;
  assert.equal(rest(state), true);
  assert.equal(state.sol, 2);
});

test('the habitat door can be reached inside the movement boundary and rest is night-only', () => {
  assert.equal(nearRestDoor({ x: 0, z: -7.7 }), true);
  assert.equal(nearRestDoor({ x: 0, z: REST_DOOR.z + REST_DOOR.reach }), true);
  assert.equal(nearRestDoor({ x: 0, z: REST_DOOR.z + REST_DOOR.reach + 0.01 }), false);
  assert.equal(isNight(19 * 60 - 1), false);
  assert.equal(isNight(19 * 60), true);
  assert.equal(isNight(6 * 60), false);
});

test('the irrigation switch is reachable and watering requires the whole field to be ready', () => {
  const state = createState();
  assert.equal(nearWaterSwitch({ x: WATER_SWITCH.x + WATER_SWITCH.reach - 0.01, z: WATER_SWITCH.z }), true);
  assert.equal(nearWaterSwitch({ x: WATER_SWITCH.x + WATER_SWITCH.reach + 0.01, z: WATER_SWITCH.z }), false);
  assert.equal(canStartIrrigation(state), false);
  state.phase = 4;
  state.plots.forEach(plot => { plot.stage = 4; });
  assert.equal(canWork(state, state.plots[0], 'auger'), false);
  assert.equal(canStartIrrigation(state), true);
  completeIrrigation(state);
  assert.equal(state.phase, 5);
  assert.throws(() => completeIrrigation(state), /not ready/);
  state.phase = 6;
  state.plots.forEach(plot => { plot.stage = 6; plot.growth = GROW_SECONDS / 2; });
  state.plots[0].growth = 0;
  assert.equal(canStartIrrigation(state), false);
  assert.throws(() => completeIrrigation(state), /not ready/);
  state.plots[0].growth = GROW_SECONDS / 2;
  completeIrrigation(state);
  assert.equal(state.phase, 7);
  assert.ok(state.plots.every(plot => plot.stage === 7));
});

test('irrigation finishes plots already watered in older saves without repeating their work', () => {
  const state = createState();
  state.phase = 4;
  state.plots.forEach(plot => { plot.stage = 4; });
  state.plots[0].stage = 5; state.plots[0].growth = 2;
  assert.equal(canStartIrrigation(state), true);
  completeIrrigation(state);
  assert.equal(state.phase, 5);
  assert.equal(state.plots[0].growth, 2);
  assert.ok(state.plots.every(plot => plot.stage === 5));
});

test('all objectives progress in order through a complete harvest', () => {
  const state = createState();
  for (const tool of ['tiller', 'plow', 'auger', 'auger', 'auger', 'plow', 'plow', 'sifter']) {
    const phase = state.phase;
    if (phase >= 5) advance(state, GROW_SECONDS);
    if (PHASES[phase].action === 'water') completeIrrigation(state);
    else for (const plot of state.plots) {
      assert.equal(canWork(state, plot, tool), true);
      completeWork(state, plot);
    }
    assert.equal(state.phase, phase + 1);
  }
  assert.equal(state.phase, PHASES.length);
  assert.equal(state.harvested, PLOT_COUNT);
  assert.equal(state.totalHarvested, PLOT_COUNT);
  assert.equal(canWork(state, state.plots[0], 'sifter'), false);
});

test('a completed harvest starts another cycle without losing time or cumulative harvest', () => {
  const state = createState();
  assert.throws(() => startNextCycle(state), /not complete/);
  state.phase = PHASES.length;
  state.harvested = PLOT_COUNT; state.totalHarvested = PLOT_COUNT * 2;
  state.minutes = 1030; state.sol = 3;
  state.plots.forEach(plot => { plot.stage = PHASES.length; plot.growth = GROW_SECONDS; });
  startNextCycle(state);
  assert.equal(state.phase, 0);
  assert.equal(state.harvested, 0);
  assert.equal(state.totalHarvested, PLOT_COUNT * 2);
  assert.deepEqual([state.minutes, state.sol], [1030, 3]);
  assert.ok(state.plots.every(plot => plot.stage === 0 && plot.growth === 0));
  assert.equal(canWork(state, state.plots[0], 'tiller'), true);
});

test('parked operator and an active sprinkler countdown survive reload', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const state = createState();
  state.phase = 4; state.plots.forEach(plot => { plot.stage = 4; });
  const position = { x: 0, z: 0, angle: 0 }, operator = { x: -7, z: -2, angle: 1 };
  saveProgress(storage, state, position, 'auger', operator, 2.5);
  const restored = loadProgress(storage);
  assert.deepEqual(restored.operator, operator);
  assert.equal(restored.irrigation, 2.5);
  completeIrrigation(restored.state);
  assert.equal(restored.state.phase, 5);
  saveProgress(storage, state, position, 'auger', operator, 6);
  assert.throws(() => loadProgress(storage), /invalid or incompatible/);
});

test('completed plots, growth, time, position and attachment survive a save and reload', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.equal(loadProgress(storage), null);
  const state = createState();
  for (let phase = 0; phase < 5; phase++) for (const plot of state.plots) completeWork(state, plot);
  advance(state, 4);
  const position = { x: 1, z: -2, angle: 0.5 };
  saveProgress(storage, state, position, 'plow');
  const restored = loadProgress(storage);
  assert.deepEqual(restored.state, state);
  assert.deepEqual(restored.position, position);
  assert.equal(restored.tool, 'plow');
  assert.equal(canWork(restored.state, restored.state.plots[0], 'plow'), false);
  advance(restored.state, GROW_SECONDS);
  assert.equal(canWork(restored.state, restored.state.plots[0], 'plow'), true);
});

test('invalid saves and storage failures are reported rather than silently discarded', () => {
  const storage = { getItem: () => '{broken', setItem: () => { throw new Error('Storage full'); } };
  assert.throws(() => loadProgress(storage), SyntaxError);
  assert.throws(() => saveProgress(storage, createState(), { x: 0, z: 0, angle: 0 }, 'tiller'), /Storage full/);
  const invalid = JSON.stringify({ version: 1, state: createState(), position: { x: 100, z: 0, angle: 0 }, tool: 'tiller' });
  assert.throws(() => loadProgress({ getItem: key => key === SAVE_KEY ? invalid : null }), /invalid or incompatible/);
});

test('reset deletes only the saved mission and reports storage failures', () => {
  const data = new Map([[SAVE_KEY, 'mission'], ['unrelated', 'keep']]);
  const storage = { removeItem: key => data.delete(key), getItem: key => data.get(key) ?? null };
  resetProgress(storage);
  assert.equal(loadProgress(storage), null);
  assert.equal(data.get('unrelated'), 'keep');
  assert.throws(() => resetProgress({ removeItem: () => { throw new Error('Storage denied'); } }), /Storage denied/);
});

test('older saves initialize their cumulative harvest without losing completed plots', () => {
  const state = createState();
  state.phase = PHASES.length - 1;
  state.plots.forEach((plot, index) => {
    plot.stage = index < 3 ? PHASES.length : PHASES.length - 1;
    plot.growth = GROW_SECONDS;
  });
  state.harvested = 3;
  delete state.totalHarvested;
  const raw = JSON.stringify({ version: 1, state, position: { x: 0, z: 0, angle: 0 }, tool: 'sifter' });
  const restored = loadProgress({ getItem: () => raw });
  assert.equal(restored.state.totalHarvested, 3);
  completeWork(restored.state, restored.state.plots[3]);
  assert.equal(restored.state.totalHarvested, 4);
});
