# TASK.md — Singularity Inc.
*Live task list. Claude Code updates this as work progresses. One source of truth for "what's next."*

**Current phase:** PHASE 1 — Shippable MVP (the 2.5D hall + manifestation). Owner passed the Phase 0
fun-gate on 2026-06-25 and greenlit Phase 1. (Phase 0 history retained below for context.)
**Phase 0 exit gate:** PASSED — owner confirmed the loop is fun without art.

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

> **Status:** Phase 0 is feature-complete and hardened. 58 tests pass; build clean;
> sim shows first prestige ~15.5m, all research, no walls. The ONLY remaining Phase 0
> item is the owner FUN-GATE: play it (`npm run dev`) and decide if the loop is
> compelling without art. **Phase 1 (the 2.5D hall) is blocked on that gate — by design.**
> Tools: `npm run dev` (play), `npm run sim` (balance + market EV report), `npm run shot`.

> **Overnight autonomous session (hardening, no phase advance — by design):**
> Ran audit→fix→test→commit cycles entirely inside Phase 0. Did NOT start Phase 1
> (the 2.5D hall) — it's blocked on YOUR fun-gate and I won't pull it forward unsupervised.
> 1. Self-reviewed the market/heat/events diff → fixed inverted event feedback (a FINE was
>    playing the ship fanfare), a misleading clamped-fine toast, a per-tick RNG waste, reuse.
> 2. Added a Data-Market EV table to the sim and retuned the Bazaar to a real risk premium
>    (cold ~1.6 d/$ > legit; erodes to ~0.8 hot). Found the market is OPTIONAL in the current
>    curve (runs already supply enough Data) — an open design question, not silently forced.
> 3. +test coverage (heat/event edges) and ARIA on the heat meter. 
> 4. Runtime-verified fresh/market/celebrate states render and the prestige flow works.
> 5. Whole-engine audit → fixed a prestige Infinity-overflow (>1e308 poisoned legacyWeights)
>    and hardened save loading against partial/v0/corrupt saves. Deferred 4 theoretical issues
>    (documented in LEARNINGS) rather than refactor delicate offline code unsupervised.
> Net: 35→61 tests, all green; build clean; nothing crosses the phase boundary.

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

### Regulatory Heat + events (OWNER SIGN-OFF to pull forward — flagged events/heat per CLAUDE.md)
- [x] Heat (0..100) on GameState; save v1→v2 migration (cold by default)
- [x] Shady buys add Heat; dark-web tools add Heat; Heat cools passively in tick()
- [x] Raid chance ramps with Heat (effectiveRaidChance, shown live on cards); a raid cools you off
- [x] Heat-driven regulatory events (audit/subpoena/whistleblower/lobbyist), weighted; fire
      probabilistically as Heat rises. Randomness in the store (Math.random), engine stays pure
- [x] Heat meter UI in the Bazaar (tiered color) + weighty event toasts (bad/good tones)
- [x] 2 new vendors (Readit legit tier, Leaked Model Weights dark-web top tier); balance tuning pass
- [x] Heat resets on prestige (clean slate). 52 tests pass; sim shows core curve intact (~15.5m to first ship)

> NOTE: Heat + events are normally deferred past the Phase 0 fun-gate. The owner explicitly
> signed off on building them, scoped tightly to the existing Bazaar (consequence layer, not the
> general event framework). No hall/art pulled forward; still numbers-only.

---

## PHASE 1 — Shippable MVP (STARTED 2026-06-25, owner passed fun-gate)
### The 2.5D hall (the defining pillar)
- [x] Rendering decision: **Canvas 2D isometric** (parametric boxes/lights, no image assets,
      zero deps → lean Capacitor bundle). Wrapped behind a render module for a future WebGL swap.
- [x] Pure render module: `src/render/hallModel.ts` (view-model from game state) +
      `hallRenderer.ts` (iso floor + tiered rack boxes + blinking lights). No React, no engine import-cycle.
- [x] `src/ui/HallCanvas.tsx`: self-driving rAF loop (reads store directly, no React churn),
      DPR-aware, ResizeObserver, pauses on tab-hide, honors reduced-motion.
- [x] **Manifestation rule v1**: rack count per tier → boxes in the room; buying a rack pops it in
      (spawn animation). Caps drawn boxes per tier (1000 GPUs ≠ 1000 objects).
- [x] Active-run work pulse (racks glow while training); empty-state "rented closet" hint.
- [x] Era re-skin v1 (palette shifts: Garage Closet → Startup → Scale-Up) from research/ships.
- [x] Integrated as the hero stage atop the existing UI; 5 model tests (66 total). Build clean.
- [x] Era-transition tentpole moment (full-screen "press release" when you cross an era)
- [x] Richer manifestation: power-on flash when a rack boots in.
- [x] HQ parametric pass: gradient-shaded racks w/ server-unit LEDs + power column + rim light,
      floor light-spill, lit room (back walls + ceiling), depth-faded grid, data-mote particles.
- [x] Mote burst (green $ + violet data) when a payout is claimed.
- [x] Per-era hall props: wall-mounted cooling units (spinning fans, scale w/ era) + floor cable tray.
- [x] Buyable hall EXPANSIONS on the two OPEN (wall-free) sides, bought by TAPPING a glowing
      "+$cost" marker in the hall (the back two edges have walls, so they're not expandable).
      The floor grows front/right; capacity-based proportional rack layout; renderer auto-fits +
      flat-shades big halls for perf. Canvas hit-testing + hover cursor; markers pulse when affordable.

### Lightweight world events (the satire layer)
- [x] 12 satirical ambient events (buffs/debuffs + immediate % swings), written in voice.
- [x] Engine: timed modifiers on GameState (save v2→v3), folded into derive, decay in tick.
      Deterministic — fire/pick rolls passed in; Math.random lives in the store; not fired offline.
- [x] WorldEventCard (breaking-news modal) + live ModifierBar chips counting down. 9 event tests.

- [ ] NEXT: data-mote flow on claim, cooling/fan props per era, then premium IAP + Capacitor build.

## Backlog (later Phase 1 + Phase 2+)
- Premium unlock IAP; Capacitor iOS build + TestFlight (see `DEPLOYMENT.md`)
- [Phase 2+] power/heat, staff, factions, eras 4–6, multi-room hall, cosmetic store, Steam port

---

## Done log
*(append completed items with date as you go — keeps session handoff clean)*
