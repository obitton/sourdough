import { beforeAll, describe, expect, it } from 'vitest';
import { randomConfig } from './presets';
import { activePeople, applyEvent, emptyState, project } from './project';
import { simulate } from './simulate';
import type { OrgEvent, Round } from './types';

/**
 * The invariant suite proves histories are *structurally* valid. This one asks
 * the harder question: are they *statistically* plausible? Each assertion is a
 * published benchmark from docs/research/org-realism.md, checked against what
 * the generator actually emits — the difference between calibrating inputs and
 * verifying outputs.
 *
 * Bands are deliberately wide. Any change to how many times the RNG is drawn
 * reshuffles every downstream outcome, so these must tolerate resampling noise
 * while still catching a constant that has drifted into fantasy.
 */

// Enough histories for medians to be stable, few enough that the suite stays
// quick — statistical claims are only worth checking if they get checked often.
const SEEDS = Array.from({ length: 120 }, (_, i) => `calib-${i}`);
// Long enough that nearly every company has reached a terminal state. Outcome
// benchmarks describe whole lifetimes, and truncating early biases the mix:
// an acquisition resolves in one event, a shutdown needs its wind-down weeks,
// so a short horizon strands dying companies in the "still operating" bucket.
const UNTIL = '2036-01-01';
const monthsBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000 / 30.44;

const median = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

interface Corpus {
  headcountAtRaise: Record<string, number[]>;
  gapMonths: Record<string, number[]>;
  layoffPcts: number[];
  departuresByBucket: number[];
  shutdownDelays: number[];
  earlyHires: { total: number; contingent: number };
  reachedSeed: number;
  reachedA: number;
  outcomes: { operating: number; acquired: number; shutDown: number };
}

function buildCorpus(): Corpus {
  const c: Corpus = {
    headcountAtRaise: {},
    gapMonths: {},
    layoffPcts: [],
    departuresByBucket: new Array(6).fill(0),
    shutdownDelays: [],
    earlyHires: { total: 0, contingent: 0 },
    reachedSeed: 0,
    reachedA: 0,
    outcomes: { operating: 0, acquired: 0, shutDown: 0 },
  };

  for (const seed of SEEDS) {
    const events: OrgEvent[] = simulate(randomConfig(seed, UNTIL));
    const state = emptyState();
    const startedAt = new Map<string, string>();
    const rounds = new Set<Round>();
    let lastRaise: { at: string; round: Round } | null = null;

    for (const event of events) {
      applyEvent(state, event);
      switch (event.type) {
        case 'company-founded':
          startedAt.set(event.founderId, event.at);
          break;
        case 'person-hired':
          startedAt.set(event.personId, event.at);
          if (!rounds.has('series-a') && !rounds.has('series-b')) {
            c.earlyHires.total += 1;
            if (event.employment !== 'full-time') c.earlyHires.contingent += 1;
          }
          break;
        case 'person-departed': {
          const from = startedAt.get(event.personId);
          // Six-month buckets up to 3 years; the equity cliff should show up
          // as a spike in the 12–18 month bucket.
          if (from) c.departuresByBucket[Math.min(5, Math.floor(monthsBetween(from, event.at) / 6))] += 1;
          break;
        }
        case 'funding-raised':
          rounds.add(event.round);
          (c.headcountAtRaise[event.round] ??= []).push(activePeople(state).length);
          if (lastRaise) {
            (c.gapMonths[`${lastRaise.round}->${event.round}`] ??= []).push(
              monthsBetween(lastRaise.at, event.at),
            );
          }
          lastRaise = { at: event.at, round: event.round };
          break;
        case 'layoff-round':
          if (event.pct !== 100) c.layoffPcts.push(event.pct);
          break;
        case 'company-shutdown':
          if (lastRaise) c.shutdownDelays.push(monthsBetween(lastRaise.at, event.at));
          break;
      }
    }

    if (rounds.has('seed')) c.reachedSeed += 1;
    if (rounds.has('series-a')) c.reachedA += 1;

    const status = project(events).status;
    if (status === 'operating') c.outcomes.operating += 1;
    else if (status === 'acquired') c.outcomes.acquired += 1;
    else c.outcomes.shutDown += 1;
  }

  return c;
}

/** Built once; every assertion below reads the same corpus of histories. */
let cached: Corpus | null = null;
const corpus = (): Corpus => cached!;

describe('calibration against published benchmarks', () => {
  // Generating the corpus costs far more than the default per-test budget, so
  // it happens once here rather than inside whichever test runs first.
  beforeAll(() => {
    cached = buildCorpus();
  }, 120_000);

  it('grows to roughly the median headcount at each round', () => {
    // Carta 2024–25: ~5–8 at seed, ~17 at Series A, ~48 at Series B.
    expect(median(corpus().headcountAtRaise['seed'])).toBeGreaterThanOrEqual(4);
    expect(median(corpus().headcountAtRaise['seed'])).toBeLessThanOrEqual(10);
    expect(median(corpus().headcountAtRaise['series-a'])).toBeGreaterThanOrEqual(11);
    expect(median(corpus().headcountAtRaise['series-a'])).toBeLessThanOrEqual(24);
    expect(median(corpus().headcountAtRaise['series-b'])).toBeGreaterThanOrEqual(35);
    expect(median(corpus().headcountAtRaise['series-b'])).toBeLessThanOrEqual(65);
  });

  it('spaces rounds about two years apart', () => {
    // Carta: seed→A 616–774 days, A→B ~712–732 days. Pre-2022 pacing was half
    // this; a regression back toward 12 months means the stage floors slipped.
    expect(median(corpus().gapMonths['seed->series-a'])).toBeGreaterThanOrEqual(17);
    expect(median(corpus().gapMonths['seed->series-a'])).toBeLessThanOrEqual(30);
    expect(median(corpus().gapMonths['series-a->series-b'])).toBeGreaterThanOrEqual(17);
    expect(median(corpus().gapMonths['series-a->series-b'])).toBeLessThanOrEqual(32);
  });

  it('shows the 12-month equity cliff as a departure spike', () => {
    // Carta's tenure study: hazard is low through month 11, jumps
    // discontinuously at the one-year vesting cliff, stays elevated into year 2.
    // This is the single most load-bearing shape in the attrition model — a flat
    // hazard would still pass every structural invariant and read as fiction.
    const [firstHalf, secondHalf, cliff, postCliff] = corpus().departuresByBucket;
    expect(cliff).toBeGreaterThan(secondHalf);
    expect(cliff).toBeGreaterThan(firstHalf);
    expect(cliff).toBeGreaterThan(postCliff);
  });

  it('cuts 10-30% in a layoff, centered near 15%', () => {
    expect(median(corpus().layoffPcts)).toBeGreaterThanOrEqual(12);
    expect(median(corpus().layoffPcts)).toBeLessThanOrEqual(20);
    expect(Math.min(...corpus().layoffPcts)).toBeGreaterThanOrEqual(10);
    // A cut above ~40% reads as a wind-down, not a layoff.
    expect(Math.max(...corpus().layoffPcts)).toBeLessThanOrEqual(40);
  });

  it('graduates roughly half of seeded companies to Series A', () => {
    // Carta cohorts: ~45–50% eventually raise an A. The headline realism claim
    // in the README — "roughly half of seed companies never reach A".
    const rate = corpus().reachedA / corpus().reachedSeed;
    expect(rate).toBeGreaterThan(0.35);
    expect(rate).toBeLessThan(0.65);
  });

  it('ends a real minority of companies in acquisition, not most or none', () => {
    // Research puts acquisitions at 25–35% of endings. That is a ratio of two
    // counts, so at this corpus size it carries ~4pp of standard error and the
    // per-seed ambition/turbulence draw adds more — a tight band here would
    // fail on resampling, not on drift. The wide band catches the failure that
    // actually matters (the soft-landing branch dying, or swallowing every
    // ending); the point estimate belongs in a larger offline sweep.
    const ended = corpus().outcomes.acquired + corpus().outcomes.shutDown;
    const acquiredShare = corpus().outcomes.acquired / ended;
    expect(acquiredShare).toBeGreaterThan(0.15);
    expect(acquiredShare).toBeLessThan(0.55);
  });

  it('shuts down 2-3 years after the last raise', () => {
    // Companies raise 24–30 months of runway; death follows the failed re-raise.
    expect(median(corpus().shutdownDelays)).toBeGreaterThanOrEqual(20);
    expect(median(corpus().shutdownDelays)).toBeLessThanOrEqual(42);
  });

  it('staffs the early team with about a fifth contract or part-time', () => {
    const share = corpus().earlyHires.contingent / corpus().earlyHires.total;
    expect(share).toBeGreaterThan(0.12);
    expect(share).toBeLessThan(0.35);
  });

  it('leaves some companies quietly operating rather than only booming or dying', () => {
    // Outcome datasets split roughly into thirds: still-private, shut down,
    // acquired. The simulated share is lower than a third because the horizon
    // runs 14–18 years — but it must not be zero, or the generator can only
    // produce rocket ships and corpses.
    expect(corpus().outcomes.operating).toBeGreaterThan(0);
    expect(corpus().outcomes.shutDown).toBeGreaterThan(0);
    expect(corpus().outcomes.acquired).toBeGreaterThan(0);
  });
});
