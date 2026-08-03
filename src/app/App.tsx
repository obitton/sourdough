import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  addDays,
  croutonConfig,
  headcountSeries,
  project,
  randomConfig,
  simulate,
  validateEvents,
  validateState,
} from '../engine';
import { buildNameIndex } from '../engine/describe';
import { CATEGORY, CATEGORY_LABELS, type Category } from './meta';
import { OrgPanel } from './OrgPanel';
import { Timeline } from './Timeline';

const TODAY = new Date().toISOString().slice(0, 10);
const HORIZON = addDays(TODAY, 365 * 6);

const STARTERS = [
  'rye-starter', 'levain-1856', 'poolish', 'biga', 'tangzhong',
  'ciabatta-9', 'boule-77', 'miche', 'pumpernickel-3', 'focaccia-12',
];

const clamp = (value: string, min: string, max: string) =>
  value < min ? min : value > max ? max : value;

export function App() {
  const [seedInput, setSeedInput] = useState('crouton');
  const seed = seedInput.trim() || 'crouton';
  // Deferred so fast typing in the seed box doesn't run a full simulation on
  // every keystroke — the previous company stays interactive until the new
  // one is ready.
  const deferredSeed = useDeferredValue(seed);

  const events = useMemo(() => {
    const config =
      deferredSeed === 'crouton' ? croutonConfig(HORIZON) : randomConfig(deferredSeed, HORIZON);
    return simulate(config);
  }, [deferredSeed]);

  const first = events[0].at;
  const last = events[events.length - 1].at;

  const [asOf, setAsOf] = useState(() => clamp(TODAY, first, last));
  const [playing, setPlaying] = useState(false);

  // Render-time reset when a different company arrives — an effect here would
  // commit one throwaway frame of the new company at the old date.
  const [shownSeed, setShownSeed] = useState(deferredSeed);
  if (shownSeed !== deferredSeed) {
    setShownSeed(deferredSeed);
    setAsOf(clamp(TODAY, first, last));
    setPlaying(false);
  }
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setAsOf((c) => (c >= last ? c : addDays(c, 14))), 90);
    return () => window.clearInterval(id);
  }, [playing, last]);
  useEffect(() => {
    if (playing && asOf >= last) setPlaying(false);
  }, [playing, asOf, last]);

  const [hidden, setHidden] = useState<ReadonlySet<Category>>(new Set());

  const state = useMemo(() => project(events, asOf), [events, asOf]);
  const series = useMemo(() => headcountSeries(events), [events]);
  const names = useMemo(() => buildNameIndex(events), [events]);
  const visible = useMemo(
    () => events.filter((e) => !hidden.has(CATEGORY[e.type])),
    [events, hidden],
  );

  // Belt and braces: the test suite proves the invariants, and dev builds
  // re-check every generated history anyway so a regression is loud.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const problems = [...validateEvents(events), ...validateState(project(events))];
    if (problems.length > 0) console.warn('[sourdough] invariant violations:', problems);
  }, [events]);

  const toggleCategory = (category: Category) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const rollSeed = () => {
    const starter = STARTERS[Math.floor(Math.random() * STARTERS.length)];
    setSeedInput(`${starter}-${Math.floor(Math.random() * 1000)}`);
  };

  const play = () => {
    if (asOf >= last) setAsOf(first);
    setPlaying(true);
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">🍞</span>
          <div>
            <h1>Sourdough</h1>
            <p>seeded organization simulator — feed it a starter, watch a company rise</p>
          </div>
        </div>
        <div className="controls">
          <label className="seed-field">
            <span>starter</span>
            <input
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              spellCheck={false}
              aria-label="simulation seed"
            />
          </label>
          <button type="button" onClick={() => setSeedInput('crouton')} disabled={seed === 'crouton'}>
            Crouton
          </button>
          <button type="button" onClick={rollSeed}>🎲 New starter</button>
          <button type="button" className="play" onClick={playing ? () => setPlaying(false) : play}>
            {playing ? '⏸ Pause' : '▶ Play history'}
          </button>
        </div>
      </header>

      <div className="filterbar">
        {(Object.keys(CATEGORY_LABELS) as Category[]).map((category) => (
          <button
            key={category}
            type="button"
            className={`chip ${hidden.has(category) ? 'chip-off' : ''}`}
            aria-pressed={!hidden.has(category)}
            onClick={() => toggleCategory(category)}
          >
            {CATEGORY_LABELS[category]}
          </button>
        ))}
        <span className="filter-note">
          {deferredSeed === 'crouton'
            ? 'real history through today, one simulated future beyond it'
            : `synthetic company from starter "${deferredSeed}"`}
        </span>
      </div>

      <main className="columns">
        <Timeline events={visible} names={names} asOf={asOf} playing={playing} onJump={setAsOf} />
        <OrgPanel
          state={state}
          series={series}
          asOf={asOf}
          first={first}
          last={last}
          today={TODAY}
          onScrub={(date) => {
            setPlaying(false);
            setAsOf(clamp(date, first, last));
          }}
        />
      </main>

      <footer className="statusbar">
        starter “{deferredSeed}” → {events.length} events · deterministic: the same starter always bakes the same company
      </footer>
    </div>
  );
}
