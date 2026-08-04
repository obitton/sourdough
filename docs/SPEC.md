# Sourdough — technical spec & vision

## 1. Problem

Crouton integrates with a company's work systems to form the complete history of an
organization's structure over time. Developing and testing that product needs an external
service that *simulates* those work systems — one that can produce organizations with
believable formation, growth, change, and conclusion.

This repo is that service's core: a deterministic generator of complete org histories, with
a timeline UI to view them.

## 2. The insight the design is built around

Real work systems expose **degraded views of history**:

| System style | What you can actually get |
|---|---|
| Workday | effective-dated records, "as of" queries (the gold standard) |
| BambooHR / HiBob | history *tables* for some fields, flat current record for the rest |
| Gusto / Deel | partial history as nested arrays |
| Rippling, SCIM directories | current state only |
| Webhooks (all vendors) | thin change pointers, only from the moment you subscribed |

None of them hand over a replayable event log. Crouton's core problem is *reconstructing*
history from these fragments — which means the hardest thing to get for testing is the one
thing a simulator can have for free: **ground truth**.

So Sourdough's architecture puts a perfect event log at the center, and treats everything
else as a projection of it. The v1 vision (§7) is to also serve *degraded* views of that same
log — per-vendor personas — so a sync pipeline can be pointed at a simulated BambooHR and its
reconstruction scored against the truth. That's the difference between "fake data" and a
**test harness with an answer key**.

## 3. Architecture

```
        seed ─┐
              ▼
   ┌─────────────────────┐     OrgEvent[]      ┌──────────────────────┐
   │ simulate()          │ ──────────────────▶ │ project(events, t)   │
   │ weekly-tick engine  │   (the only truth)  │ fold → OrgState @ t  │
   └─────────────────────┘                     └──────────────────────┘
              │  applies its own events               ▲         ▲
              └── through the same reducer ───────────┘         │
                                               ┌────────────────┴───┐
                                               │ validate()         │
                                               │ realism invariants │
                                               └────────────────────┘
```

- **One reducer.** `simulate()` maintains its working state by applying each event it emits
  through `applyEvent` — the exact function the UI folds with. Generator and projections
  cannot drift apart.
- **Determinism.** One seeded PRNG (xmur3 → mulberry32), UTC-only date math, no wall clock,
  no `Math.random`. Same seed → byte-identical log in the CLI, the web app, and CI.
- **Prologue mechanism.** A config may script verbatim events before simulation begins (the
  `crouton` preset replays the real story from the take-home prompt, then simulates forward
  from today). Scripted history and generated history are the same data type — exactly how a
  real ingestion pipeline would see them.

## 4. Event taxonomy

14 types, one discriminated union (`src/engine/types.ts`):

| Category | Events |
|---|---|
| people | `person-hired`, `person-departed`, `person-promoted`, `employment-changed` |
| structure | `team-created`, `team-changed`, `manager-changed` |
| company | `company-founded`, `funding-raised`, `layoff-round`, `default-alive`, `office-moved`, `company-shutdown`, `company-acquired` |

Conventions:
- `seq` strictly increasing; `at` (ISO date) non-decreasing.
- `layoff-round` is an announcement marker; the individual `person-departed` events follow it.
- Reports are reassigned (`manager-changed`) *before* their manager departs, so **every
  prefix of the log is a valid organization** — the property that makes scrub-anywhere time
  travel safe.

## 5. Realism model

The generator is a stage machine calibrated to published data (sources in
`docs/research/org-realism.md`, local): headcount targets per stage (~2 → 6 → 17 → 50 → 110),
rounds ~20–28 months apart, gate rolls at each raise (fail → wind-down; small chance →
acquired), attrition ~19% annualized shaped by tenure (the post-equity-cliff spike at weeks
52–78), layoff rounds of 10–30% (median 15%) with a hiring freeze, exec sequencing (CTO at
seed, VP Sales at A, VP Eng + CFO at B), team formation at the second hire in a function,
appointed leads at ~7 (span of control), promotions at ~24 months median.

Hard invariants (`validate.ts`), checked in tests for **every prefix** of 40+ seeds:
- exactly one active Founder & CEO while operating; singleton exec titles (the "no seven
  CTOs" rule)
- every active non-founder has an active manager; chains are acyclic and reach the founder
- no events reference departed or unknown people; team references resolve
- shutdown empties the org (the founder turns off the lights); acquisition keeps the team

Dev builds re-validate every generated history and `console.warn` on violation — belt and
braces on top of the suite.

## 5b. Capacity and money (`metrics.ts`)

Headcount is a poor proxy for what an org can actually do, and Crouton's own
product tracks allocation and capacity rather than just roster. So the engine
derives two more layers — **neither of which adds an event type**:

- **Capacity.** Each active person contributes effective person-weeks, discounted
  for employment type (part-time 0.5), ramp-up (~12 weeks to full productivity)
  and management overhead (~6%/report, floored). `load = demand / capacity` per
  function; above 1.0 the team is carrying more than it can hold. This is what
  makes a departure legible: the work does not leave with the person, so the same
  demand lands on a smaller team and load jumps.
- **Money.** Capital accrues from `funding-raised` events and drains by weekly
  payroll; ARR is driven by GTM capacity, capped by what a team of that size can
  carry, and churned. Runway = capital / net burn.

`stepFinance` is a **second reducer**, and it obeys the same rule as `applyEvent`:
the simulator advances the books with it each tick, and the UI folds the log with
it via `financeSeries`. They cannot disagree, which is why the simulator can make
life-or-death decisions on numbers the panel renders.

That coupling is load-bearing. Insolvency — not a timer — is what ends a funded
company, so a team that hires hard genuinely dies sooner. Conversely a company
earning more than it spends cannot be killed by a failed raise or a restructuring;
only an acquisition ends it. `minRunwayWeeks` (18 months) is the binding
constraint on hiring, which is what makes the size of the round decide the size
of the team.

Counterfactuals fall out for free: `withoutPerson` rebuilds the org as it would
stand if someone left today — using the same reports-move-up cascade the
simulator uses — so the UI can price a departure (capacity lost, load shift,
reports reassigned, runway gained) without touching the event log.

## 6. Stack

| Choice | Why |
|---|---|
| TypeScript everywhere | Crouton's language; the event union + strict mode carry the design |
| Vite + React | Crouton's own toolchain; instant feedback loop |
| Vitest | shares the Vite pipeline; the suite is the realism argument |
| No Postgres (yet) | state is derivable from the log, the log from the seed; a DB adds setup friction with zero payoff at 600 events. The schema is append-only and Postgres-shaped for when persistence earns its keep (§7) |
| No component/chart/CSS libs | ~1,600 lines total, every one explainable in an interview |

## 7. Roadmap (deliberately not built yet)

1. **Fake-HRIS API** — a small Hono/Fastify server over the same engine:
   `GET /orgs/:seed/employees?as_of=DATE` (current-state persona),
   `GET /orgs/:seed/events?since=SEQ` (webhook-ish persona),
   `GET /orgs/:seed/_truth/events` (the answer key).
2. **Degradation profiles** — per-vendor personas (Workday effective-dated, BambooHR
   history-tables, SCIM snapshot-only) derived from the same log; score a sync pipeline's
   reconstruction against truth.
3. **Postgres export** — `npm run export` → NDJSON + `COPY`-ready SQL of the event log.
4. **Richer org physics** — co-founder events (and breakups), rehires ("boomerangs"),
   multiple teams per function at Series B scale, fractional allocations across teams,
   bitemporal timestamps (decision date vs effective date — e.g. a termination decided
   Friday, effective month-end).

## 8. Known simplifications

One team per function; the founder never leaves; no rehires; titles are a flat string (no
level lattice); funding amounts are cosmetic; weekly resolution. Each is a conscious v0 cut —
listed here so they read as decisions, not oversights.
