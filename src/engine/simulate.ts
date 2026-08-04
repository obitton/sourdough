import { addDays, daysBetween, weeksBetween } from './dates';
import {
  applyFinanceEvent,
  emptyFinance,
  financeAt,
  stepFinance,
  type FinanceState,
} from './metrics';
import { HIRE_MIX } from './mix';
import { ACQUIRERS, CITIES, FIRST_NAMES, LAST_NAMES, TEAM_NAMES } from './names';
import { activePeople, applyEvent, emptyState, headcount } from './project';
import { createRng, type Rng } from './rng';
import type {
  Employment,
  Func,
  IsoDate,
  OrgEvent,
  OrgState,
  Person,
  Round,
  ScriptedEvent,
} from './types';

export interface SimConfig {
  seed: string;
  /** Simulate up to (and including) this date, unless the company ends first. */
  until: IsoDate;
  /** Used when no prologue supplies a company-founded event. */
  founding?: { companyName: string; city: string; founderName: string; at: IsoDate };
  /** Scripted history replayed verbatim before the simulator takes over. */
  prologue?: ScriptedEvent[];
  /**
   * Earliest date the simulator may invent events. Without it, simulation
   * resumes right after the prologue — which would present fiction as the
   * recent past when the prologue is a real company's real history.
   */
  simulateFrom?: IsoDate;
  /** 0..1 — hiring pace and fundraising appetite. Default 0.5. */
  ambition?: number;
  /** 0..1 — attrition, layoff and failure risk. Default 0.5. */
  turbulence?: number;
  /**
   * Runway a company insists on keeping before it will open a new role.
   * This, not the stage target, is what usually caps team size: it makes the
   * size of the round decide the size of the team.
   */
  minRunwayWeeks?: number;
  /**
   * Counterfactual decisions injected into the run. They fire on the first
   * tick at or after their date and go through the same hire/depart paths as
   * organic events, so cascades, ids and team creation are handled for free —
   * and because the RNG stream is shared, every event before the first
   * intervention is identical to the unmodified run. The past is preserved;
   * only the future branches.
   */
  interventions?: Intervention[];
}

export type Intervention =
  | { at: IsoDate; kind: 'hire'; func: Func; count: number }
  | { at: IsoDate; kind: 'depart'; personId: string };

/**
 * Stage model calibrated against docs/research/org-realism.md (Carta/Kruze
 * 2024–25 medians): headcount at raise ≈ seed 5, A 17, B 50; rounds ~20–28
 * months apart; roughly half of seed companies never reach A. `target` is the
 * headcount a stage grows toward; the gate chances decide whether the next
 * raise ever comes.
 */
interface StageSpec {
  round: Round | null;
  target: number;
  minWeeksToNext: number;
  raiseChancePerWeek: number;
  gateDeathChance: number;
  gateAcquireChance: number;
}

const STAGES: StageSpec[] = [
  { round: null,       target: 2,   minWeeksToNext: 16, raiseChancePerWeek: 0.06,  gateDeathChance: 0.05, gateAcquireChance: 0 },
  { round: 'pre-seed', target: 6,   minWeeksToNext: 50, raiseChancePerWeek: 0.032, gateDeathChance: 0.25, gateAcquireChance: 0.02 },
  { round: 'seed',     target: 17,  minWeeksToNext: 70, raiseChancePerWeek: 0.024, gateDeathChance: 0.4,  gateAcquireChance: 0.05 },
  { round: 'series-a', target: 50,  minWeeksToNext: 75, raiseChancePerWeek: 0.026, gateDeathChance: 0.3,  gateAcquireChance: 0.06 },
  { round: 'series-b', target: 110, minWeeksToNext: 110, raiseChancePerWeek: 0.02, gateDeathChance: 0.2,  gateAcquireChance: 0.08 },
];

const ROUND_AMOUNTS: Record<Round, [number, number]> = {
  'pre-seed': [500_000, 1_500_000],
  seed: [2_000_000, 5_000_000],
  'series-a': [8_000_000, 18_000_000],
  'series-b': [25_000_000, 60_000_000],
};

const FUNC_LEADER_TITLES: Record<Func, string[]> = {
  engineering: ['CTO', 'VP Engineering', 'Engineering Manager'],
  design: ['Head of Design', 'Design Lead'],
  gtm: ['VP Sales', 'Head of Growth', 'GTM Lead'],
  operations: ['CFO', 'Head of Operations', 'Ops Lead'],
};

const LEADER_TITLES = new Set(Object.values(FUNC_LEADER_TITLES).flat());

/** Title appointed from within when a leaderless function reaches ~7 people. */
const APPOINTED_LEAD_TITLE: Record<Func, string> = {
  engineering: 'Engineering Manager',
  design: 'Design Lead',
  gtm: 'GTM Lead',
  operations: 'Ops Lead',
};

const NEXT_TITLE: Record<string, string> = {
  Engineer: 'Senior Engineer',
  'Senior Engineer': 'Staff Engineer',
  'Founding Engineer': 'Staff Engineer',
  Designer: 'Senior Designer',
  'Founding Designer': 'Head of Design',
  'Growth Strategist': 'Head of Growth',
  SDR: 'Account Executive',
  'Account Executive': 'Senior Account Executive',
  'Operations Manager': 'Head of Operations',
  Recruiter: 'Senior Recruiter',
};

interface SimCtx {
  rng: Rng;
  state: OrgState;
  events: OrgEvent[];
  seq: number;
  personCounter: number;
  teamCounter: number;
  usedNames: Set<string>;
  founderId: string;
  stageIdx: number;
  weeksInStage: number;
  hiringFreezeWeeks: number;
  /** Weeks left in the elevated-attrition window a layoff leaves behind. */
  postLayoffWeeks: number;
  downturnsThisStage: number;
  /** The books, advanced every tick by the same reducer the UI folds with. */
  finance: FinanceState;
  hasRelocated: boolean;
  windDownAt: IsoDate | null;
  lastRaiseAmount: number;
}

export function simulate(config: SimConfig): OrgEvent[] {
  const rng = createRng(config.seed);
  const ambition = config.ambition ?? 0.5;
  const turbulence = config.turbulence ?? 0.5;
  const ambitionMul = 0.75 + ambition * 0.5;
  // 18 months — the standard rule of thumb for how much runway to hold. A req
  // that would push the company under it is one nobody approves. Swept against
  // the calibration bands: below ~65 weeks companies die too fast (median
  // shutdown under 20 months), above ~91 they never staff up (median headcount
  // at the seed round falls to 3, under Carta's 4–6).
  const minRunwayWeeks = config.minRunwayWeeks ?? 78;

  const ctx: SimCtx = {
    rng,
    state: emptyState(),
    events: [],
    seq: 1,
    personCounter: 0,
    teamCounter: 0,
    usedNames: new Set(),
    founderId: '',
    stageIdx: 0,
    weeksInStage: 0,
    hiringFreezeWeeks: 0,
    postLayoffWeeks: 0,
    downturnsThisStage: 0,
    finance: emptyFinance(),
    hasRelocated: false,
    windDownAt: null,
    lastRaiseAmount: 0,
  };

  let cursor: IsoDate;
  let lastRaiseAt: IsoDate;

  if (config.prologue && config.prologue.length > 0) {
    for (const scripted of config.prologue) emit(ctx, scripted);
    ctx.personCounter = maxIdSuffix(Object.keys(ctx.state.people), 'p');
    ctx.teamCounter = maxIdSuffix(Object.keys(ctx.state.teams), 't');
    ctx.hasRelocated = config.prologue.some((e) => e.type === 'office-moved');
    cursor = config.prologue[config.prologue.length - 1].at;
    const lastRaise = [...config.prologue].reverse().find((e) => e.type === 'funding-raised');
    lastRaiseAt = lastRaise ? lastRaise.at : ctx.state.foundedAt!;
    if (lastRaise?.type === 'funding-raised') ctx.lastRaiseAmount = lastRaise.amountUsd;
  } else {
    if (!config.founding) throw new Error('SimConfig needs either founding details or a prologue');
    const { companyName, city, founderName, at } = config.founding;
    emit(ctx, {
      type: 'company-founded',
      at,
      companyName,
      city,
      founderId: 'p1',
      founderName,
    });
    ctx.personCounter = 1;
    cursor = at;
    lastRaiseAt = at;
  }

  if (config.simulateFrom && config.simulateFrom > cursor) {
    // Stay on the weekly grid financeSeries folds on — it walks from the
    // founding date — so the generator's weeks and the UI's weeks are the same
    // weeks and the two sets of books cannot drift apart.
    const gridOrigin = ctx.state.foundedAt ?? config.simulateFrom;
    const offset = daysBetween(gridOrigin, config.simulateFrom);
    cursor = addDays(gridOrigin, Math.ceil(offset / 7) * 7);
  }

  const founder = Object.values(ctx.state.people).find((p) => p.isFounder);
  if (!founder) throw new Error('prologue must include a company-founded event');
  ctx.founderId = founder.id;
  for (const person of Object.values(ctx.state.people)) ctx.usedNames.add(person.name);
  ctx.stageIdx = STAGES.findIndex((s) => s.round === ctx.state.latestRound);
  if (ctx.stageIdx === -1) ctx.stageIdx = 0;
  ctx.weeksInStage = Math.max(0, weeksBetween(lastRaiseAt, cursor));
  // A scripted prologue still spent money. Replay the books across it through
  // the same fold the UI uses, so simulation resumes on a real balance sheet
  // rather than on the full round as if no time had passed.
  if (ctx.events.length > 0) {
    ctx.finance = financeAt(ctx.events, cursor)?.finance ?? emptyFinance();
  }

  const interventions = [...(config.interventions ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  let nextIntervention = 0;

  let safety = 60 * 52;
  while (ctx.state.status === 'operating' && safety-- > 0) {
    cursor = addDays(cursor, 7);
    if (cursor > config.until) break;
    ctx.weeksInStage += 1;
    if (ctx.hiringFreezeWeeks > 0) ctx.hiringFreezeWeeks -= 1;
    if (ctx.postLayoffWeeks > 0) ctx.postLayoffWeeks -= 1;

    // Deliberate decisions land before the organic week runs, and bypass the
    // hiring freeze and runway gate — someone chose this.
    while (nextIntervention < interventions.length && interventions[nextIntervention].at <= cursor) {
      applyIntervention(ctx, interventions[nextIntervention++], cursor);
    }

    runWeek(ctx, cursor, ambitionMul, turbulence, minRunwayWeeks);

    // The books close after the week's events, which is exactly how
    // financeSeries folds the log: apply everything dated this week, then
    // advance one week of burn. Same order, same numbers — decisions made
    // during the week therefore read last week's balance, as they would in a
    // real company.
    ctx.finance = stepFinance(ctx.finance, ctx.state, cursor);
  }

  return ctx.events;
}

function applyIntervention(ctx: SimCtx, plan: Intervention, at: IsoDate): void {
  if (ctx.state.status !== 'operating') return;

  if (plan.kind === 'hire') {
    for (let i = 0; i < plan.count; i++) hireRegular(ctx, at, plan.func);
    return;
  }

  const person = ctx.state.people[plan.personId];
  // The founder never leaves, and someone already gone cannot leave twice.
  if (!person || person.endedAt !== null || person.isFounder) return;
  departPerson(ctx, at, person, 'laid-off');
}

/** One simulated week. Early returns here are why the caller closes the books. */
function runWeek(
  ctx: SimCtx,
  at: IsoDate,
  ambitionMul: number,
  turbulence: number,
  minRunwayWeeks: number,
): void {
  if (ctx.windDownAt !== null) {
    if (at >= ctx.windDownAt) executeShutdown(ctx, at);
    return;
  }

  stepFundraising(ctx, at, ambitionMul, turbulence);
  if (ctx.state.status !== 'operating' || ctx.windDownAt !== null) return;
  stepDownturn(ctx, at, turbulence);
  if (ctx.state.status !== 'operating' || ctx.windDownAt !== null) return;
  stepExecHires(ctx, at);
  stepAppointedLeads(ctx, at);
  stepHiring(ctx, at, ambitionMul, minRunwayWeeks);
  stepAttrition(ctx, at, turbulence);
  stepPromotions(ctx, at);
  stepConversions(ctx, at);
  stepRelocation(ctx, at);
}

// ---------------------------------------------------------------------------
// Weekly steps
// ---------------------------------------------------------------------------

/**
 * Whether the company still depends on someone else's money. A business
 * spending less than it earns cannot run out of cash, so no failed raise and
 * no restructuring can end it — only an acquisition can.
 */
function onRunwayClock(ctx: SimCtx): boolean {
  return !ctx.state.defaultAlive && ctx.finance.netBurnWeeklyUsd > 0;
}

function stepFundraising(ctx: SimCtx, at: IsoDate, ambitionMul: number, turbulence: number): void {
  const stage = STAGES[ctx.stageIdx];
  const lastStage = ctx.stageIdx === STAGES.length - 1;

  // Running out of money is the actual failure mode, so the balance sheet
  // decides rather than a timer: a company that hires hard burns its round
  // faster and dies sooner, which is the whole reason burn is modeled. This
  // is checked before every other branch because insolvency ends a company at
  // any stage, including past the last modeled round.
  // Before the first round there is no tracked capital — a bootstrapped
  // company is spending the founder's own savings, which the model does not
  // hold — so that one case keeps a time fuse.
  if (!ctx.state.defaultAlive) {
    const brokeAfterRaise = ctx.state.latestRound !== null && ctx.finance.capitalUsd <= 0;
    const bootstrapRanLong =
      ctx.state.latestRound === null && ctx.weeksInStage > stage.minWeeksToNext + 110;
    if (brokeAfterRaise || bootstrapRanLong) {
      beginWindDown(ctx, at);
      return;
    }
  }

  // Off the fundraising treadmill — past the last modeled round, or running on
  // its own revenue — but still acquirable.
  if (lastStage || ctx.state.defaultAlive) {
    if (ctx.rng.chance(0.0008)) acquire(ctx, at);
    if (lastStage || ctx.state.status !== 'operating') return;
  }

  // Not every company either raises or dies. Across large outcome datasets the
  // split is roughly equal thirds — acquired, shut down, and still quietly
  // operating (org-realism.md §6). A company that finds its own revenue stops
  // running on someone else's clock; without this the simulator can only
  // produce rocket ships and corpses.
  //
  // Rate is derived, not tuned: a stalled company is eligible for the ~110
  // weeks between its raise window opening and the runway running out, and we
  // want ~1 in 3 of them to make it — 1-(1-p)^110 = 0.33 → p ≈ 0.004.
  // Turning the corner requires revenue to turn from. A company with no sales
  // engine does not become default alive by luck, so eligibility needs the
  // books to be within reach of covering burn first.
  const coverage =
    ctx.finance.burnWeeklyUsd > 0 ? ctx.finance.arrUsd / 52 / ctx.finance.burnWeeklyUsd : 0;
  if (
    !ctx.state.defaultAlive &&
    coverage >= 0.4 &&
    ctx.weeksInStage > stage.minWeeksToNext &&
    ctx.rng.chance(0.004)
  ) {
    emit(ctx, { type: 'default-alive', at, arrUsd: Math.round(ctx.finance.arrUsd) });
  }

  if (ctx.weeksInStage < stage.minWeeksToNext) return;
  if (!ctx.rng.chance(stage.raiseChancePerWeek * ambitionMul)) return;

  // The gate: this raise attempt resolves the company's fate for the stage.
  const death = stage.gateDeathChance * (0.5 + turbulence);
  const roll = ctx.rng.next();
  if (roll < death) {
    // A company that does not need the money does not die for missing it, and
    // is not an acqui-hire either: failing to raise with years of cash left
    // just means no round this time. Only a company actually out of options
    // reaches the fork, where ~30% land softly as an acqui-hire rather than
    // shutting down (org-realism.md).
    if (onRunwayClock(ctx)) {
      if (ctx.rng.chance(0.3)) acquire(ctx, at);
      else beginWindDown(ctx, at);
    }
  } else if (roll < death + stage.gateAcquireChance) {
    acquire(ctx, at);
  } else {
    const next = STAGES[ctx.stageIdx + 1];
    const [min, max] = ROUND_AMOUNTS[next.round!];
    const amountUsd = ctx.rng.int(min / 100_000, max / 100_000) * 100_000;
    emit(ctx, { type: 'funding-raised', at, round: next.round!, amountUsd });
    ctx.lastRaiseAmount = amountUsd;
    ctx.stageIdx += 1;
    ctx.weeksInStage = 0;
    ctx.downturnsThisStage = 0;
    ctx.hiringFreezeWeeks = 0;
  }
}

function stepDownturn(ctx: SimCtx, at: IsoDate, turbulence: number): void {
  const stage = STAGES[ctx.stageIdx];
  if (ctx.stageIdx === 0 || ctx.hiringFreezeWeeks > 0) return;
  if (ctx.weeksInStage <= stage.minWeeksToNext + 26) return;
  if (!ctx.rng.chance(0.015 * (0.5 + turbulence))) return;

  // Below ~11 heads a company sheds people through ordinary attrition; a
  // formal one-person "layoff round" reads absurd on the timeline.
  const nonFounders = activePeople(ctx.state).filter((p) => !p.isFounder);
  if (nonFounders.length < 10) return;

  // Median real-world cut is ~15% (range 10–30).
  const pct = ctx.rng.weighted([[12, 3], [15, 4], [20, 2], [25, 1], [30, 1]] as const);
  const count = Math.max(1, Math.round((nonFounders.length * pct) / 100));
  if (count < 2) return;
  const victims = sampleWithoutReplacement(
    ctx.rng,
    nonFounders,
    (p) => (LEADER_TITLES.has(p.title) ? 0.3 : 1) / (1 + weeksBetween(p.startedAt, at) / 52),
    count,
  );

  emit(ctx, { type: 'layoff-round', at, count: victims.length, pct });
  for (const victim of orderLeavesFirst(ctx.state, victims)) {
    departPerson(ctx, at, victim, 'laid-off');
  }

  ctx.hiringFreezeWeeks = 20;
  // Morale and trust take the hit too: voluntary exits stay elevated for about
  // two quarters after a cut (org-realism.md §5).
  ctx.postLayoffWeeks = 26;
  ctx.downturnsThisStage += 1;
  // A second round is a bad sign, not a death certificate: repeat cuts are the
  // norm among struggling companies (~70% land within a year of the first, and
  // roughly half of all tech layoffs come from repeat-cutters), and ~5% of them
  // reach a third. Compounding odds, rather than a hard rule, keeps survivors
  // in the population — a company that cuts twice and lives is a real shape.
  // A company that earns more than it spends restructures rather than folds —
  // cutting twice is a survival move when it works, so solvency gets the last
  // word here just as it does on the fundraising path.
  const windDownChance = ctx.downturnsThisStage >= 3 ? 0.8 : ctx.downturnsThisStage >= 2 ? 0.45 : 0;
  if (windDownChance > 0 && ctx.rng.chance(windDownChance) && onRunwayClock(ctx)) {
    beginWindDown(ctx, at);
  }
}

function stepExecHires(ctx: SimCtx, at: IsoDate): void {
  // Nobody hires a CFO the same month they lay off 15% of the company.
  if (ctx.hiringFreezeWeeks > 0) return;
  const { rng, state } = ctx;
  const stageIdx = ctx.stageIdx;

  if (stageIdx >= 2 && countFunc(state, 'engineering') >= 3 && !titleActive(state, 'CTO') && rng.chance(0.02)) {
    hireExec(ctx, at, 'CTO', 'engineering', ctx.founderId);
  }
  if (stageIdx >= 3 && countFunc(state, 'gtm') >= 4 && !titleActive(state, 'VP Sales') && rng.chance(0.02)) {
    hireExec(ctx, at, 'VP Sales', 'gtm', ctx.founderId);
  }
  if (stageIdx >= 4 && countFunc(state, 'engineering') >= 15 && !titleActive(state, 'VP Engineering') && rng.chance(0.015)) {
    const cto = findActiveByTitle(state, 'CTO');
    hireExec(ctx, at, 'VP Engineering', 'engineering', cto?.id ?? ctx.founderId);
  }
  if (stageIdx >= 4 && !titleActive(state, 'CFO') && rng.chance(0.01)) {
    hireExec(ctx, at, 'CFO', 'operations', ctx.founderId);
  }
}

function stepAppointedLeads(ctx: SimCtx, at: IsoDate): void {
  for (const func of Object.keys(APPOINTED_LEAD_TITLE) as Func[]) {
    const leader = funcLeader(ctx.state, func);

    if (!leader) {
      // Span of control: ~7 people without a leader means someone steps up.
      if (countFunc(ctx.state, func) < 7) continue;
      const candidates = activePeople(ctx.state)
        .filter((p) => p.func === func)
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      const lead = candidates[0];
      if (!lead) continue;
      emit(ctx, {
        type: 'person-promoted',
        at,
        personId: lead.id,
        fromTitle: lead.title,
        toTitle: APPOINTED_LEAD_TITLE[func],
      });
      if (lead.managerId !== ctx.founderId) {
        emit(ctx, { type: 'manager-changed', at, personId: lead.id, managerId: ctx.founderId });
      }
      reassignFuncReports(ctx, at, func, lead.id);
      continue;
    }

    // When a leader departs, their subtree cascades to the founder; re-attach
    // those people to the function's current leader so nobody floats forever.
    for (const person of activePeople(ctx.state)) {
      if (
        person.func === func &&
        person.managerId === ctx.founderId &&
        person.id !== leader.id &&
        !LEADER_TITLES.has(person.title)
      ) {
        emit(ctx, { type: 'manager-changed', at, personId: person.id, managerId: leader.id });
      }
    }

    // Span of control, part two: new hires land under the function leader, so
    // without delegation a CTO ends up personally managing 50 engineers. An
    // overloaded leader first tops up existing sub-leads with spare capacity;
    // a new sub-lead is only promoted when everyone is full — otherwise the
    // org sprouts a dozen co-equal leads instead of a management layer.
    const spanOf = (id: string) =>
      activePeople(ctx.state).filter((p) => p.managerId === id).length;
    const directsOf = () =>
      activePeople(ctx.state).filter((p) => p.managerId === leader.id && p.func === func);

    if (directsOf().length <= 9) continue;

    const overflow = directsOf()
      .filter((p) => !LEADER_TITLES.has(p.title))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id));
    let excess = directsOf().length - 8;

    for (const mover of overflow) {
      if (excess <= 0) break;
      const target = activePeople(ctx.state)
        .filter(
          (p) =>
            p.func === func &&
            p.id !== leader.id &&
            p.title === APPOINTED_LEAD_TITLE[func] &&
            spanOf(p.id) < 8,
        )
        .sort((a, b) => spanOf(a.id) - spanOf(b.id) || a.id.localeCompare(b.id))[0];
      if (!target) break;
      emit(ctx, { type: 'manager-changed', at, personId: mover.id, managerId: target.id });
      excess -= 1;
    }

    if (excess > 0) {
      const remaining = directsOf()
        .filter((p) => !LEADER_TITLES.has(p.title))
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
      const lead = remaining[0];
      if (!lead) continue;
      emit(ctx, {
        type: 'person-promoted',
        at,
        personId: lead.id,
        fromTitle: lead.title,
        toTitle: APPOINTED_LEAD_TITLE[func],
      });
      for (const mover of remaining.slice(1, 1 + Math.floor(remaining.length / 2))) {
        emit(ctx, { type: 'manager-changed', at, personId: mover.id, managerId: lead.id });
      }
    }
  }
}

function stepHiring(ctx: SimCtx, at: IsoDate, ambitionMul: number, minRunwayWeeks: number): void {
  if (ctx.hiringFreezeWeeks > 0) return;
  // Nobody signs off on a req that leaves the company short of cash. Once the
  // plan is funded this is the binding constraint, not the stage target — and
  // it is why hiring slows on its own as a round is spent down.
  if (ctx.state.latestRound !== null && !ctx.state.defaultAlive) {
    if (ctx.finance.runwayWeeks < minRunwayWeeks) return;
  }
  const stage = STAGES[ctx.stageIdx];
  const gap = stage.target * ambitionMul - headcount(ctx.state);
  if (gap <= 0) return;

  if (ctx.rng.chance(Math.min(0.95, gap * 0.055))) hireRegular(ctx, at);
  if (gap > 10 && ctx.rng.chance(Math.min(0.6, gap * 0.03))) hireRegular(ctx, at);
}

function stepAttrition(ctx: SimCtx, at: IsoDate, turbulence: number): void {
  // Base hazard ≈ 18–19% annualized at default turbulence, shaped by tenure —
  // the spike after week 52 is the equity-cliff exit wave the research found.
  // Survivors of a layoff update their résumés: +50% for two quarters.
  const base = 0.004 * (0.6 + 0.8 * turbulence) * (ctx.postLayoffWeeks > 0 ? 1.5 : 1);
  for (const person of activePeople(ctx.state)) {
    if (person.isFounder) continue;
    const tenure = weeksBetween(person.startedAt, at);
    const factor = tenure < 26 ? 0.4 : tenure < 52 ? 0.8 : tenure < 78 ? 1.8 : tenure < 156 ? 1.1 : 0.7;
    if (!ctx.rng.chance(base * factor)) continue;
    const reason = ctx.rng.chance(0.8) ? 'resigned' : 'let-go';
    departPerson(ctx, at, person, reason);
  }
}

function stepPromotions(ctx: SimCtx, at: IsoDate): void {
  for (const person of activePeople(ctx.state)) {
    if (person.isFounder) continue;
    const nextTitle = NEXT_TITLE[person.title];
    if (!nextTitle) continue;
    const tenure = weeksBetween(person.startedAt, at);
    const sincePromo = person.lastPromotedAt ? weeksBetween(person.lastPromotedAt, at) : Infinity;
    // Median time to promotion is ~24–30 months.
    if (tenure < 100 || sincePromo < 90) continue;
    if (LEADER_TITLES.has(nextTitle)) {
      if (person.func === 'leadership') continue;
      if (funcLeader(ctx.state, person.func as Func)) continue;
      if (titleActive(ctx.state, nextTitle)) continue;
    }
    if (!ctx.rng.chance(0.008)) continue;
    emit(ctx, { type: 'person-promoted', at, personId: person.id, fromTitle: person.title, toTitle: nextTitle });
    if (LEADER_TITLES.has(nextTitle) && person.func !== 'leadership') {
      if (person.managerId !== ctx.founderId) {
        emit(ctx, { type: 'manager-changed', at, personId: person.id, managerId: ctx.founderId });
      }
      reassignFuncReports(ctx, at, person.func as Func, person.id);
    }
  }
}

function stepConversions(ctx: SimCtx, at: IsoDate): void {
  for (const person of activePeople(ctx.state)) {
    if (person.employment === 'full-time') continue;
    if (weeksBetween(person.startedAt, at) < 16) continue;
    if (!ctx.rng.chance(0.015)) continue;
    emit(ctx, { type: 'employment-changed', at, personId: person.id, from: person.employment, to: 'full-time' });
  }
}

function stepRelocation(ctx: SimCtx, at: IsoDate): void {
  if (ctx.hasRelocated || ctx.stageIdx === 0) return;
  const count = headcount(ctx.state);
  if (count < 3 || count > 40 || !ctx.rng.chance(0.001)) return;
  const from = ctx.state.city!;
  const to = ctx.rng.pick(CITIES.filter((c) => c !== from));
  emit(ctx, { type: 'office-moved', at, fromCity: from, toCity: to });
  ctx.hasRelocated = true;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function emit(ctx: SimCtx, scripted: ScriptedEvent): void {
  const event: OrgEvent = { ...scripted, seq: ctx.seq++ };
  applyEvent(ctx.state, event);
  ctx.finance = applyFinanceEvent(ctx.finance, event);
  ctx.events.push(event);
}

/** Resume id counters after a prologue without assuming dense p1..pN ids. */
function maxIdSuffix(ids: string[], prefix: string): number {
  let max = 0;
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max;
}

function hireRegular(ctx: SimCtx, at: IsoDate, forcedFunc?: Func): void {
  const { rng, state } = ctx;
  const func = forcedFunc ?? rng.weighted(HIRE_MIX[ctx.stageIdx]);
  const title = pickTitle(ctx, func);
  const employment = pickEmployment(ctx, func);
  const teamId = ensureTeam(ctx, at, func);
  const manager = funcLeader(state, func);
  hirePerson(ctx, at, { title, func, teamId, managerId: manager?.id ?? ctx.founderId, employment });
}

function hireExec(ctx: SimCtx, at: IsoDate, title: string, func: Func, managerId: string): void {
  const teamId = funcTeam(ctx.state, func)?.id ?? null;
  const exec = hirePerson(ctx, at, { title, func, teamId, managerId, employment: 'full-time' });
  reassignFuncReports(ctx, at, func, exec.id);
  // An exec hired under an existing leader of the same function (VP Eng under
  // a CTO) takes over that leader's ICs — otherwise the new VP runs nobody.
  const boss = ctx.state.people[managerId];
  if (boss && !boss.isFounder && boss.func === func) {
    for (const person of activePeople(ctx.state)) {
      if (person.managerId === boss.id && person.id !== exec.id && !LEADER_TITLES.has(person.title)) {
        emit(ctx, { type: 'manager-changed', at, personId: person.id, managerId: exec.id });
      }
    }
  }
}

function hirePerson(
  ctx: SimCtx,
  at: IsoDate,
  details: { title: string; func: Func; teamId: string | null; managerId: string; employment: Employment },
): Person {
  const personId = `p${++ctx.personCounter}`;
  emit(ctx, {
    type: 'person-hired',
    at,
    personId,
    name: generateName(ctx),
    ...details,
  });
  return ctx.state.people[personId];
}

/**
 * When a function gains a new leader, only the people parked directly under
 * the founder (plus a previously appointed lead) move under them — reports of
 * existing managers keep their manager, so hiring a CTO doesn't flatten an
 * Engineering Manager's team.
 */
function reassignFuncReports(ctx: SimCtx, at: IsoDate, func: Func, newLeadId: string): void {
  for (const person of activePeople(ctx.state)) {
    if (person.id === newLeadId || person.func !== func) continue;
    if (person.managerId === newLeadId) continue;
    const parkedWithFounder = person.managerId === ctx.founderId;
    const isAppointedLead = person.title === APPOINTED_LEAD_TITLE[func];
    if (!parkedWithFounder && !isAppointedLead) continue;
    if (LEADER_TITLES.has(person.title) && !isAppointedLead) continue;
    emit(ctx, { type: 'manager-changed', at, personId: person.id, managerId: newLeadId });
  }
}

function departPerson(ctx: SimCtx, at: IsoDate, person: Person, reason: 'resigned' | 'laid-off' | 'let-go'): void {
  // Reassign reports before the departure so the org chart is never orphaned,
  // even mid-log — every prefix of the event stream is a valid organization.
  const fallback = person.managerId ?? ctx.founderId;
  for (const report of activePeople(ctx.state)) {
    if (report.managerId === person.id) {
      emit(ctx, { type: 'manager-changed', at, personId: report.id, managerId: fallback });
    }
  }
  emit(ctx, { type: 'person-departed', at, personId: person.id, reason });
}

function beginWindDown(ctx: SimCtx, at: IsoDate): void {
  ctx.windDownAt = addDays(at, ctx.rng.int(6, 14) * 7);
  ctx.hiringFreezeWeeks = 999;
}

function executeShutdown(ctx: SimCtx, at: IsoDate): void {
  const remaining = activePeople(ctx.state).filter((p) => !p.isFounder);
  if (remaining.length > 0) {
    emit(ctx, { type: 'layoff-round', at, count: remaining.length, pct: 100 });
    for (const person of orderLeavesFirst(ctx.state, remaining)) {
      departPerson(ctx, at, person, 'laid-off');
    }
  }
  emit(ctx, {
    type: 'company-shutdown',
    at,
    reason: ctx.rng.pick([
      'ran out of runway',
      'failed to raise the next round',
      'the market never materialized',
    ]),
  });
}

function acquire(ctx: SimCtx, at: IsoDate): void {
  const base = ctx.lastRaiseAmount > 0 ? ctx.lastRaiseAmount * ctx.rng.int(2, 6) : ctx.rng.int(2, 15) * 1_000_000;
  emit(ctx, {
    type: 'company-acquired',
    at,
    acquirer: ctx.rng.pick(ACQUIRERS),
    priceUsd: Math.round(base / 1_000_000) * 1_000_000,
  });
}

// ---------------------------------------------------------------------------
// Hiring details
// ---------------------------------------------------------------------------

function pickTitle(ctx: SimCtx, func: Func): string {
  const { rng, state } = ctx;
  const everInFunc = Object.values(state.people).some((p) => p.func === func);

  if (func === 'design' && !everInFunc) return 'Founding Designer';
  if (func === 'engineering' && !everInFunc && ctx.stageIdx <= 1) return 'Founding Engineer';

  const byFunc: Record<Func, ReadonlyArray<readonly [string, number]>> = {
    engineering: [['Engineer', 6], ['Senior Engineer', 3], ['Staff Engineer', ctx.stageIdx >= 3 ? 1 : 0]],
    design: [['Designer', 3], ['Senior Designer', 1]],
    gtm: [
      ['Growth Strategist', 2],
      ['Account Executive', 3],
      ['SDR', ctx.stageIdx >= 3 ? 2 : 0],
      ['Marketing Manager', 1],
    ],
    operations: [
      ['Operations Manager', 2],
      ['Recruiter', headcount(state) >= 25 ? 2 : 0],
      ['People Ops Manager', 1],
      ['Executive Assistant', ctx.stageIdx >= 3 ? 1 : 0],
    ],
  };

  return rng.weighted(byFunc[func].filter(([, weight]) => weight > 0));
}

function pickEmployment(ctx: SimCtx, func: Func): Employment {
  // Research: ~20% of the early-stage workforce is contract/part-time —
  // concentrated in design and GTM (see: Griffin, part-time growth) but
  // present in every function.
  const early = ctx.stageIdx <= 2;
  const soft = func === 'design' || func === 'gtm';
  if (early && soft && ctx.rng.chance(0.25)) return 'part-time';
  if (early && soft && ctx.rng.chance(0.2)) return 'contract';
  if (early && !soft && ctx.rng.chance(0.15)) return 'contract';
  if (!early && ctx.rng.chance(0.08)) return 'contract';
  return 'full-time';
}

function ensureTeam(ctx: SimCtx, at: IsoDate, func: Func): string | null {
  const existing = funcTeam(ctx.state, func);
  if (existing) return existing.id;
  // A team forms once a function has its second person; earlier hires float.
  const members = activePeople(ctx.state).filter((p) => p.func === func);
  if (members.length + 1 < 2) return null;
  const teamId = `t${++ctx.teamCounter}`;
  emit(ctx, { type: 'team-created', at, teamId, teamName: TEAM_NAMES[func], func });
  for (const member of members) {
    if (member.teamId === null) {
      emit(ctx, { type: 'team-changed', at, personId: member.id, fromTeamId: null, toTeamId: teamId });
    }
  }
  return teamId;
}

function generateName(ctx: SimCtx): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const name = `${ctx.rng.pick(FIRST_NAMES)} ${ctx.rng.pick(LAST_NAMES)}`;
    if (!ctx.usedNames.has(name)) {
      ctx.usedNames.add(name);
      return name;
    }
  }
  const fallback = `Person ${ctx.personCounter}`;
  ctx.usedNames.add(fallback);
  return fallback;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

function countFunc(state: OrgState, func: Func): number {
  return activePeople(state).filter((p) => p.func === func).length;
}

function titleActive(state: OrgState, title: string): boolean {
  return activePeople(state).some((p) => p.title === title);
}

function findActiveByTitle(state: OrgState, title: string): Person | undefined {
  return activePeople(state).find((p) => p.title === title);
}

function funcLeader(state: OrgState, func: Func): Person | undefined {
  const titles = FUNC_LEADER_TITLES[func];
  return activePeople(state)
    .filter((p) => p.func === func && titles.includes(p.title))
    .sort((a, b) => titles.indexOf(a.title) - titles.indexOf(b.title))[0];
}

function funcTeam(state: OrgState, func: Func) {
  return Object.values(state.teams).find((t) => t.func === func) ?? null;
}

/** People with no active reports first, so cascades stay tidy during layoffs. */
function orderLeavesFirst(state: OrgState, people: Person[]): Person[] {
  const reportCounts = new Map<string, number>();
  for (const person of activePeople(state)) {
    if (person.managerId) {
      reportCounts.set(person.managerId, (reportCounts.get(person.managerId) ?? 0) + 1);
    }
  }
  return [...people].sort((a, b) => (reportCounts.get(a.id) ?? 0) - (reportCounts.get(b.id) ?? 0));
}

function sampleWithoutReplacement<T>(
  rng: Rng,
  items: readonly T[],
  weightFn: (item: T) => number,
  count: number,
): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < count && pool.length > 0) {
    const entries = pool.map((item, index) => [index, weightFn(item)] as const);
    const index = rng.weighted(entries);
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}
