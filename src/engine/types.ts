/**
 * The event taxonomy is the contract of the whole system: the simulator only
 * emits these, the projector only consumes these, and the UI only renders
 * these. Everything downstream (org chart, headcount, validation) is derived
 * by folding the event log — events are the single source of truth, the same
 * philosophy Crouton applies to real work systems.
 */

export type IsoDate = string; // 'YYYY-MM-DD'

export type Func = 'engineering' | 'design' | 'gtm' | 'operations';
export type PersonFunc = Func | 'leadership';
export type Employment = 'full-time' | 'part-time' | 'contract';
export type Round = 'pre-seed' | 'seed' | 'series-a' | 'series-b';
export type DepartureReason = 'resigned' | 'laid-off' | 'let-go';

interface BaseEvent {
  seq: number;
  at: IsoDate;
}

export interface CompanyFounded extends BaseEvent {
  type: 'company-founded';
  companyName: string;
  city: string;
  founderId: string;
  founderName: string;
}

export interface FundingRaised extends BaseEvent {
  type: 'funding-raised';
  round: Round;
  amountUsd: number;
}

export interface TeamCreated extends BaseEvent {
  type: 'team-created';
  teamId: string;
  teamName: string;
  func: Func;
}

export interface PersonHired extends BaseEvent {
  type: 'person-hired';
  personId: string;
  name: string;
  title: string;
  func: Func;
  teamId: string | null;
  managerId: string | null;
  employment: Employment;
}

export interface PersonPromoted extends BaseEvent {
  type: 'person-promoted';
  personId: string;
  fromTitle: string;
  toTitle: string;
}

export interface ManagerChanged extends BaseEvent {
  type: 'manager-changed';
  personId: string;
  managerId: string;
}

export interface TeamChanged extends BaseEvent {
  type: 'team-changed';
  personId: string;
  fromTeamId: string | null;
  toTeamId: string;
}

export interface EmploymentChanged extends BaseEvent {
  type: 'employment-changed';
  personId: string;
  from: Employment;
  to: Employment;
}

export interface PersonDeparted extends BaseEvent {
  type: 'person-departed';
  personId: string;
  reason: DepartureReason;
}

/** Summary marker announcing a layoff; the individual departures follow it. */
export interface LayoffRound extends BaseEvent {
  type: 'layoff-round';
  count: number;
  pct: number;
}

/**
 * Revenue covers burn: the company is off the fundraising clock. A milestone
 * rather than a derived reading, because it changes how the company behaves —
 * and because a fold of the log has to be able to reproduce it.
 */
export interface DefaultAlive extends BaseEvent {
  type: 'default-alive';
  arrUsd: number;
}

export interface OfficeMoved extends BaseEvent {
  type: 'office-moved';
  fromCity: string;
  toCity: string;
}

export interface CompanyShutdown extends BaseEvent {
  type: 'company-shutdown';
  reason: string;
}

export interface CompanyAcquired extends BaseEvent {
  type: 'company-acquired';
  acquirer: string;
  priceUsd: number;
}

export type OrgEvent =
  | CompanyFounded
  | FundingRaised
  | TeamCreated
  | PersonHired
  | PersonPromoted
  | ManagerChanged
  | TeamChanged
  | EmploymentChanged
  | PersonDeparted
  | LayoffRound
  | DefaultAlive
  | OfficeMoved
  | CompanyShutdown
  | CompanyAcquired;

export type EventType = OrgEvent['type'];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An event authored by hand (e.g. a preset prologue) — `seq` is assigned on replay. */
export type ScriptedEvent = DistributiveOmit<OrgEvent, 'seq'>;

// ---------------------------------------------------------------------------
// Projected state — derived, never authored directly.
// ---------------------------------------------------------------------------

export interface Person {
  id: string;
  name: string;
  title: string;
  func: PersonFunc;
  teamId: string | null;
  managerId: string | null;
  employment: Employment;
  startedAt: IsoDate;
  endedAt: IsoDate | null;
  departureReason: DepartureReason | null;
  isFounder: boolean;
  lastPromotedAt: IsoDate | null;
}

export interface Team {
  id: string;
  name: string;
  func: Func;
  createdAt: IsoDate;
}

export type CompanyStatus = 'operating' | 'shut-down' | 'acquired';

export interface OrgState {
  companyName: string | null;
  city: string | null;
  foundedAt: IsoDate | null;
  latestRound: Round | null;
  status: CompanyStatus;
  endedAt: IsoDate | null;
  /** Revenue covers burn — no longer running on a runway clock. */
  defaultAlive: boolean;
  people: Record<string, Person>;
  teams: Record<string, Team>;
}
