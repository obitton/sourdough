import { activePeople } from './project';
import type { OrgEvent, OrgState, Person } from './types';

/**
 * Realism invariants. This is the direct answer to "if we run it and there's
 * seven CTOs, that doesn't make sense" — the simulator is written to never
 * violate these, and the test suite folds thousands of generated histories
 * through them to prove it.
 */

/** Titles at most one active person may hold at a time. */
const SINGLETON_TITLES = [
  'Founder & CEO',
  'CTO',
  'VP Engineering',
  'VP Sales',
  'CFO',
  'Head of Design',
  'Head of Growth',
  'Head of Operations',
];

export function validateState(state: OrgState): string[] {
  const problems: string[] = [];
  const active = activePeople(state);
  const activeIds = new Set(active.map((p) => p.id));

  if (state.companyName !== null && state.status === 'operating') {
    const ceos = active.filter((p) => p.title === 'Founder & CEO');
    if (ceos.length !== 1) problems.push(`expected exactly 1 active CEO, found ${ceos.length}`);
  }

  for (const title of SINGLETON_TITLES) {
    const holders = active.filter((p) => p.title === title);
    if (holders.length > 1) {
      problems.push(
        `${holders.length} active people hold "${title}": ${holders.map((p) => p.name).join(', ')}`,
      );
    }
  }

  for (const person of active) {
    if (person.isFounder) continue;
    if (person.managerId === null) {
      problems.push(`${person.name} (${person.id}) has no manager`);
      continue;
    }
    if (!activeIds.has(person.managerId)) {
      problems.push(`${person.name} reports to inactive or unknown person ${person.managerId}`);
      continue;
    }
    const seen = new Set<string>([person.id]);
    let current: Person | undefined = state.people[person.managerId];
    while (current && !current.isFounder) {
      if (seen.has(current.id)) {
        problems.push(`management cycle in ${person.name}'s reporting chain`);
        break;
      }
      seen.add(current.id);
      current = current.managerId ? state.people[current.managerId] : undefined;
    }
    if (!current) problems.push(`${person.name}'s reporting chain does not reach the founder`);
  }

  for (const person of Object.values(state.people)) {
    if (person.teamId !== null && !state.teams[person.teamId]) {
      problems.push(`${person.name} references unknown team ${person.teamId}`);
    }
    if (person.endedAt !== null && person.endedAt < person.startedAt) {
      problems.push(`${person.name} ended (${person.endedAt}) before starting (${person.startedAt})`);
    }
  }

  // Shutdown empties the org; acquisition keeps the team (they have new badges now).
  if (state.status === 'shut-down') {
    const remaining = active.filter((p) => !p.isFounder);
    if (remaining.length > 0) {
      problems.push(`company shut down but ${remaining.length} non-founders are still active`);
    }
  }

  return problems;
}

/** Structural checks on the log itself, independent of any projection. */
export function validateEvents(events: readonly OrgEvent[]): string[] {
  const problems: string[] = [];
  const hired = new Set<string>();
  const departed = new Set<string>();
  let prevSeq = -1;
  let prevAt = '';

  for (const event of events) {
    if (event.seq <= prevSeq) problems.push(`seq not strictly increasing at seq ${event.seq}`);
    if (prevAt && event.at < prevAt) {
      problems.push(`event ${event.seq} dated ${event.at}, before previous event's ${prevAt}`);
    }
    prevSeq = event.seq;
    prevAt = event.at;

    const personId =
      'personId' in event ? event.personId : event.type === 'company-founded' ? event.founderId : null;

    if (event.type === 'company-founded' || event.type === 'person-hired') {
      if (personId && hired.has(personId)) problems.push(`person ${personId} hired twice`);
      if (personId) hired.add(personId);
    } else if (personId) {
      if (!hired.has(personId)) problems.push(`event ${event.seq} references unknown person ${personId}`);
      if (departed.has(personId)) problems.push(`event ${event.seq} references departed person ${personId}`);
    }

    if (event.type === 'manager-changed') {
      if (!hired.has(event.managerId)) problems.push(`event ${event.seq} assigns unknown manager ${event.managerId}`);
      if (departed.has(event.managerId)) problems.push(`event ${event.seq} assigns departed manager ${event.managerId}`);
    }

    if (event.type === 'person-departed') departed.add(event.personId);
  }

  return problems;
}
