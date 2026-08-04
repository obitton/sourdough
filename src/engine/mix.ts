import type { Func, Round } from './types';

/**
 * The functional mix a company has at each stage — engineering-heavy early,
 * GTM growing with scale (org-realism.md §2).
 *
 * Deliberately shared. The simulator draws new hires from it, and the capacity
 * model uses the same shape to decide how much work each function is carrying,
 * so "what a company this size should look like" is defined exactly once. A
 * second, hand-tuned table was the reason a three-person pre-seed company used
 * to read as drowning in unmet sales work.
 */
export const HIRE_MIX: ReadonlyArray<ReadonlyArray<readonly [Func, number]>> = [
  [['engineering', 70], ['design', 15], ['gtm', 5],  ['operations', 10]],
  [['engineering', 60], ['design', 15], ['gtm', 15], ['operations', 10]],
  [['engineering', 50], ['design', 12], ['gtm', 26], ['operations', 12]],
  [['engineering', 42], ['design', 10], ['gtm', 33], ['operations', 15]],
  [['engineering', 38], ['design', 8],  ['gtm', 36], ['operations', 18]],
];

/** Stage index for a company whose latest round is `round`. */
export function stageIndexOf(round: Round | null): number {
  switch (round) {
    case null:
      return 0;
    case 'pre-seed':
      return 1;
    case 'seed':
      return 2;
    case 'series-a':
      return 3;
    case 'series-b':
      return 4;
  }
}

/** The stage's mix as fractions of one, keyed by function. */
export function mixShare(round: Round | null): Record<Func, number> {
  const entries = HIRE_MIX[stageIndexOf(round)];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const share = { engineering: 0, design: 0, gtm: 0, operations: 0 } as Record<Func, number>;
  for (const [func, weight] of entries) share[func] = weight / total;
  return share;
}
