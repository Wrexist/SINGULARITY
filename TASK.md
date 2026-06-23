# TASK.md — Singularity Inc.
*Live task list. Claude Code updates this as work progresses. One source of truth for "what's next."*

**Current phase:** PHASE 0 — flat-UI loop prototype (prove the loop is fun as numbers)
**Phase 0 exit gate:** owner plays the flat-UI build and confirms the core loop is compelling WITHOUT any art. If not fun here, fix the loop or kill the project. Do not proceed to Phase 1 until this gate passes.

---

## Phase 0 tasks (the only tasks that exist right now)

### Setup
- [ ] Scaffold Vite + React 18 + TS (strict) project
- [ ] Add Zustand, set up `src/engine/` (no React) and `src/ui/` split
- [ ] Add a BigNumber abstraction wrapper in `src/engine/math/`
- [ ] Set up Vitest; write the first engine test before the first engine feature
- [ ] Create `src/engine/balance/` with tunables as data
- [ ] Git init, first commit, push to repo

### Core engine (pure TS, deterministic, tested)
- [ ] Resource model: Compute, Data, Money (with BigNumber)
- [ ] `tick(state, elapsedMs)` pure function — passive Compute generation
- [ ] Manual action: assign Compute to a training run → yields Data/Money on completion
- [ ] Upgrade model: ~10 upgrades (rack tiers, yield multipliers, one automation)
- [ ] Offline progress: compute accrued resources from elapsed time on load
- [ ] One research branch (~5 nodes) gating a capability unlock
- [ ] Prestige: "Ship the Model" — reset + Legacy Weights meta-currency + one permanent multiplier
- [ ] Save/load: serialize store, versioned, with a v0→v1 migration stub

### Minimal flat UI (deliberately ugly — no art, no hall)
- [ ] Resource counters (Compute / Data / Money) with number-pop on change
- [ ] Action dock: claim / assign training run
- [ ] Upgrade list (buy buttons, costs, owned counts)
- [ ] Research panel (the 5-node branch)
- [ ] Prestige button + confirmation + "what you keep" summary
- [ ] "While you were away" screen on load

### Balance pass
- [ ] Build a tiny spreadsheet/sim of the cost/yield curve (consider a Claude-in-artifact balance simulator)
- [ ] Tune so first prestige lands at a satisfying point, not too early/late
- [ ] First-session playtest by owner → FUN GATE

---

## Backlog (Phase 1+ — DO NOT START, parked for visibility)
- 2.5D hall + manifestation rule (racks appear on purchase)
- Eras 1–3 full research trees
- Lightweight satirical events (~12)
- Milestone era-transition moments
- Premium unlock IAP
- Capacitor iOS build + TestFlight (see `DEPLOYMENT.md`)
- [Phase 2+] power/heat, staff, factions, eras 4–6, cosmetic store, Steam port

---

## Done log
*(append completed items with date as you go — keeps session handoff clean)*
