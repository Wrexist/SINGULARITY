# CLAUDE.md — Singularity Inc.
*Master context for Claude Code. Read this fully at the start of every session before touching code.*

---

## What this project is
An AI compute tycoon (idle/incremental + management) with a 2.5D data-center hall, a 3-resource economy (Compute / Data / Money), an AI-research tech tree, a "Ship the Model" prestige loop, and a satirical voice. Full design lives in `SINGULARITY_INC_GDD.md` — that is the source of truth for *what* to build. This file is *how* to work.

**The design spine (never violate without explicit owner sign-off):**
1. Clean 2.5D hall that grows visibly as compute scales (upgrades physically manifest).
2. Three resources only. Legibility is the feature.
3. Research tree is the progression spine; reveal depth in waves, never dump.
4. Prestige ("Ship the Model") is core, not optional.
5. Humor lives in writing/events; systems stay clean.

## The current phase (UPDATE THIS LINE EVERY SESSION)
> **PHASE 0 — flat-UI loop prototype. No 3D hall yet. No art polish. Prove the loop is fun as numbers.**
> Do not build the 2.5D hall, events, staff, or power/heat until the owner confirms Phase 0 passed its fun-gate.

If a request would pull work forward from a later phase, STOP and flag it. Scope drift is this project's #1 documented risk. Protecting the phase boundary is part of your job.

---

## Tech stack (ported from Silicon Tech Tycoon)
- **Framework:** React 18 + TypeScript (strict) + Vite
- **State:** Zustand (single source of truth for game state; see conventions below)
- **Mobile shell:** Capacitor (iOS primary target; Android later)
- **Rendering (Phase 1+ only):** parametric — boxes/lights, no image assets, batched. Decide Pixi vs Three vs Canvas when the hall is actually built, not before.
- **Persistence:** local save (serialize Zustand store), versioned with a migration function from day one.
- **No backend in Phase 1.** Everything local. Don't add a server.

## Architecture conventions (hard rules — these mirror the owner's established workflow)
- **Logic / UI separation is strict.** Game simulation (resource ticks, offline calc, prestige math, research effects) lives in pure, framework-agnostic TS modules under `src/engine/` with ZERO React imports. UI under `src/ui/` consumes engine output. This makes the engine unit-testable and portable (it's what lets a Steam port reuse the core later).
- **The engine is deterministic and testable.** Given a state + elapsed time, `tick()` returns the next state. No `Date.now()` inside the engine — pass time in. This is non-negotiable; it's what makes offline progress and balancing tractable.
- **Numbers use a BigNumber abstraction** from the start (idle games overflow `number` fast). Wrap it so it can be swapped.
- **All tunable values live in `src/engine/balance/` as data**, never hardcoded in logic. Balancing is a first-class workstream; it must be editable without touching code.
- **Commit-per-turn discipline.** One logical change per commit, descriptive message. Matches owner's established habit.

## Working agreement (how the owner wants you to operate)
- The owner wants a **rigorous engineering partner, not a yes-man.** If an instruction is unwise (scope creep, premature optimization, a balance value that breaks the curve), say so with reasoning and propose a better path. Push back grounded in evidence.
- Read `TASK.md` for the active task list. Update it as you go. Read `LEARNINGS.md` for accumulated gotchas before solving anything non-trivial — and append to it when you learn something that'd save a future session time.
- Prefer the smallest change that proves the next thing. This project ships by staying small.
- When unsure about a design call, check the GDD first; if still unsure, ask rather than guess and build the wrong thing.

## What NOT to do
- Do not build later-phase systems early (see phase line above).
- Do not add image assets (breaks the parametric philosophy + bloats the Capacitor bundle).
- Do not add dark-pattern retention mechanics (fake-urgency timers, manipulative pop-ups, energy gates that exist only to sell skips). The GDD commits to honest juice; this also keeps App Store review clean.
- Do not introduce crypto/real-money-earning framing. This is explicitly an AI-compute game; the crypto theme was rejected for review-risk and saturation reasons.
- Do not hardcode balance values into logic.

## Session start checklist (do this every time)
1. Read this file, then `TASK.md`, then skim `LEARNINGS.md`.
2. Confirm the current phase line above. If the task isn't in-phase, flag it.
3. Run the test suite (`npm test`) before and after your changes.
4. Commit per logical change.
5. Before ending: update `TASK.md`, append any new gotcha to `LEARNINGS.md`.
