import { addDays, weeksBetween } from './dates';
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
  /** 0..1 — hiring pace and fundraising appetite. Default 0.5. */
  ambition?: number;
  /** 0..1 — attrition, layoff and failure risk. Default 0.5. */
  turbulence?: number;
}

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

/** Hiring mix by stage index — engineering-heavy early, GTM grows with scale. */
const HIRE_MIX: ReadonlyArray<ReadonlyArray<readonly [Func, number]>> = [
  [['engineering', 70], ['design', 15], ['gtm', 5],  ['operations', 10]],
  [['engineering', 60], ['design', 15], ['gtm', 15], ['operations', 10]],
  [['engineering', 50], ['design', 12], ['gtm', 26], ['operations', 12]],
  [['engineering', 42], ['design', 10], ['gtm', 33], ['operations', 15]],
  [['engineering', 38], ['design', 8],  ['gtm', 36], ['operations', 18]],
];

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
  downturnsThisStage: number;
  hasRelocated: boolean;
  windDownAt: IsoDate | null;
  lastRaiseAmount: number;
}

export function simulate(config: SimConfig): OrgEvent[] {
  const rng = createRng(config.seed);
  const ambition = config.ambition ?? 0.5;
  const turbulence = config.turbulence ?? 0.5;
  const ambitionMul = 0.75 + ambition * 0.5;

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
    downturnsThisStage: 0,
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

  const founder = Object.values(ctx.state.people).find((p) => p.isFounder);
  if (!founder) throw new Error('prologue must include a company-founded event');
  ctx.founderId = founder.id;
  for (const person of Object.values(ctx.state.people)) ctx.usedNames.add(person.name);
  ctx.stageIdx = STAGES.findIndex((s) => s.round === ctx.state.latestRound);
  if (ctx.stageIdx === -1) ctx.stageIdx = 0;
  ctx.weeksInStage = Math.max(0, weeksBetween(lastRaiseAt, cursor));

  let safety = 60 * 52;
  while (ctx.state.status === 'operating' && safety-- > 0) {
    cursor = addDays(cursor, 7);
    if (cursor > config.until) break;
    ctx.weeksInStage += 1;
    if (ctx.hiringFreezeWeeks > 0) ctx.hiringFreezeWeeks -= 1;

    if (ctx.windDownAt !== null) {
      if (cursor >= ctx.windDownAt) executeShutdown(ctx, cursor);
      continue;
    }

    stepFundraising(ctx, cursor, ambitionMul, turbulence);
    if (ctx.state.status !== 'operating' || ctx.windDownAt !== null) continue;
    stepDownturn(ctx, cursor, turbulence);
    if (ctx.state.status !== 'operating' || ctx.windDownAt !== null) continue;
    stepExecHires(ctx, cursor);
    stepAppointedLeads(ctx, cursor);
    stepHiring(ctx, cursor, ambitionMul);
    stepAttrition(ctx, cursor, turbulence);
    stepPromotions(ctx, cursor);
    stepConversions(ctx, cursor);
    stepRelocation(ctx, cursor);
  }

  return ctx.events;
}

// ---------------------------------------------------------------------------
// Weekly steps
// ---------------------------------------------------------------------------

function stepFundraising(ctx: SimCtx, at: IsoDate, ambitionMul: number, turbulence: number): void {
  const stage = STAGES[ctx.stageIdx];
  const lastStage = ctx.stageIdx === STAGES.length - 1;

  if (lastStage) {
    // Steady state: no more rounds modeled; a good exit remains possible.
    if (ctx.rng.chance(0.0008)) acquire(ctx, at);
    return;
  }

  // A company that overstays its runway winds down (research: shutdown lands
  // 24–42 months after the last raise).
  if (ctx.weeksInStage > stage.minWeeksToNext + 110) {
    beginWindDown(ctx, at);
    return;
  }

  if (ctx.weeksInStage < stage.minWeeksToNext) return;
  if (!ctx.rng.chance(stage.raiseChancePerWeek * ambitionMul)) return;

  // The gate: this raise attempt resolves the company's fate for the stage.
  const death = stage.gateDeathChance * (0.5 + turbulence);
  const roll = ctx.rng.next();
  if (roll < death) {
    // ~30% of failed raises end in an acqui-hire soft landing rather than a
    // shutdown, keeping acquisitions ~25–35% of endings (org-realism.md).
    if (ctx.rng.chance(0.3)) acquire(ctx, at);
    else beginWindDown(ctx, at);
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
  ctx.downturnsThisStage += 1;
  // Research: ~50% of struggling companies cut again within a year; two rounds
  // without a raise in between means the money is gone.
  if (ctx.downturnsThisStage >= 2) beginWindDown(ctx, at);
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

function stepHiring(ctx: SimCtx, at: IsoDate, ambitionMul: number): void {
  if (ctx.hiringFreezeWeeks > 0) return;
  const stage = STAGES[ctx.stageIdx];
  const gap = stage.target * ambitionMul - headcount(ctx.state);
  if (gap <= 0) return;

  if (ctx.rng.chance(Math.min(0.95, gap * 0.055))) hireRegular(ctx, at);
  if (gap > 10 && ctx.rng.chance(Math.min(0.6, gap * 0.03))) hireRegular(ctx, at);
}

function stepAttrition(ctx: SimCtx, at: IsoDate, turbulence: number): void {
  // Base hazard ≈ 18–19% annualized at default turbulence, shaped by tenure —
  // the spike after week 52 is the equity-cliff exit wave the research found.
  const base = 0.004 * (0.6 + 0.8 * turbulence);
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

function hireRegular(ctx: SimCtx, at: IsoDate): void {
  const { rng, state } = ctx;
  const func = rng.weighted(HIRE_MIX[ctx.stageIdx]);
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
