import { describe, expect, it } from 'vitest';
import { croutonConfig, randomConfig } from './presets';
import { activePeople, applyEvent, emptyState, headcount, project } from './project';
import { simulate } from './simulate';
import type { OrgEvent } from './types';
import { validateEvents, validateState } from './validate';

const UNTIL = '2032-01-01';
const SEEDS = Array.from({ length: 40 }, (_, i) => `flour-${i}`);

/** Every prefix of the log must be a valid organization — not just the end state. */
function assertEveryPrefixValid(events: OrgEvent[], label: string): void {
  const state = emptyState();
  for (const event of events) {
    applyEvent(state, event);
    const problems = validateState(state);
    expect(problems, `${label} after seq ${event.seq} (${event.type})`).toEqual([]);
  }
}

describe('realism invariants', () => {
  it('holds at every step of every generated history', () => {
    for (const seed of SEEDS) {
      const events = simulate(randomConfig(seed, UNTIL));
      expect(validateEvents(events), seed).toEqual([]);
      assertEveryPrefixValid(events, seed);
    }
  });

  it('holds for the crouton preset', () => {
    const events = simulate(croutonConfig('2036-01-01'));
    expect(validateEvents(events)).toEqual([]);
    assertEveryPrefixValid(events, 'crouton');
  });

  it('never has more than one active CTO (or seven)', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const events = simulate(randomConfig(seed, UNTIL));
      const state = emptyState();
      for (const event of events) {
        applyEvent(state, event);
        const ctos = activePeople(state).filter((p) => p.title === 'CTO');
        expect(ctos.length, seed).toBeLessThanOrEqual(1);
      }
    }
  });

  it('produces a believable spread of outcomes across seeds', () => {
    let ended = 0;
    let alive = 0;
    let maxHeadcount = 0;
    for (const seed of SEEDS) {
      const events = simulate(randomConfig(seed, UNTIL));
      const state = project(events);
      if (state.status === 'operating') alive += 1;
      else ended += 1;
      maxHeadcount = Math.max(maxHeadcount, headcount(state));
    }
    // Roughly half of startups are gone within ~5 years; ~10 simulated years
    // should show both survivors and casualties, and nobody at Google scale.
    expect(ended).toBeGreaterThan(0);
    expect(alive).toBeGreaterThan(0);
    expect(maxHeadcount).toBeLessThan(250);
  });
});
