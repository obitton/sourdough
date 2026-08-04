export * from './types';
export { addDays, daysBetween, weeksBetween, formatMonth } from './dates';
export { createRng, type Rng } from './rng';
export {
  applyEvent,
  emptyState,
  project,
  activePeople,
  headcount,
  headcountSeries,
  type HeadcountPoint,
} from './project';
export { validateState, validateEvents } from './validate';
export { simulate, type SimConfig, type Intervention } from './simulate';
export { HIRE_MIX, mixShare, stageIndexOf } from './mix';
export { croutonConfig, randomConfig } from './presets';
