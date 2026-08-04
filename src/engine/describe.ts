import { project } from './project';
import type { OrgEvent } from './types';

/**
 * The reference English rendering of each event, written in the voice of the
 * take-home's own example ("Breno was hired as a founding designer to the
 * Design team"). Shared by the web timeline and the CLI.
 */

export interface NameIndex {
  person(id: string): string;
  team(id: string): string;
}

export function buildNameIndex(events: readonly OrgEvent[]): NameIndex {
  const full = project(events);
  return {
    person: (id) => full.people[id]?.name ?? id,
    team: (id) => full.teams[id]?.name ?? id,
  };
}

export function formatMoney(amountUsd: number): string {
  if (amountUsd >= 1_000_000) {
    const millions = amountUsd / 1_000_000;
    return `$${millions % 1 === 0 ? millions : millions.toFixed(1)}M`;
  }
  return `$${Math.round(amountUsd / 1_000)}K`;
}

const ROUND_LABELS = {
  'pre-seed': 'pre-seed',
  seed: 'seed',
  'series-a': 'Series A',
  'series-b': 'Series B',
} as const;

export function describe(event: OrgEvent, names: NameIndex): string {
  switch (event.type) {
    case 'company-founded':
      return `${event.companyName} was founded in ${event.city} by ${event.founderName}.`;
    case 'funding-raised':
      return `Raised a ${ROUND_LABELS[event.round]} round of ${formatMoney(event.amountUsd)}.`;
    case 'team-created':
      return `The ${event.teamName} team was formed.`;
    case 'person-hired': {
      const team = event.teamId ? ` on the ${names.team(event.teamId)} team` : '';
      const employment = event.employment === 'full-time' ? '' : `, ${event.employment}`;
      return `${event.name} joined as ${event.title}${team}${employment}.`;
    }
    case 'person-promoted':
      return `${names.person(event.personId)} was promoted to ${event.toTitle}.`;
    case 'manager-changed':
      return `${names.person(event.personId)} now reports to ${names.person(event.managerId)}.`;
    case 'team-changed':
      return `${names.person(event.personId)} moved to the ${names.team(event.toTeamId)} team.`;
    case 'employment-changed':
      return `${names.person(event.personId)} went ${event.to === 'full-time' ? 'full-time' : event.to}.`;
    case 'person-departed':
      switch (event.reason) {
        case 'resigned':
          return `${names.person(event.personId)} left the company.`;
        case 'laid-off':
          return `${names.person(event.personId)} was laid off.`;
        case 'let-go':
          return `${names.person(event.personId)} was let go.`;
      }
      break;
    case 'layoff-round':
      return `Layoff round: ${event.count} ${event.count === 1 ? 'person' : 'people'} (${event.pct}%).`;
    case 'default-alive':
      return `Revenue covers burn at ${formatMoney(event.arrUsd)} ARR — the company is default alive.`;
    case 'office-moved':
      return `The company relocated from ${event.fromCity} to ${event.toCity}.`;
    case 'company-shutdown':
      return `The company shut down — ${event.reason}.`;
    case 'company-acquired':
      return `Acquired by ${event.acquirer} for ${formatMoney(event.priceUsd)}.`;
  }
}
