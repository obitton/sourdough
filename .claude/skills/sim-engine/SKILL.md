---
name: sim-engine
description: Conventions for Sourdough's simulation engine — determinism rules, the event-type checklist, cascade patterns, and calibration. Use when adding or changing event types, touching src/engine, tuning realism constants, or debugging invariant violations.
---

# Sourdough engine conventions

## Determinism (non-negotiable)

- All randomness flows from the injected `Rng` (`createRng(seed)`), threaded through `SimCtx`.
  `Math.random`, `Date.now()`, argless `new Date()`, and locale/timezone-dependent APIs are
  forbidden anywhere under `src/engine/`.
- Date math only through `dates.ts` (UTC). Event dates within one weekly tick share the same
  `at`; ordering within a tick is carried by `seq` alone.
- If you add a config knob, derive its default deterministically (constant or from the seed),
  never from the environment.

## Adding an event type — the full loop

TypeScript exhaustiveness does most of the policing: after step 1, follow the compile errors.

1. `types.ts` — add the interface + union member. Keep payloads flat and serializable.
2. `project.ts` → `applyEvent` — the state change (or an explicit `break` comment if it's a
   marker event like `layoff-round`).
3. `simulate.ts` — emit it via `emit(ctx, {...})`, which routes through `applyEvent` so the
   generator's state stays honest. Add a `step*` function if it's a new weekly concern.
4. `describe.ts` — one English sentence, in the take-home example's voice.
5. `src/app/meta.ts` — `ICONS` entry + `CATEGORY` entry (people | structure | company).
6. `validate.ts` — only if the event has structural meaning (references, singletons, ordering).
7. Tests — extend `invariants.test.ts` if there's a new invariant; the every-prefix fold and
   determinism tests cover the rest automatically. Run `npm test`.
8. `npm run peek -- some-seed` and eyeball the sentence in context.

## Cascade pattern (the "every prefix valid" rule)

Any event that would leave state invalid must be preceded by repairing events in the same
tick: reassign reports (`manager-changed`) **before** `person-departed`; create the team
**before** hiring into it; announce `layoff-round` **before** its departures. The
invariants test folds every prefix, so ordering mistakes fail loudly and immediately.

## Singleton titles & leaders

- `SINGLETON_TITLES` in `validate.ts` is the "no seven CTOs" list; the simulator guards with
  `titleActive()` / `funcLeader()` before emitting. If you add an exec title, add it to both
  the guard site and the validator list.
- `FUNC_LEADER_TITLES` order encodes seniority (first = most senior); `funcLeader()` relies
  on it for manager assignment.

## The second reducer

`metrics.ts` derives capacity and money from the same log — nothing is stored. Two entry
points must stay paired: `applyFinanceEvent` (capital from `funding-raised`) and
`stepFinance` (one week of burn and revenue). The simulator calls both as it ticks; the UI
calls both via `financeSeries`. **Never advance the books in only one of those paths** — the
whole point is that the generator decides on numbers the panel can reproduce.

Consequences to preserve when editing `simulate.ts`:
- Insolvency ends a funded company (`capitalUsd <= 0`), checked before every other branch.
  Pre-funding companies keep a time fuse because the model does not track founder savings.
- `onRunwayClock()` gates every death path. A company that is not burning cash cannot die of
  a failed raise or a restructuring — only an acquisition ends it.
- `minRunwayWeeks` gates hiring and is the real cap on team size. Changing it moves every
  calibration band; re-sweep before committing.
- `default-alive` requires revenue within 40% of covering burn *and* the rate roll. Without
  the coverage gate a company with no GTM could "turn the corner" on luck alone.

## Calibration

Stage targets, attrition curve, layoff sizes, promotion cadence all cite
`docs/research/org-realism.md` (local, gitignored). When tuning: change the constant, update
its comment's rationale, re-run `npm test` — the outcome-spread test (`some seeds die, some
thrive, nobody hits 250 heads`) is the guardrail against drift into fantasy.

## Gotchas

- `prologue` ids must follow the `p<N>`/`t<N>` scheme — counters resume from the projected
  counts after replay.
- The founder is created by `company-founded` (never `person-hired`), has
  `func: 'leadership'`, `managerId: null`, and never departs in v0. Several invariants
  assume exactly this.
- `acquired` keeps people active (validator allows it); `shut-down` requires everyone but
  the founder departed — `executeShutdown` handles the ordering via `orderLeavesFirst`.
- `emit()` builds `const event: OrgEvent = { ...scripted, seq }` — fully type-checked, no
  cast. If a new payload doesn't compile there, fix the payload, not the annotation.
- Span of control has two arms in `stepAppointedLeads`: appoint a first lead when a
  leaderless function reaches ~7, and split a leader's direct reports (promote a sub-lead,
  hand over half) whenever they exceed ~9 — without the second arm a CTO ends up personally
  managing 50 engineers. Exec hires respect `hiringFreezeWeeks`, same as regular hiring.
