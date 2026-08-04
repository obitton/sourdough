import { addDays, weeksBetween } from './dates';
import { mixShare } from './mix';
import { activePeople, applyEvent, emptyState } from './project';
import type { Func, IsoDate, OrgEvent, OrgState, Person, PersonFunc } from './types';

/**
 * Capacity and money — both derived, never stored.
 *
 * Nothing here adds an event type. Headcount, employment, tenure, reporting
 * structure and funding rounds are already in the log, and that is everything
 * a bandwidth and burn model needs; capital is just funding minus the burn
 * implied by who was on payroll each week. Deriving rather than emitting is
 * what keeps "events are the only truth" true after the business layer lands.
 *
 * `stepFinance` is the second reducer in the codebase, and it follows the same
 * rule as `applyEvent`: the simulator and the UI both call it, so the numbers
 * the generator makes decisions on are the numbers the panel renders.
 */

// ---------------------------------------------------------------------------
// The tuning surface. Every constant is one place, so the model is a config
// object rather than assumptions scattered through the code.
// ---------------------------------------------------------------------------

export interface MetricsModel {
  /** Fully-loaded annual cost per person (salary + tax + benefits + software). */
  salaryUsd: Record<PersonFunc, number>;
  /** Founder pay before a Series A — well under market, and it buys runway. */
  founderSalaryEarlyUsd: number;
  /** Capacity multiplier by employment type; full-time is the 1.0 baseline. */
  employmentFactor: Record<'full-time' | 'part-time' | 'contract', number>;
  /** Weeks for a new hire to reach full productivity. */
  rampWeeks: number;
  /** Fraction of capacity a new hire has on day one. */
  rampFloor: number;
  /** IC capacity a manager loses per direct report. */
  managementCostPerReport: number;
  /** A manager never drops below this share of an IC's output. */
  managementFloor: number;
  /** Capacity a founder/exec contributes as an individual contributor. */
  leadershipIcFactor: number;
  /**
   * Work one head generates, in effective person-weeks, split across functions
   * by the stage's hiring mix. Below 1.0 because average capacity per head is
   * ~0.85–0.9 once ramp, part-time and management drag are counted — a company
   * staffed at its target mix should sit near load 1.0, not permanently over.
   */
  demandIntensity: number;
  /** New ARR one effective GTM person-week closes. */
  arrPerGtmWeekUsd: number;
  /** Revenue a team can carry per head before delivery capacity binds. */
  maxArrPerHeadUsd: number;
  /** Annual revenue churn. */
  annualChurn: number;
  /** ARR multiple a default-alive company converges toward covering burn. */
  defaultAliveTargetCoverage: number;
}

export const DEFAULT_MODEL: MetricsModel = {
  // Fully-loaded ≈ 1.3× base salary. Levels.fyi/Pave medians for US startups.
  salaryUsd: {
    engineering: 200_000,
    design: 175_000,
    gtm: 165_000,
    operations: 140_000,
    leadership: 250_000,
  },
  // Kruze's founder-compensation survey: ~$130K through seed, stepping up
  // only after an A. Underpaying yourself is a funding decision.
  founderSalaryEarlyUsd: 130_000,
  employmentFactor: { 'full-time': 1, 'part-time': 0.5, contract: 0.9 },
  // ~3 months to full productivity is the standard onboarding figure; a hire
  // is a cost immediately and capacity only later, which is why hiring your
  // way out of an overloaded quarter does not work.
  rampWeeks: 12,
  rampFloor: 0.25,
  // Managing is real work: ~6% of a week per report, so an eight-report
  // manager has roughly half a week of their own left.
  managementCostPerReport: 0.06,
  managementFloor: 0.35,
  leadershipIcFactor: 0.4,
  demandIntensity: 0.9,
  // A quota-carrying seller closes ~$600K ARR/year ≈ $11.5K per person-week.
  arrPerGtmWeekUsd: 11_500,
  // Revenue per employee for private startups clusters near $130K; the public
  // SaaS medians people quote are survivors at much larger scale.
  maxArrPerHeadUsd: 130_000,
  annualChurn: 0.15,
  defaultAliveTargetCoverage: 1.05,
};

// ---------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------

export interface FunctionCapacity {
  func: Func;
  headcount: number;
  /** Effective person-weeks available. */
  capacity: number;
  /** Person-weeks of work the company generates for this function. */
  demand: number;
  /** demand / capacity — above 1.0 means the team is underwater. */
  load: number;
}

export interface CapacitySnapshot {
  byFunc: FunctionCapacity[];
  totalCapacity: number;
  totalHeadcount: number;
  /** Heads that generate function work — everyone but leadership. */
  demandHeadcount: number;
  /** Capacity lost to management overhead and unfinished ramp-up. */
  overheadLoss: number;
}

function reportCounts(state: OrgState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const person of activePeople(state)) {
    if (person.managerId) counts.set(person.managerId, (counts.get(person.managerId) ?? 0) + 1);
  }
  return counts;
}

/**
 * One person's effective output this week. Someone hired yesterday, working
 * part-time, with six reports is not one unit of engineering — and the gap
 * between headcount and capacity is the entire point of the metric.
 */
export interface CapacityBreakdown {
  /** The product of the factors below — what the person is actually worth. */
  total: number;
  employment: number;
  ramp: number;
  management: number;
  ic: number;
  tenureWeeks: number;
  /** Weeks until fully ramped; 0 once there. */
  rampWeeksLeft: number;
}

/** The same computation as `personCapacity`, with its factors kept visible. */
export function personCapacityBreakdown(
  person: Person,
  at: IsoDate,
  reports: number,
  model: MetricsModel = DEFAULT_MODEL,
): CapacityBreakdown {
  const employment = model.employmentFactor[person.employment];
  const tenureWeeks = Math.max(0, weeksBetween(person.startedAt, at));
  const ramp = Math.min(
    1,
    model.rampFloor + (1 - model.rampFloor) * (tenureWeeks / model.rampWeeks),
  );
  const management = Math.max(model.managementFloor, 1 - model.managementCostPerReport * reports);
  const ic = person.func === 'leadership' ? model.leadershipIcFactor : 1;
  return {
    total: employment * ramp * management * ic,
    employment,
    ramp,
    management,
    ic,
    tenureWeeks,
    rampWeeksLeft: Math.max(0, Math.ceil(model.rampWeeks - tenureWeeks)),
  };
}

export function personCapacity(
  person: Person,
  at: IsoDate,
  reports: number,
  model: MetricsModel = DEFAULT_MODEL,
): number {
  return personCapacityBreakdown(person, at, reports, model).total;
}

/** How many people report to each active person — shared by several readings. */
export function reportCountsOf(state: OrgState): Map<string, number> {
  return reportCounts(state);
}

export function capacitySnapshot(
  state: OrgState,
  at: IsoDate,
  model: MetricsModel = DEFAULT_MODEL,
): CapacitySnapshot {
  const people = activePeople(state);
  const counts = reportCounts(state);
  const funcs: Func[] = ['engineering', 'design', 'gtm', 'operations'];

  const capacityByFunc = new Map<Func, number>(funcs.map((f) => [f, 0]));
  const headByFunc = new Map<Func, number>(funcs.map((f) => [f, 0]));
  let totalCapacity = 0;
  // Leadership generates no function work and belongs to no function, so it
  // sits outside the demand base — otherwise a founder is a third of a
  // three-person company's workload and every small team reads as drowning.
  let demandHeadcount = 0;

  for (const person of people) {
    const capacity = personCapacity(person, at, counts.get(person.id) ?? 0, model);
    totalCapacity += capacity;
    if (person.func === 'leadership') continue;
    demandHeadcount += 1;
    const func = person.func as Func;
    capacityByFunc.set(func, capacityByFunc.get(func)! + capacity);
    headByFunc.set(func, headByFunc.get(func)! + 1);
  }

  // Demand follows the stage's own hiring mix, so a pre-seed company is not
  // charged a Series-A company's sales workload.
  const mix = mixShare(state.latestRound);

  const byFunc = funcs.map((func) => {
    const capacity = capacityByFunc.get(func)!;
    const demand = mix[func] * demandHeadcount * model.demandIntensity;
    return {
      func,
      headcount: headByFunc.get(func)!,
      capacity,
      demand,
      // An empty team with work waiting is infinitely overloaded in principle;
      // reporting that as a number no UI can render helps nobody.
      load: capacity > 0 ? demand / capacity : demand > 0 ? Infinity : 0,
    };
  });

  return {
    byFunc,
    totalCapacity,
    totalHeadcount: people.length,
    demandHeadcount,
    overheadLoss: people.length - totalCapacity,
  };
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export interface FinanceState {
  capitalUsd: number;
  arrUsd: number;
  /** Gross weekly payroll cost. */
  burnWeeklyUsd: number;
  /** Burn minus revenue; negative means the company is profitable. */
  netBurnWeeklyUsd: number;
  /** Weeks of cash left at the current net burn; Infinity when profitable. */
  runwayWeeks: number;
}

export function emptyFinance(): FinanceState {
  return {
    capitalUsd: 0,
    arrUsd: 0,
    burnWeeklyUsd: 0,
    netBurnWeeklyUsd: 0,
    runwayWeeks: Infinity,
  };
}

/**
 * One person's fully-loaded annual cost. The only place a person is priced —
 * `weeklyBurn` and the UI both call it, so a card can never quote a salary the
 * burn model isn't charging.
 */
export function personAnnualCost(
  person: Person,
  state: OrgState,
  model: MetricsModel = DEFAULT_MODEL,
): number {
  const factor = person.employment === 'part-time' ? 0.5 : 1;
  if (person.isFounder) {
    // Founders take equity, not salary, until there is outside money to pay one
    // from, and stay well under market until an A.
    if (state.latestRound === null) return 0;
    const preSeriesA = state.latestRound === 'pre-seed' || state.latestRound === 'seed';
    return (preSeriesA ? model.founderSalaryEarlyUsd : model.salaryUsd.leadership) * factor;
  }
  return model.salaryUsd[person.func] * factor;
}

export function weeklyBurn(state: OrgState, model: MetricsModel = DEFAULT_MODEL): number {
  // Before the first round the company runs on the founder's own savings,
  // which this model does not track — so there is no payroll to charge and no
  // capital to charge it against.
  if (state.latestRound === null) return 0;
  let annual = 0;
  for (const person of activePeople(state)) {
    annual += personAnnualCost(person, state, model);
  }
  return annual / 52;
}

/** Money that arrives as an event rather than accruing weekly. */
export function applyFinanceEvent(finance: FinanceState, event: OrgEvent): FinanceState {
  if (event.type !== 'funding-raised') return finance;
  return { ...finance, capitalUsd: finance.capitalUsd + event.amountUsd };
}

/**
 * Advance the books one week. Pure: same inputs, same output, no clock.
 *
 * `state.defaultAlive` pulls ARR toward covering burn, so the milestone and the
 * balance sheet cannot disagree — a company the model calls self-sustaining
 * must actually look self-sustaining.
 */
export function stepFinance(
  prev: FinanceState,
  state: OrgState,
  at: IsoDate,
  model: MetricsModel = DEFAULT_MODEL,
  /** Pass the week's snapshot when the caller already has one. */
  precomputed?: CapacitySnapshot,
): FinanceState {
  const burnWeeklyUsd = weeklyBurn(state, model);
  const capacity = precomputed ?? capacitySnapshot(state, at, model);
  const gtm = capacity.byFunc.find((f) => f.func === 'gtm')!.capacity;

  const churnWeekly = model.annualChurn / 52;
  // A team can only carry so much revenue — delivery, support and account
  // management all draw on the same capacity. Without this ceiling a company
  // whose headcount has stopped growing compounds ARR indefinitely and every
  // survivor drifts into permanent profitability.
  const ceiling = capacity.totalHeadcount * model.maxArrPerHeadUsd;
  const headroom = ceiling > 0 ? Math.max(0, 1 - prev.arrUsd / ceiling) : 0;
  let arrUsd = prev.arrUsd + gtm * model.arrPerGtmWeekUsd * headroom - prev.arrUsd * churnWeekly;

  if (state.defaultAlive) {
    const target = burnWeeklyUsd * 52 * model.defaultAliveTargetCoverage;
    if (arrUsd < target) arrUsd += (target - arrUsd) * 0.05;
  }
  arrUsd = Math.max(0, arrUsd);

  const netBurnWeeklyUsd = burnWeeklyUsd - arrUsd / 52;
  const capitalUsd = prev.capitalUsd - netBurnWeeklyUsd;

  return {
    capitalUsd,
    arrUsd,
    burnWeeklyUsd,
    netBurnWeeklyUsd,
    runwayWeeks: netBurnWeeklyUsd <= 0 ? Infinity : Math.max(0, capitalUsd / netBurnWeeklyUsd),
  };
}

export const runwayMonths = (finance: FinanceState): number =>
  finance.runwayWeeks === Infinity ? Infinity : finance.runwayWeeks / 4.345;

export interface FinancePoint {
  at: IsoDate;
  finance: FinanceState;
  capacity: CapacitySnapshot;
}

/**
 * Replay the log week by week to get the books over the company's whole life.
 *
 * This is the UI's path to the same numbers the simulator ran on: it calls the
 * identical `applyFinanceEvent`/`stepFinance` pair in the same order, so the
 * panel cannot drift from the generator's decisions. Weekly resolution matches
 * the simulator's tick, which is what makes the two reproducible against each
 * other rather than merely similar.
 */
export function financeSeries(
  events: readonly OrgEvent[],
  until?: IsoDate,
  model: MetricsModel = DEFAULT_MODEL,
): FinancePoint[] {
  if (events.length === 0) return [];
  const state = emptyState();
  let finance = emptyFinance();
  const points: FinancePoint[] = [];

  // Walk to `until` even when it runs past the last event: a company still
  // burns during the quiet weeks, and the simulator resumes from this value.
  const end = until ?? events[events.length - 1].at;
  let cursor = events[0].at;
  let index = 0;

  while (cursor <= end) {
    while (index < events.length && events[index].at <= cursor) {
      const event = events[index++];
      applyEvent(state, event);
      finance = applyFinanceEvent(finance, event);
    }
    const capacity = capacitySnapshot(state, cursor, model);
    finance = stepFinance(finance, state, cursor, model, capacity);
    points.push({ at: cursor, finance, capacity });
    cursor = addDays(cursor, 7);
  }

  return points;
}

/** The books as of a date — the finance equivalent of `project(events, at)`. */
export function financeAt(
  events: readonly OrgEvent[],
  at: IsoDate,
  model: MetricsModel = DEFAULT_MODEL,
): FinancePoint | null {
  const series = financeSeries(events, at, model);
  return series[series.length - 1] ?? null;
}

// ---------------------------------------------------------------------------
// Hiring scenarios — "what could we do with 300 engineers?"
// ---------------------------------------------------------------------------

export interface HiringScenario {
  targetEngineers: number;
  /** Engineering capacity once the new hires are fully ramped. */
  capacity: number;
  /** Today's engineering capacity, for comparison. */
  currentCapacity: number;
  capacityPerEngineer: number;
  monthlyBurnUsd: number;
  runwayMonths: number;
  /** Engineering load at that headcount, holding company size constant. */
  load: number;
}

/**
 * Take the average output of the engineers you have, project it onto a bigger
 * team, and price it. The honest version of the question — capacity per head
 * is measured from the real roster rather than assumed to be 1.0, so the
 * answer already carries the ramp and management drag the current org shows.
 */
export function hiringScenario(
  state: OrgState,
  finance: FinanceState,
  at: IsoDate,
  targetEngineers: number,
  model: MetricsModel = DEFAULT_MODEL,
): HiringScenario {
  const snapshot = capacitySnapshot(state, at, model);
  const engineering = snapshot.byFunc.find((f) => f.func === 'engineering')!;
  const perEngineer = engineering.headcount > 0 ? engineering.capacity / engineering.headcount : 1;

  const added = Math.max(0, targetEngineers - engineering.headcount);
  const capacity = perEngineer * targetEngineers;
  const annualExtra = added * model.salaryUsd.engineering;
  const burnWeeklyUsd = finance.burnWeeklyUsd + annualExtra / 52;
  const netBurnWeeklyUsd = burnWeeklyUsd - finance.arrUsd / 52;

  // Demand rises with the bigger company too — hiring engineers does not only
  // add supply, it adds the coordination work that comes with more people.
  const demand =
    mixShare(state.latestRound).engineering * (snapshot.demandHeadcount + added) * model.demandIntensity;

  return {
    targetEngineers,
    capacity,
    currentCapacity: engineering.capacity,
    capacityPerEngineer: perEngineer,
    monthlyBurnUsd: (burnWeeklyUsd * 52) / 12,
    runwayMonths:
      netBurnWeeklyUsd <= 0 ? Infinity : Math.max(0, finance.capitalUsd / netBurnWeeklyUsd / 4.345),
    load: capacity > 0 ? demand / capacity : Infinity,
  };
}

// ---------------------------------------------------------------------------
// Counterfactuals — "what happens to this team if we lose this person?"
// ---------------------------------------------------------------------------

export interface DepartureImpact {
  personId: string;
  name: string;
  title: string;
  func: PersonFunc;
  /** Effective person-weeks the team loses. */
  capacityLost: number;
  /**
   * The departing person's own function. Null for leadership, who belong to no
   * function — a company-wide load would be a metric shown nowhere else, so
   * the view omits the row rather than inventing one.
   */
  loadBefore: number | null;
  loadAfter: number | null;
  headcountBefore: number | null;
  headcountAfter: number | null;
  reportsMoved: number;
  newManagerName: string | null;
  monthlySavingUsd: number;
  runwayMonthsBefore: number;
  runwayMonthsAfter: number;
}

/**
 * The org exactly as it would stand if this person left today, built with the
 * same cascade the simulator uses: reports move up to their manager before the
 * departure lands, so the counterfactual is a shape the generator could
 * actually have produced rather than an orphaned tree.
 */
export function withoutPerson(state: OrgState, at: IsoDate, personId: string): OrgState {
  const people: Record<string, Person> = { ...state.people };
  const leaving = people[personId];
  if (!leaving || leaving.endedAt !== null) return state;

  const inheritor = leaving.managerId ?? null;
  for (const person of Object.values(people)) {
    if (person.endedAt === null && person.managerId === personId) {
      people[person.id] = { ...person, managerId: inheritor };
    }
  }
  people[personId] = { ...leaving, endedAt: at, departureReason: 'resigned' };

  return { ...state, people };
}

export function departureImpact(
  state: OrgState,
  at: IsoDate,
  personId: string,
  finance: FinanceState,
  model: MetricsModel = DEFAULT_MODEL,
): DepartureImpact | null {
  const person = state.people[personId];
  if (!person || person.endedAt !== null) return null;

  const after = withoutPerson(state, at, personId);
  const beforeSnapshot = capacitySnapshot(state, at, model);
  const afterSnapshot = capacitySnapshot(after, at, model);

  const pick = (snapshot: CapacitySnapshot) =>
    person.func === 'leadership'
      ? null
      : snapshot.byFunc.find((f) => f.func === (person.func as Func))!;

  const burnBefore = weeklyBurn(state, model);
  const burnAfter = weeklyBurn(after, model);
  const netAfter = burnAfter - finance.arrUsd / 52;

  return {
    personId,
    name: person.name,
    title: person.title,
    func: person.func,
    capacityLost: beforeSnapshot.totalCapacity - afterSnapshot.totalCapacity,
    loadBefore: pick(beforeSnapshot)?.load ?? null,
    loadAfter: pick(afterSnapshot)?.load ?? null,
    headcountBefore: pick(beforeSnapshot)?.headcount ?? null,
    headcountAfter: pick(afterSnapshot)?.headcount ?? null,
    reportsMoved: activePeople(state).filter((p) => p.managerId === personId).length,
    newManagerName: person.managerId ? (state.people[person.managerId]?.name ?? null) : null,
    monthlySavingUsd: (burnBefore - burnAfter) * 4.345,
    runwayMonthsBefore: runwayMonths(finance),
    runwayMonthsAfter:
      netAfter <= 0 ? Infinity : Math.max(0, finance.capitalUsd / netAfter / 4.345),
  };
}

// ---------------------------------------------------------------------------
// Org summary stats
// ---------------------------------------------------------------------------

export interface OrgStats {
  largestTeam: { name: string; count: number } | null;
  widestSpan: { name: string; reports: number } | null;
  medianTenureWeeks: number;
  contingentShare: number;
}

export function orgStats(state: OrgState, at: IsoDate): OrgStats {
  const people = activePeople(state);
  if (people.length === 0) {
    return { largestTeam: null, widestSpan: null, medianTenureWeeks: 0, contingentShare: 0 };
  }

  const teamCounts = new Map<string, number>();
  for (const person of people) {
    if (person.teamId) teamCounts.set(person.teamId, (teamCounts.get(person.teamId) ?? 0) + 1);
  }
  let largestTeam: OrgStats['largestTeam'] = null;
  for (const [teamId, count] of teamCounts) {
    if (!largestTeam || count > largestTeam.count) {
      largestTeam = { name: state.teams[teamId]?.name ?? teamId, count };
    }
  }

  const counts = reportCounts(state);
  let widestSpan: OrgStats['widestSpan'] = null;
  for (const [personId, reports] of counts) {
    if (!widestSpan || reports > widestSpan.reports) {
      widestSpan = { name: state.people[personId]?.name ?? personId, reports };
    }
  }

  const tenures = people.map((p) => Math.max(0, weeksBetween(p.startedAt, at))).sort((a, b) => a - b);
  const contingent = people.filter((p) => p.employment !== 'full-time').length;

  return {
    largestTeam,
    widestSpan,
    medianTenureWeeks: tenures[Math.floor(tenures.length / 2)],
    contingentShare: contingent / people.length,
  };
}
