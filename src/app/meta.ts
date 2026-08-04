import type { EventType, PersonFunc } from '../engine';

export type Category = 'people' | 'structure' | 'company';

export const CATEGORY: Record<EventType, Category> = {
  'person-hired': 'people',
  'person-departed': 'people',
  'person-promoted': 'people',
  'employment-changed': 'people',
  'team-created': 'structure',
  'team-changed': 'structure',
  'manager-changed': 'structure',
  'company-founded': 'company',
  'funding-raised': 'company',
  'layoff-round': 'company',
  'default-alive': 'company',
  'office-moved': 'company',
  'company-shutdown': 'company',
  'company-acquired': 'company',
};

export const CATEGORY_LABELS: Record<Category, string> = {
  people: 'People',
  structure: 'Structure',
  company: 'Company',
};

export const ICONS: Record<EventType, string> = {
  'company-founded': '🏢',
  'funding-raised': '💰',
  'team-created': '🧩',
  'person-hired': '🌱',
  'person-promoted': '📈',
  'manager-changed': '🧭',
  'team-changed': '🔀',
  'employment-changed': '⏫',
  'person-departed': '👋',
  'layoff-round': '📉',
  'default-alive': '🌤️',
  'office-moved': '📦',
  'company-shutdown': '🕯️',
  'company-acquired': '🎉',
};

/** Runway past about five years is not a number anyone plans against. */
export const RUNWAY_CAP_MONTHS = 60;

export const formatMonths = (value: number): string =>
  value === Infinity ? '∞' : value > RUNWAY_CAP_MONTHS ? '60+' : Math.round(value).toString();

/**
 * A function with work waiting and nobody to do it has an infinite load, which
 * is true and useless. Every view formats load through here so no panel can
 * render `Infinity%` again.
 */
export const formatLoad = (load: number, headcount: number): string =>
  headcount === 0 ? 'unstaffed' : `${Math.round(load * 100)}%`;

/** Checked colorblind-safe and ≥3:1 contrast against the dark background. */
export const FUNC_COLORS: Record<PersonFunc, string> = {
  engineering: '#4E86E0',
  design: '#D45E9F',
  operations: '#BA8D22',
  gtm: '#33A365',
  leadership: '#9C70E0',
};
