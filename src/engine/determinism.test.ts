import { describe, expect, it } from 'vitest';
import { croutonConfig, randomConfig } from './presets';
import { simulate } from './simulate';

const UNTIL = '2026-08-03';

describe('determinism', () => {
  it('same seed produces a byte-identical event log', () => {
    const a = simulate(randomConfig('starter-42', UNTIL));
    const b = simulate(randomConfig('starter-42', UNTIL));
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('different seeds produce different histories', () => {
    const a = simulate(randomConfig('starter-1', UNTIL));
    const b = simulate(randomConfig('starter-2', UNTIL));
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
  });

  it('the crouton preset replays the real prologue verbatim', () => {
    const events = simulate(croutonConfig(UNTIL));
    expect(events[0]).toMatchObject({
      type: 'company-founded',
      companyName: 'Crouton',
      city: 'Charlotte, NC',
      founderName: 'Adam',
      at: '2024-10-15',
    });
    const breno = events.find((e) => e.type === 'person-hired' && e.name === 'Breno');
    expect(breno).toMatchObject({ title: 'Founding Designer', at: '2026-05-04' });
    const griffin = events.find((e) => e.type === 'person-hired' && e.name === 'Griffin');
    expect(griffin).toMatchObject({ employment: 'part-time', at: '2026-06-08' });
  });
});
