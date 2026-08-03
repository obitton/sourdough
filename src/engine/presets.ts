import { CITIES, COMPANY_NAMES, FIRST_NAMES, LAST_NAMES } from './names';
import { createRng } from './rng';
import type { SimConfig } from './simulate';
import type { IsoDate, ScriptedEvent } from './types';

/**
 * The real Crouton story (from the take-home prompt, plus the standard YC
 * pre-seed) replayed verbatim as a scripted prologue — then the simulator
 * takes over from today and plays one possible future.
 */
export function croutonConfig(until: IsoDate, simulateFrom?: IsoDate): SimConfig {
  const prologue: ScriptedEvent[] = [
    {
      type: 'company-founded',
      at: '2024-10-15',
      companyName: 'Crouton',
      city: 'Charlotte, NC',
      founderId: 'p1',
      founderName: 'Adam',
    },
    { type: 'funding-raised', at: '2024-12-04', round: 'pre-seed', amountUsd: 500_000 },
    { type: 'office-moved', at: '2026-02-15', fromCity: 'Charlotte, NC', toCity: 'New York, NY' },
    { type: 'team-created', at: '2026-05-04', teamId: 't1', teamName: 'Design', func: 'design' },
    {
      type: 'person-hired',
      at: '2026-05-04',
      personId: 'p2',
      name: 'Breno',
      title: 'Founding Designer',
      func: 'design',
      teamId: 't1',
      managerId: 'p1',
      employment: 'full-time',
    },
    { type: 'team-created', at: '2026-06-08', teamId: 't2', teamName: 'GTM', func: 'gtm' },
    {
      type: 'person-hired',
      at: '2026-06-08',
      personId: 'p3',
      name: 'Griffin',
      title: 'Growth Strategist',
      func: 'gtm',
      teamId: 't2',
      managerId: 'p1',
      employment: 'part-time',
    },
  ];

  return { seed: 'crouton', until, prologue, simulateFrom, ambition: 0.7, turbulence: 0.35 };
}

/** A fully synthetic company; the seed decides everything about it. */
export function randomConfig(seed: string, until: IsoDate): SimConfig {
  const rng = createRng(`preset:${seed}`);
  const pad = (n: number) => String(n).padStart(2, '0');
  const foundedAt = `${rng.int(2018, 2022)}-${pad(rng.int(1, 12))}-${pad(rng.int(1, 28))}`;
  return {
    seed,
    until,
    founding: {
      companyName: rng.pick(COMPANY_NAMES),
      city: rng.pick(CITIES),
      founderName: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
      at: foundedAt,
    },
    ambition: rng.next(),
    turbulence: rng.next(),
  };
}
