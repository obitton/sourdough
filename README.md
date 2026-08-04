# 🍞 Sourdough

**A seeded organization simulator.** Feed it a starter, watch a company rise — or collapse.

Sourdough generates the complete, event-by-event history of a fictional startup: founding,
funding, hiring, team formation, promotions, reorgs, departures, layoffs, and — because most
startups don't make it — acquisition or shutdown. You can replay that history on a timeline,
scrub to any date, and see exactly what the org looked like at that moment.

Built for the Crouton take-home. Crouton reconstructs an organization's history from work
systems that mostly expose only the present; a simulator like this is the test bed where the
ground truth is actually knowable.

![The Crouton starter: the timeline on the left with the org chart, headcount sparkline and
company stats as of the selected date on the right. Events up to today are real history from
the take-home prompt; the dimmed ones below are one simulated
future.](docs/screenshot.png)

## Run it

```bash
npm install
npm run dev        # web timeline at http://localhost:5173
npm test           # determinism + realism-invariant test suite
npm run peek       # the same simulator, printed to your terminal
npm run peek -- rye-7 2035-01-01   # any seed, any horizon
```

## Three ideas and a consequence

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
fixtures: a bug found in seed `loaf-28` can be handed to a teammate as two words.

**3. Realism is enforced, not hoped for** — and checked from both ends. A company shouldn't
have seven CTOs, and it also shouldn't go from 2 people to 400 in a year. Those are different
failures, so there are two suites.

*Structural:* a validator ([validate.ts](src/engine/validate.ts)) enforces hard invariants —
singleton executive titles, no orphaned reports, acyclic reporting chains that always reach
the founder, no events for departed people — and the tests fold thousands of generated
histories through it, requiring **every prefix** of every log to be a valid organization, not
just the end state.

*Statistical:* every calibration constant traces to published benchmarks
([docs/research/org-realism.md](docs/research/org-realism.md) — Carta/Kruze medians for
headcount by stage, round spacing, attrition, layoff sizes, failure rates), and
[calibration.test.ts](src/engine/calibration.test.ts) checks that the *emergent output* still
lands in those bands: headcount at each raise, round spacing, cut sizes, graduation and
acquisition rates, and the 12-month equity cliff showing up as a real spike in the departure
histogram. Calibrating inputs and verifying outputs are not the same thing — writing the
second suite is what surfaced the two bugs fixed in [§Decisions](#decisions-worth-knowing).

**Bonus consequence: a whole business model with no new plumbing.** Capacity, burn,
revenue and runway are all *folds over the same log* ([metrics.ts](src/engine/metrics.ts)) —
nothing about them is stored, and only one event type was added to build them. Because
`stepFinance` is a second reducer shared by the generator and the UI, the simulator can make
decisions on the exact numbers the panel renders: **running out of money, not a timer, is what
ends a funded company**, so a team that hires hard genuinely dies sooner, and a company earning
more than it spends can't be killed by a failed raise. And since state is derived,
counterfactuals are nearly free — click anyone in the org chart to price their departure.

## What you're looking at

- **Left:** the timeline — every event, grouped by month, filterable by category. Click any
  event to jump the org view to that date. Events beyond the scrubber are ghosted: one
  possible future.
- **Right:** the org as of the selected date — headcount sparkline (drag it to scrub), stage,
  office, team chips, runway/ARR/burn, per-function bandwidth, and the full reporting tree.
  **Click anyone** to model losing them: capacity lost, where their reports land, what the
  team's load becomes, and how much runway it buys.
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
  metrics.ts      derived capacity + finances; stepFinance is the second reducer
  describe.ts     reference English for each event (shared by web + CLI)
  presets.ts      the real-Crouton prologue + synthetic-company configs
  rng.ts dates.ts names.ts
src/app/        React UI (Vite) — timeline, org panel, sparkline, hand-written CSS
scripts/peek.ts terminal timeline viewer
docs/research/org-realism.md   the benchmarks every calibration constant cites
```

## Decisions worth knowing

- **No database.** State is derivable from the log, and the log is derivable from the seed —
  persistence would add setup friction for zero value at this scale. The event schema is
  deliberately Postgres-ready (append-only, integer `seq`, ISO dates) for the day the
  simulator feeds a real sync pipeline; see [docs/SPEC.md](docs/SPEC.md).
- **No chart or UI libraries.** The sparkline is ~60 lines of SVG; the org chart is a nested
  list. Every line in this repo is explainable.
- **Simulation ticks weekly.** Coarse enough to stay fast (most histories simulate in
  milliseconds; even a full 10-year survivor takes only a few hundred), fine enough that no
  two events need sub-week ordering beyond the `seq` counter.
- **A company can survive a second layoff, and can stop raising without dying.** Both were
  found by measuring rather than reading: repeat layoff rounds used to force a wind-down, and
  anything that stalled between rounds hit the runway rule, so the generator could only
  produce rocket ships and corpses. Real outcomes split roughly into thirds — acquired, shut
  down, and still quietly operating — so `defaultAlive` lets a company find its own revenue
  and step off the runway clock. Its rate is derived from that third, not tuned to taste.
- **The `crouton` preset gets no special prior.** It briefly had a flattering one — which
  meant the single company whose real history can be checked was also the one the model was
  tilted toward. It now runs on the same neutral defaults as every synthetic seed, and gets
  whatever future the model actually predicts.
- **Hiring is budgeted against runway, which is what caps team size.** Not the stage target —
  a req that would leave under 18 months of cash doesn't get approved, so the size of the round
  decides the size of the team. The 18-month figure is the standard rule of thumb, and was
  swept against the calibration bands before being adopted: under ~15 months companies die too
  fast, over ~21 they never staff up.
- **Calibration assertions are bands, not point values.** Changing how many times the RNG is
  drawn reshuffles every downstream outcome, so a statistic like "share of endings that are
  acquisitions" moves several points between builds without the model changing at all. The
  bands are wide enough to survive that and narrow enough to catch drift into fantasy.

Known simplifications and the longer-term vision — a fake-HRIS API with per-vendor
"degradation profiles" so Crouton's reconstruction can be scored against ground truth — live
in [docs/SPEC.md](docs/SPEC.md).
