import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import {
  DEFAULT_MODEL,
  capacitySnapshot,
  financeSeries,
  hiringScenario,
  personCapacity,
  weeklyBurn,
  withoutPerson,
} from './metrics';
import { croutonConfig, randomConfig } from './presets';
import { activePeople, applyEvent, emptyState, project } from './project';
import { simulate } from './simulate';
import type { OrgEvent, Person } from './types';
import { validateEvents, validateState } from './validate';

const UNTIL = '2036-01-01';

const person = (over: Partial<Person> = {}): Person => ({
  id: 'p9',
  name: 'Test Person',
  title: 'Engineer',
  func: 'engineering',
  teamId: null,
  managerId: 'p1',
  employment: 'full-time',
  startedAt: '2024-01-01',
  endedAt: null,
  departureReason: null,
  isFounder: false,
  lastPromotedAt: null,
  ...over,
});

describe('capacity', () => {
  it('discounts a new hire until they have ramped', () => {
    const hire = person({ startedAt: '2024-01-01' });
    const day1 = personCapacity(hire, '2024-01-01', 0);
    const midRamp = personCapacity(hire, addDays('2024-01-01', 6 * 7), 0);
    const ramped = personCapacity(hire, addDays('2024-01-01', 40 * 7), 0);

    expect(day1).toBeCloseTo(DEFAULT_MODEL.rampFloor);
    expect(midRamp).toBeGreaterThan(day1);
    expect(ramped).toBe(1);
  });

  it('counts a part-timer as half a person and a contractor near-full', () => {
    const at = '2026-01-01';
    expect(personCapacity(person({ employment: 'part-time' }), at, 0)).toBeCloseTo(0.5);
    expect(personCapacity(person({ employment: 'contract' }), at, 0)).toBeCloseTo(0.9);
  });

  it('charges managers for their reports but never below the floor', () => {
    const at = '2026-01-01';
    const ic = personCapacity(person(), at, 0);
    const withSix = personCapacity(person(), at, 6);
    const withThirty = personCapacity(person(), at, 30);

    expect(withSix).toBeLessThan(ic);
    expect(withThirty).toBeCloseTo(DEFAULT_MODEL.managementFloor);
  });

  it('is always below headcount, because nobody is a full unit of output', () => {
    const events = simulate(randomConfig('cap-1', UNTIL));
    for (const at of ['2024-01-01', '2027-06-01', '2030-01-01']) {
      const snapshot = capacitySnapshot(project(events, at), at);
      expect(snapshot.totalCapacity).toBeLessThanOrEqual(snapshot.totalHeadcount);
      expect(snapshot.overheadLoss).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('a departure redistributes work onto whoever is left', () => {
  it('drops the team capacity and raises its load', () => {
    let checked = 0;

    // Scan seeds rather than pinning one: which company has a mid-life
    // engineering departure shifts every time the model changes.
    for (let s = 0; s < 12 && checked < 3; s++) {
      const events = simulate(randomConfig(`load-${s}`, UNTIL));
      const state = emptyState();

      for (const event of events) {
        if (event.type === 'person-departed' && state.people[event.personId]?.func === 'engineering') {
          const pick = (at: string) =>
            capacitySnapshot(state, at).byFunc.find((f) => f.func === 'engineering')!;
          const before = pick(event.at);
          applyEvent(state, event);
          const after = pick(event.at);

          if (before.headcount > 1 && after.headcount > 0) {
            expect(after.capacity).toBeLessThan(before.capacity);
            // Some of their work leaves with them — one fewer head generates
            // less — but a departing engineer takes far more capacity than
            // demand, so the remaining team ends up carrying more each. That
            // gap is what "their work got redistributed" actually means.
            expect(after.load).toBeGreaterThan(before.load);
            checked += 1;
          }
          continue;
        }
        applyEvent(state, event);
      }
    }

    expect(checked).toBeGreaterThan(0);
  });
});

describe('finance', () => {
  it('books a raise as capital and spends it down', () => {
    // Not every seed raises, so take the first that does rather than pinning
    // the test to a seed whose outcome could shift with any model change.
    const events = Array.from({ length: 10 }, (_, i) => simulate(randomConfig(`money-${i}`, UNTIL)))
      .find((log) => log.some((e) => e.type === 'funding-raised'))!;
    const raise = events.find((e) => e.type === 'funding-raised');
    expect(raise).toBeDefined();

    const series = financeSeries(events);
    const atRaise = series.find((p) => p.at >= raise!.at)!;
    expect(atRaise.finance.capitalUsd).toBeGreaterThan(0);
    expect(atRaise.finance.burnWeeklyUsd).toBeGreaterThan(0);
  });

  it('charges nothing for a founder before the first round', () => {
    const events = simulate(croutonConfig('2026-08-03'));
    const founderOnly = project(events, '2024-11-01');
    expect(founderOnly.latestRound).toBeNull();
    expect(weeklyBurn(founderOnly)).toBe(0);
  });

  it('is deterministic for a given log', () => {
    const events = simulate(randomConfig('money-7', UNTIL));
    expect(JSON.stringify(financeSeries(events))).toEqual(JSON.stringify(financeSeries(events)));
  });
});

describe('the generator and the UI read the same books', () => {
  /**
   * The simulator only ends a company that depends on someone else's money.
   * If the UI's independent fold of the same log disagreed about the balance,
   * the panel could show a profitable company with cash in the bank shutting
   * down for lack of it — the exact drift that sharing one reducer is meant to
   * make impossible, and a real bug this assertion caught.
   *
   * Note it is *not* an error to shut down holding cash: companies wind down
   * while they can still pay people out. What must never happen is a business
   * earning more than it spends dying of insolvency.
   */
  it('never shuts down a company that was paying for itself', () => {
    let checked = 0;

    for (let i = 0; i < 40; i++) {
      const events: OrgEvent[] = simulate(randomConfig(`drift-${i}`, UNTIL));
      const shutdown = events.find((e) => e.type === 'company-shutdown');
      if (!shutdown) continue;
      // A company that never raised has no tracked payroll at all (the model
      // does not follow the founder's savings), so it always reads as costing
      // nothing. Its death is the bootstrap fuse, not insolvency.
      if (!events.some((e) => e.type === 'funding-raised')) continue;

      // Measured over the wind-down window, not at the shutdown date itself:
      // by then the team has already been let go, so burn is ~0 and every
      // corpse looks profitable. The decision was made a few weeks earlier.
      const series = financeSeries(events, shutdown.at);
      const window = series.filter(
        (p) => p.at >= addDays(shutdown.at, -15 * 7) && p.at < shutdown.at,
      );
      if (window.length === 0) continue;

      const wasBurning = window.some((p) => p.finance.netBurnWeeklyUsd > 0);
      expect(wasBurning, `drift-${i} shut down while paying for itself`).toBe(true);
      checked += 1;
    }

    expect(checked).toBeGreaterThan(0);
  });

  it('leaves survivors solvent or self-sustaining', () => {
    for (let i = 0; i < 25; i++) {
      const events = simulate(randomConfig(`solvent-${i}`, UNTIL));
      const final = project(events);
      if (final.status !== 'operating') continue;

      const series = financeSeries(events);
      const last = series[series.length - 1].finance;
      expect(last.capitalUsd > 0 || final.defaultAlive, `solvent-${i}`).toBe(true);
    }
  });

  it('reaches default alive at most once, and never dies afterwards', () => {
    let checked = 0;

    for (let i = 0; i < 40; i++) {
      const events = simulate(randomConfig(`alive-${i}`, UNTIL));
      const milestones = events.filter((e) => e.type === 'default-alive');
      expect(milestones.length).toBeLessThanOrEqual(1);
      if (milestones.length === 0) continue;

      // The milestone has to mean something: a company off the runway clock
      // can still be acquired, but it cannot run out of money it isn't
      // waiting on. Its revenue is also converging on covering its burn.
      const final = project(events);
      expect(final.status, `alive-${i}`).not.toBe('shut-down');

      const series = financeSeries(events);
      const last = series[series.length - 1].finance;
      expect(last.arrUsd).toBeGreaterThan(0);
      checked += 1;
    }

    expect(checked).toBeGreaterThan(0);
  });
});

describe('counterfactuals stay valid organisations', () => {
  it('leaves a legal org behind when anyone but the founder departs', () => {
    let checked = 0;

    for (const seed of ['cf-1', 'cf-2', 'cf-3', 'cf-4', 'cf-5']) {
      const events = simulate(randomConfig(seed, UNTIL));
      // Mid-log, so the company is populated whatever its lifespan turned out
      // to be — a fixed date lands on a corpse for half the seeds.
      const at = events[Math.floor(events.length * 0.6)].at;
      const state = project(events, at);

      for (const person of activePeople(state)) {
        if (person.isFounder) continue;
        const after = withoutPerson(state, at, person.id);
        expect(validateState(after), `${seed} without ${person.name}`).toEqual([]);
        checked += 1;
      }
    }

    expect(checked).toBeGreaterThan(0);
  });

  it('does not pretend a founder-less org is valid', () => {
    // The founder never leaves in this model, so the UI must not offer it —
    // this test documents why rather than asserting the broken shape is fine.
    let checked = 0;

    for (let i = 0; i < 8 && checked === 0; i++) {
      const events = simulate(randomConfig(`cf-${i}`, UNTIL));
      const at = events[Math.floor(events.length * 0.6)].at;
      const state = project(events, at);
      // Must be operating: the validator's singleton-CEO rule only applies to
      // a live company, so a wound-down org would pass vacuously.
      if (state.status !== 'operating') continue;
      const founder = activePeople(state).find((p) => p.isFounder);
      if (!founder) continue;

      expect(validateState(withoutPerson(state, at, founder.id)).length).toBeGreaterThan(0);
      checked += 1;
    }

    expect(checked).toBeGreaterThan(0);
  });
});

describe('the two sets of books agree', () => {
  /**
   * The simulator winds a funded company down the week its capital hits zero.
   * So if the UI's independent fold ever shows a *surviving* funded company
   * insolvent, the two have drifted — the generator would have killed it.
   * Wind-down weeks are excluded: the company keeps paying people on the way
   * out, which legitimately takes capital negative.
   */
  it('never shows a living funded company as insolvent', () => {
    let weeks = 0;

    for (let i = 0; i < 15; i++) {
      const events = simulate(randomConfig(`agree-${i}`, UNTIL));
      const shutdown = events.find((e) => e.type === 'company-shutdown');
      const cutoff = shutdown ? addDays(shutdown.at, -15 * 7) : null;

      for (const point of financeSeries(events)) {
        if (cutoff && point.at >= cutoff) break;
        const state = project(events, point.at);
        if (state.latestRound === null || state.defaultAlive) continue;
        expect(point.finance.capitalUsd, `agree-${i} @ ${point.at}`).toBeGreaterThan(-1);
        weeks += 1;
      }
    }

    expect(weeks).toBeGreaterThan(0);
  });

  it('never lets a pre-round company owe money it is not tracking', () => {
    for (let i = 0; i < 15; i++) {
      const events = simulate(randomConfig(`boot-${i}`, UNTIL));
      for (const point of financeSeries(events)) {
        if (project(events, point.at).latestRound !== null) break;
        expect(point.finance.capitalUsd, `boot-${i} @ ${point.at}`).toBe(0);
      }
    }
  });
});

describe('scenarios branch the future without rewriting the past', () => {
  /**
   * A living company with room left to run. Derived from each log rather than
   * hardcoded, because a fixed date lands on a corpse for half the seeds and
   * moves every time the engine changes.
   */
  function branchPoint(seed: string) {
    const config = randomConfig(seed, UNTIL);
    const baseline = simulate(config);
    const at = baseline[Math.floor(baseline.length * 0.5)].at;
    const state = project(baseline, at);
    const alive = state.status === 'operating' && activePeople(state).length >= 5;
    return alive && baseline.some((e) => e.at > at) ? { config, baseline, at, state } : null;
  }

  const cases = ['branch-0', 'branch-1', 'branch-2', 'branch-3', 'branch-4', 'branch-5']
    .map(branchPoint)
    .filter((c): c is NonNullable<typeof c> => c !== null);

  it('has usable fixtures', () => expect(cases.length).toBeGreaterThan(0));

  it('keeps every event before the intervention identical', () => {
    for (const { config, baseline, at } of cases) {
      const branched = simulate({
        ...config,
        interventions: [{ at, kind: 'hire', func: 'engineering', count: 5 }],
      });
      // Same seed, same RNG draws up to the intervention: the shared prefix
      // must be byte-identical, or "the past is preserved" is not a claim.
      const before = (log: OrgEvent[]) => log.filter((e) => e.at < at);
      expect(JSON.stringify(before(branched))).toEqual(JSON.stringify(before(baseline)));
    }
  });

  it('actually changes the future', () => {
    let changed = 0;

    for (const { config, baseline, at } of cases) {
      const branched = simulate({
        ...config,
        interventions: [{ at, kind: 'hire', func: 'engineering', count: 5 }],
      });

      const heads = (log: OrgEvent[]) =>
        capacitySnapshot(project(log, at), at).byFunc.find((f) => f.func === 'engineering')!
          .headcount;
      // The hires are real headcount, not a projection.
      expect(heads(branched)).toBeGreaterThan(heads(baseline));

      const after = (log: OrgEvent[]) => JSON.stringify(log.filter((e) => e.at >= at));
      if (after(branched) !== after(baseline)) changed += 1;
    }

    // Adding five engineers has to move at least one company's trajectory,
    // or the intervention is decoration.
    expect(changed).toBeGreaterThan(0);
  });

  it('produces a valid organisation, cascades and all', () => {
    for (const { config, state, at } of cases) {
      const victim = activePeople(state).find((p) => !p.isFounder);
      if (!victim) continue;

      const branched = simulate({
        ...config,
        interventions: [
          { at, kind: 'hire', func: 'gtm', count: 3 },
          { at, kind: 'depart', personId: victim.id },
        ],
      });

      expect(validateEvents(branched)).toEqual([]);
      const folded = emptyState();
      for (const event of branched) {
        applyEvent(folded, event);
        expect(validateState(folded), `after seq ${event.seq}`).toEqual([]);
      }
    }
  });

  it('refuses to remove the founder', () => {
    for (const { config, baseline, state, at } of cases) {
      const founder = activePeople(state).find((p) => p.isFounder)!;
      const branched = simulate({
        ...config,
        interventions: [{ at, kind: 'depart', personId: founder.id }],
      });
      expect(JSON.stringify(branched)).toEqual(JSON.stringify(baseline));
    }
  });
});

describe('hiring scenarios', () => {
  it('buys capacity with runway', () => {
    const events = simulate(randomConfig('scenario-4', UNTIL));
    const at = '2029-01-01';
    const state = project(events, at);
    const finance = financeSeries(events, at).pop()!.finance;

    const engineers = capacitySnapshot(state, at).byFunc.find((f) => f.func === 'engineering')!;
    if (engineers.headcount === 0) return;

    const doubled = hiringScenario(state, finance, at, engineers.headcount * 2);
    expect(doubled.capacity).toBeGreaterThan(doubled.currentCapacity);
    expect(doubled.monthlyBurnUsd).toBeGreaterThan((finance.burnWeeklyUsd * 52) / 12);
    // More engineers than the company can fund is exactly the trade the panel
    // exists to make visible.
    expect(doubled.runwayMonths).toBeLessThan(
      hiringScenario(state, finance, at, engineers.headcount).runwayMonths,
    );
  });
});
