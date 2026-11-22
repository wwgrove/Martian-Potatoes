import { canStartIrrigation, GROW_SECONDS, IRRIGATION_SECONDS, MOVEMENT_RADIUS, PHASES, PLOT_COUNT, TOOL_TYPES, WALK_RADIUS } from './simulation.js';

export const SAVE_KEY = 'martian-potatoes-progress-v1';

export function loadProgress(storage) {
  const raw = storage.getItem(SAVE_KEY);
  if (raw === null) return null;
  const save = JSON.parse(raw);
  const state = save?.state, position = save?.position;
  const validState = state && Number.isInteger(state.phase) && state.phase >= 0 && state.phase <= PHASES.length &&
    Number.isFinite(state.minutes) && state.minutes >= 0 && state.minutes < 1440 &&
    Number.isInteger(state.sol) && state.sol >= 1 && Number.isInteger(state.harvested) &&
    (state.totalHarvested === undefined || (Number.isSafeInteger(state.totalHarvested) && state.totalHarvested >= state.harvested)) &&
    Array.isArray(state.plots) && state.plots.length === PLOT_COUNT &&
    state.plots.every(plot => plot && Number.isInteger(plot.stage) &&
      (plot.stage === state.phase || (state.phase < PHASES.length && plot.stage === state.phase + 1)) &&
      Number.isFinite(plot.growth) && plot.growth >= 0 && plot.growth <= GROW_SECONDS &&
      (plot.stage >= 5 || plot.growth === 0) &&
      (plot.stage !== 5 || plot.growth <= GROW_SECONDS / 4) &&
      (plot.stage !== 6 || plot.growth <= GROW_SECONDS / 2) &&
      (plot.stage !== 8 || plot.growth === GROW_SECONDS)) &&
    state.harvested === state.plots.filter(plot => plot.stage === PHASES.length).length;
  const validPosition = position && Number.isFinite(position.x) && Number.isFinite(position.z) &&
    Number.isFinite(position.angle) && Math.hypot(position.x, position.z) <= MOVEMENT_RADIUS + 0.00001;
  const operator = save?.operator;
  const validOperator = operator == null || (Number.isFinite(operator.x) && Number.isFinite(operator.z) &&
    Number.isFinite(operator.angle) && Math.hypot(operator.x, operator.z) <= WALK_RADIUS + 0.00001);
  const validIrrigation = save?.irrigation == null || (Number.isFinite(save.irrigation) &&
    save.irrigation > 0 && save.irrigation <= IRRIGATION_SECONDS && validState && canStartIrrigation(state));
  if (save?.version !== 1 || !validState || !validPosition || !validOperator || !validIrrigation || !TOOL_TYPES.includes(save.tool)) {
    throw new Error('Saved progress is invalid or incompatible.');
  }
  if (state.totalHarvested === undefined) state.totalHarvested = state.harvested;
  return save;
}

export function saveProgress(storage, state, position, tool, operator = null, irrigation = null) {
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, state, position, tool, operator, irrigation }));
}
