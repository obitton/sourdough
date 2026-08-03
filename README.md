# 🍞 Sourdough

**A seeded organization simulator.** Feed it a starter, watch a company rise — or collapse.

Sourdough generates the complete, event-by-event history of a fictional startup: founding,
funding, hiring, team formation, promotions, reorgs, departures, layoffs, and — because most
startups don't make it — acquisition or shutdown. You can replay that history on a timeline,
scrub to any date, and see exactly what the org looked like at that moment.

Built for the Crouton take-home. Crouton reconstructs an organization's history from work
systems that mostly expose only the present; a simulator like this is the test bed where the
ground truth is actually knowable.

## Run it

```bash
npm install
npm run dev        # web timeline at http://localhost:5173
npm test           # determinism + realism-invariant test suite
npm run peek       # the same simulator, printed to your terminal
npm run peek -- rye-7 2035-01-01   # any seed, any horizon
```

## The three ideas

**1. Events are the only source of truth.** The simulator emits a typed event log
([types.ts](src/engine/types.ts)); everything else — the org chart, headcount, team rosters,
company status — is a pure fold over that log ([project.ts](src/engine/project.ts)). The
simulator itself applies each event through the *same reducer* the UI uses, so the generator
and every projection are consistent by construction. Time travel is free: "the org as of
March 2027" is just the fold stopped early. This mirrors how Crouton itself thinks about org
history, and it's what makes the output useful as sync-test data.

**2. Same seed, same company — every run, everywhere.** All randomness flows through one
seeded PRNG ([rng.ts](src/engine/rng.ts)); all date math is UTC ([dates.ts](src/engine/dates.ts));
nothing in the engine touches `Math.random` or the clock. The CLI and the web app produce
byte-identical histories for the same seed. Deterministic worlds are reproducible test
fixtures: a bug found in seed `millstone-3` can be handed to a teammate as two words.

**3. Realism is enforced, not hoped for.** A company shouldn't have seven CTOs. The simulator
is calibrated against published startup benchmarks (Carta/Kruze medians for headcount by
stage, round spacing, attrition with its 12-month-cliff spike, layoff sizes, failure rates),
and a validator ([validate.ts](src/engine/validate.ts)) enforces hard invariants: singleton
executive titles, no orphaned reports, acyclic reporting chains that always reach the founder,
no events for departed people. The test suite folds thousands of generated histories through
the validator and requires **every prefix** of every log to be a valid organization — not just
the end state.

## What you're looking at

- **Left:** the timeline — every event, grouped by month, filterable by category. Click any
  event to jump the org view to that date. Events beyond the scrubber are ghosted: one
  possible future.
- **Right:** the org as of the selected date — headcount sparkline (drag it to scrub), stage,
  office, team chips, and the full reporting tree.
- **Starter box:** `crouton` replays the real prologue from the take-home prompt, then
  simulates one possible future. Any other string bakes a fully synthetic company. 🎲 rolls
  a fresh one.
- **▶ Play** animates the whole history.

## Layout

```
src/engine/     pure TypeScript, no React, no I/O — the whole simulation
  types.ts        event taxonomy + projected-state types (the contract)
  simulate.ts     weekly-tick generator: stage machine, hiring, attrition, endings
  project.ts      the one reducer; fold events → org state at any date
  validate.ts     realism invariants (state + event-stream)
  describe.ts     reference English for each event (shared by web + CLI)
  presets.ts      the real-Crouton prologue + synthetic-company configs
  rng.ts dates.ts names.ts
src/app/        React UI (Vite) — timeline, org panel, sparkline, hand-written CSS
scripts/peek.ts terminal timeline viewer
```

## Decisions worth knowing

- **No database.** State is derivable from the log, and the log is derivable from the seed —
  persistence would add setup friction for zero value at this scale. The event schema is
  deliberately Postgres-ready (append-only, integer `seq`, ISO dates) for the day the
  simulator feeds a real sync pipeline; see [docs/SPEC.md](docs/SPEC.md).
- **No chart or UI libraries.** The sparkline is ~60 lines of SVG; the org chart is a nested
  list. Every line in this repo is explainable.
- **Simulation ticks weekly.** Coarse enough to stay fast (a 10-year company simulates in
  single-digit milliseconds), fine enough that no two events need sub-week ordering beyond
  the `seq` counter.

Known simplifications and the longer-term vision — a fake-HRIS API with per-vendor
"degradation profiles" so Crouton's reconstruction can be scored against ground truth — live
in [docs/SPEC.md](docs/SPEC.md).
