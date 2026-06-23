# TASK.md — Singularity Inc.
*Live task list. Claude Code updates this as work progresses. One source of truth for "what's next."*

**Current phase:** PHASE 0 — flat-UI loop prototype (prove the loop is fun as numbers)
**Phase 0 exit gate:** owner plays the flat-UI build and confirms the core loop is compelling WITHOUT any art. If not fun here, fix the loop or kill the project. Do not proceed to Phase 1 until this gate passes.

---

## Phase 0 tasks (the only tasks that exist right now)

### Setup
- [x] Scaffold Vite + React 18 + TS (strict) project
- [x] Add Zustand, set up `src/engine/` (no React) and `src/ui/` split
- [x] Add a BigNumber abstraction wrapper in `src/engine/math/`
- [x] Set up Vitest; write the first engine test before the first engine feature
- [x] Create `src/engine/balance/` with tunables as data
- [x] Git init, first commit, push to repo
- [x] Screenshot tooling (`npm run shot`) so the owner can see builds easily

### Core engine (pure TS, deterministic, tested)
- [x] Resource model: Compute, Data, Money (with BigNumber)
- [x] `tick(state, elapsedMs)` pure function — passive Compute generation
- [x] Manual action: assign Compute to a training run → yields Data/Money on completion
- [x] Upgrade model: ~10 upgrades (rack tiers, yield multipliers, two automations)
- [x] Offline progress: compute accrued resources from elapsed time on load
- [x] One research branch (5 nodes) gating a capability unlock (passive-money Inference API)
- [x] Prestige: "Ship the Model" — reset + Legacy Weights meta-currency + permanent multiplier
- [x] Save/load: serialize store, versioned, with a v0→v1 migration stub

### Minimal flat UI (deliberately ugly — no art, no hall)
- [x] Resource counters (Compute / Data / Money) with number-pop on change
- [x] Action dock: claim / assign training run
- [x] Upgrade list (buy buttons, costs, owned counts)
- [x] Research panel (the 5-node branch)
- [x] Prestige button + confirmation + "what you keep" summary
- [x] "While you were away" screen on load

### Balance pass (IN PROGRESS — the remaining Phase 0 work)
- [x] Build a balance sim of the cost/yield curve (`npm run sim` — drives the real
      engine with a greedy auto-player; reports milestone timeline, resource curve,
      meta-loop generation times, and longest wall)
- [x] Fix the money/compute decoupling the sim exposed (run cost + payout now scale
      with Compute production — the GDD triangle actually works)
- [x] Re-gate prestige on the Inference API capability (climb research → deploy → ship)
- [x] Tune so first prestige lands at a satisfying point (~12.5m), meta-loop compounds
      (Gen 2 ships in ~1.5m via ×3.25 boost), no walls (longest 0m55s)
- [ ] **First-session playtest by owner → FUN GATE** (owner's call — not Claude's)

> **Status:** Phase 0 is feature-complete and balanced to a defensible first pass.
> 35 tests pass; build clean. The ONLY remaining Phase 0 item is the owner fun-gate:
> play it (`npm run dev`) and decide if the loop is compelling without art.
> Tools: `npm run dev` (play), `npm run sim` (balance report), `npm run shot` (screenshot).

### Owner-directed polish (done in Phase 0, pure UI — no later-phase systems)
- [x] Premium liquid-glass redesign (iOS 26 feel, Airbnb-clean), animated aurora
- [x] Rolling number counters, ship-celebration moment, synthesized sound + haptics
- [x] Settings sheet (Sound / Haptics / Reduced-motion), persisted
- [x] Progressive disclosure (Research after first payout, Prestige after first research)
- [x] Unlock toasts + first-run coaching + newly-affordable pulse (clarity + anticipation)
- [x] First-run onboarding overlay (3-resource loop intro, shown once, satirical)
- [x] Offline-earnings projection on the WIWA screen (per-hour rates + flavor tip)
- [x] Richer number formatting ($ on money rate, /hr projections)
- [x] More satirical microcopy (taglines, footer, reset confirm, WIWA tips)
- [x] Fix: unlock toasts no longer re-fire on returning-player load (hydration guard)

### Data Market (owner-directed economy expansion — Money→Data, 3 resources intact)
- [x] Licensed vendors (Meta / Goggle / ClosedAI): safe, pricey Money→Data buys
- [x] Dark-web Bazaar: cheaper data with a passed-in risk roll → clean / poisoned / raided
- [x] Dark-web tools as a new `dataPerSec` upgrade effect (Web Scraper, Captcha Farm, Botnet)
- [x] Passive Data/sec wired through derive + tick; shown in ResourceBar + Lab Stats
- [x] DataMarketPanel with a deliberate dark tonal shift for the Bazaar; outcome toasts
- [x] Engine deterministic: risk roll passed in (Math.random lives in the store), unit-tested
- [x] Revealed after first research (progressive disclosure); satirical, fictional framing

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
