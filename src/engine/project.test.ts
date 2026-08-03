import { describe, expect, it } from 'vitest';
import { croutonConfig, randomConfig } from './presets';
import { activePeople, headcount, headcountSeries, project } from './project';
import { simulate } from './simulate';

describe('projection (time travel)', () => {
  it('projects the crouton prologue faithfully', () => {
    const events = simulate(croutonConfig('2026-08-03'));

    // As of founding day: just Adam in Charlotte.
    const day1 = project(events, '2024-10-15');
    expect(day1.companyName).toBe('Crouton');
    expect(day1.city).toBe('Charlotte, NC');
    expect(headcount(day1)).toBe(1);

    // Between the move and Breno's hire: NY, still a team of one.
    const spring = project(events, '2026-03-01');
    expect(spring.city).toBe('New York, NY');
    expect(headcount(spring)).toBe(1);

    // As of the take-home's writing: Adam, Breno (Design), Griffin (part-time GTM).
    const now = project(events, '2026-06-30');
    const people = activePeople(now);
    expect(people.map((p) => p.name).sort()).toEqual(['Adam', 'Breno', 'Griffin']);
    const breno = people.find((p) => p.name === 'Breno')!;
    expect(now.teams[breno.teamId!].name).toBe('Design');
    expect(people.find((p) => p.name === 'Griffin')!.employment).toBe('part-time');
  });

  it('a projection until an early date equals folding only the early events', () => {
    const events = simulate(randomConfig('starter-7', '2030-01-01'));
    const cutoff = events[Math.floor(events.length / 2)].at;
    const viaUntil = project(events, cutoff);
    const viaSlice = project(events.filter((e) => e.at <= cutoff));
    expect(viaUntil).toEqual(viaSlice);
  });

  it('headcount series ends where the projected headcount ends', () => {
    const events = simulate(randomConfig('starter-9', '2030-01-01'));
    const series = headcountSeries(events);
    expect(series[series.length - 1].count).toBe(headcount(project(events)));
    for (const point of series) {
      expect(point.count).toBeGreaterThanOrEqual(0);
    }
  });
});
