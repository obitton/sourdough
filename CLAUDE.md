# Sourdough — seeded organization simulator

## Purpose

Deterministic generator of complete startup org histories (an event log: founding, funding,
hires, reorgs, departures, endings) plus a React timeline UI with time-travel. Built for the
Crouton take-home; Crouton syncs real work systems to reconstruct org history, and this is
the simulated work system with knowable ground truth.

## Structure

| Path | Purpose |
|------|---------|
| `src/engine/` | Pure TypeScript simulation — no React, no I/O, no wall clock |
| `src/engine/types.ts` | **The contract**: 13-type event union + projected state types |
| `src/engine/simulate.ts` | Weekly-tick generator (stage machine, hiring, attrition, endings) |
| `src/engine/project.ts` | The one reducer; `project(events, until)` = org as of a date |
| `src/engine/validate.ts` | Realism invariants (singleton execs, acyclic chains, …) |
| `src/engine/describe.ts` | Reference English per event (shared web + CLI) |
| `src/app/` | React UI: `App` (state) → `Timeline`, `OrgPanel`, `Sparkline` |
| `scripts/peek.ts` | Terminal timeline viewer |
| `docs/SPEC.md` | Vision, architecture, roadmap, known simplifications |
| `docs/research/org-realism.md` | Published benchmarks every calibration constant cites |
| `docs/research/` (rest) | **Gitignored** local prep — never commit |

## Commands

```bash
npm run dev          # Vite dev server :5173
npm test             # Vitest suite — MUST pass before any commit
npm run peek -- <seed> [until]   # CLI timeline
npm run build        # tsc --noEmit && vite build
```

## Hard rules

1. **Engine purity.** Nothing in `src/engine/` may use `Math.random`, `Date.now()`, argless
   `new Date()`, or host timezone. All randomness comes from the injected `Rng`; all date
   math goes through `dates.ts`. This is what makes seeds reproducible everywhere.
2. **Events are the only truth.** Never store derived org state; fold with `project()`. The
   simulator must apply its own events via `applyEvent` (it already does — keep it that way).
3. **Every prefix valid.** Emit cascades before the event that would orphan state (e.g.
   reassign reports *before* a manager departs). The test suite validates every prefix of
   every log; a violation anywhere is a build-stopper, not a nit.
4. **New event type = full loop.** Follow `.claude/skills/sim-engine/SKILL.md` — the type
   union, the reducer, the simulator emission, `describe.ts`, `meta.ts` (icon + category),
   the validator if it has structural meaning, and tests. TypeScript's exhaustive switches
   will point at most of these once the union changes.
5. **No new dependencies** without a one-line justification in README §Decisions. The
   repo's explainability is a feature; today the runtime deps are react and react-dom, full stop.
6. **Comments state constraints only** (why something must be so), never narration of what
   code does. Match the existing density.
7. **Calibration constants** in `simulate.ts` trace to `docs/research/org-realism.md`; if
   you tune one, keep the trail (update the comment) and re-run the outcome-spread test.

## Data flow (hold this in your head; it's the whole app)

```
seed → simulate(config) → OrgEvent[] → project(events, asOf) → OrgState → tree/stats
                              └→ headcountSeries / describe() → sparkline / timeline
```

UI state is exactly: `seedInput`, `asOf`, `playing`, `hidden` (filter set). Everything else
is `useMemo` off `events`.

## Context docs

- [README.md](README.md) — human-facing overview + decisions
- [docs/SPEC.md](docs/SPEC.md) — architecture, event taxonomy, roadmap (degradation-profile
  API is the headline future feature), known simplifications
