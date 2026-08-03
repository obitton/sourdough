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
  'office-moved': '📦',
  'company-shutdown': '🕯️',
  'company-acquired': '🎉',
};

/** Validated with the dataviz palette checker against the dark surface. */
export const FUNC_COLORS: Record<PersonFunc, string> = {
  engineering: '#4E86E0',
  design: '#D45E9F',
  operations: '#BA8D22',
  gtm: '#33A365',
  leadership: '#9C70E0',
};
