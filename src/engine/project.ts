import type { IsoDate, OrgEvent, OrgState, Person } from './types';

export function emptyState(): OrgState {
  return {
    companyName: null,
    city: null,
    foundedAt: null,
    latestRound: null,
    status: 'operating',
    endedAt: null,
    defaultAlive: false,
    people: {},
    teams: {},
  };
}

/**
 * The one reducer. The simulator applies events through this as it emits them
 * and the UI folds the log through it for time travel, so generator state and
 * rendered state can never disagree.
 *
 * Mutates `state` in place; callers own the copy they pass in.
 */
export function applyEvent(state: OrgState, event: OrgEvent): void {
  switch (event.type) {
    case 'company-founded':
      state.companyName = event.companyName;
      state.city = event.city;
      state.foundedAt = event.at;
      state.people[event.founderId] = {
        id: event.founderId,
        name: event.founderName,
        title: 'Founder & CEO',
        func: 'leadership',
        teamId: null,
        managerId: null,
        employment: 'full-time',
        startedAt: event.at,
        endedAt: null,
        departureReason: null,
        isFounder: true,
        lastPromotedAt: null,
      };
      break;
    case 'funding-raised':
      state.latestRound = event.round;
      break;
    case 'team-created':
      state.teams[event.teamId] = {
        id: event.teamId,
        name: event.teamName,
        func: event.func,
        createdAt: event.at,
      };
      break;
    case 'person-hired':
      state.people[event.personId] = {
        id: event.personId,
        name: event.name,
        title: event.title,
        func: event.func,
        teamId: event.teamId,
        managerId: event.managerId,
        employment: event.employment,
        startedAt: event.at,
        endedAt: null,
        departureReason: null,
        isFounder: false,
        lastPromotedAt: null,
      };
      break;
    case 'person-promoted': {
      const person = state.people[event.personId];
      person.title = event.toTitle;
      person.lastPromotedAt = event.at;
      break;
    }
    case 'manager-changed':
      state.people[event.personId].managerId = event.managerId;
      break;
    case 'team-changed':
      state.people[event.personId].teamId = event.toTeamId;
      break;
    case 'employment-changed':
      state.people[event.personId].employment = event.to;
      break;
    case 'person-departed': {
      const person = state.people[event.personId];
      person.endedAt = event.at;
      person.departureReason = event.reason;
      break;
    }
    case 'layoff-round':
      break; // summary marker; the individual departures carry the state change
    case 'default-alive':
      state.defaultAlive = true;
      break;
    case 'office-moved':
      state.city = event.toCity;
      break;
    case 'company-shutdown':
      state.status = 'shut-down';
      state.endedAt = event.at;
      break;
    case 'company-acquired':
      state.status = 'acquired';
      state.endedAt = event.at;
      break;
  }
}

/** Fold the log into the org as it stood at end of day `until` (or the full log). */
export function project(events: readonly OrgEvent[], until?: IsoDate): OrgState {
  const state = emptyState();
  for (const event of events) {
    if (until !== undefined && event.at > until) break;
    applyEvent(state, event);
  }
  return state;
}

export function activePeople(state: OrgState): Person[] {
  return Object.values(state.people).filter((p) => p.endedAt === null);
}

export function headcount(state: OrgState): number {
  return activePeople(state).length;
}

export interface HeadcountPoint {
  at: IsoDate;
  count: number;
}

/** One point per date on which headcount changed — feeds the sparkline. */
export function headcountSeries(events: readonly OrgEvent[]): HeadcountPoint[] {
  const points: HeadcountPoint[] = [];
  let count = 0;
  for (const event of events) {
    if (event.type === 'company-founded' || event.type === 'person-hired') count += 1;
    else if (event.type === 'person-departed') count -= 1;
    else continue;
    const last = points[points.length - 1];
    if (last && last.at === event.at) last.count = count;
    else points.push({ at: event.at, count });
  }
  return points;
}
