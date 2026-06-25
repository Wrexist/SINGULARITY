# TASK.md — Singularity Inc.
*Live task list. Claude Code updates this as work progresses. One source of truth for "what's next."*

**Current phase:** PHASE 1 — Shippable MVP (the 2.5D hall + manifestation). Owner passed the Phase 0
fun-gate on 2026-06-24 and greenlit Phase 1. (Phase 0 history retained below for context.)
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
>
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

## PHASE 1 — Shippable MVP (STARTED 2026-06-24, owner passed fun-gate)
### Content + balance
- [x] Deepened research tree: 5 → 11 nodes, branching across the 3 eras (mixed_precision, data_aug,
      rlhf, KV cache, MoE, scaling_laws), with a proper capability gate (inference_api needs
      distillation + rlhf) and an optional post-ship power branch. Panel reveals in waves.
- [x] Era-1 threshold bumped to 3 research nodes.
- [x] Balance pass via `npm run sim`: re-tuned late-gate costs after the deeper tree sped the
      snowball; first ship ~10.5m, no walls (0m55s), meta-loop compounds, Bazaar EV premium intact.

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
- [x] Tapping a marker opens a CONFIRM/DECLINE popup (name, what it adds, cost, affordability)
      before spending — no accidental purchases from touching the floor.

### Lightweight world events (the satire layer)
- [x] 12 satirical ambient events (buffs/debuffs + immediate % swings), written in voice.
- [x] Engine: timed modifiers on GameState (save v2→v3), folded into derive, decay in tick.
      Deterministic — fire/pick rolls passed in; Math.random lives in the store; not fired offline.
- [x] WorldEventCard (breaking-news modal) + live ModifierBar chips counting down. 9 event tests.

### Shipping (Capacitor → TestFlight, Mac-less via CI) — cheapest path, mirrors Silicon
- [x] Capacitor added (@capacitor/core/cli/ios) + `capacitor.config.ts` (appId com.wrexist.singularityinc).
- [x] GitHub Actions `ios-testflight.yml` (macos-26): build web → `cap add/sync ios` → xcodebuild
      AUTOMATIC (cloud) signing via ASC API key → altool upload. NO Fastlane/Match (cheaper, simpler).
      Improvements over Silicon: team id from secret, auto export-compliance + build-number, tag trigger.
- [x] IAP plumbing (`src/ui/iap.ts` + `src/state/premium.ts`) behind a stable interface.
- [x] Premium unlock UI in Settings (one-time, cosmetic/QoL only — GDD §9): perk = 24h offline cap
      (engine stays pure; applyOffline takes capHours), Founder badge, Restore. Purchase is a local
      STUB that grants instantly until StoreKit is wired.
- [~] PENDING (owner): create the App Store Connect app record (bundle com.wrexist.singularityinc),
      then run the workflow. No extra secrets needed. First run UNVERIFIED — will need iteration.
- [x] Wire the real StoreKit purchase: `cordova-plugin-purchase` (CdvPurchase v13), self-contained
      on-device (no billing backend), behind the existing `iap.ts` interface; web/dev keeps the stub
      so tests/QA still run. Build + 97 tests green. ⚠️ Native path needs DEVICE verification once the
      ASC product exists — runbook added to DEPLOYMENT.md §5b.
- [~] PENDING (owner): create the `com.wrexist.singularityinc.premium` non-consumable in ASC +
      Paid Apps agreement, then device-test the purchase/restore with a sandbox tester.
- [x] App Store metadata package (`appstore/`): ASO-optimized name/subtitle/keywords (counts verified),
      promo + 4000-char description, release notes, categories, 12+ age-rating answers, "Data Not
      Collected" privacy + hostable privacy policy, IAP listing, screenshot plan, review notes, and a
      parametric app-icon concept (`icon-concept.svg`). Paste-ready + Fastlane-deliver layout.
- [x] Marketing screenshots: `scripts/store-screenshots.mjs` → six 1284×2778 Liquid-Glass framed shots
      (`appstore/screenshots/`), curated to show an abundant, aspirational lab.
- [x] GitHub Pages marketing site (`docs/`): Liquid-Glass landing + privacy + support, animated aurora,
      glass cards, screenshot gallery, scroll reveals (fail-safe). Serves the privacy/support URLs.
- [~] PENDING (owner): enable GitHub Pages (Settings → Pages → Deploy from branch → main, `/docs`) so
      the privacy/support/marketing URLs go live; render `icon.svg` → 1024 PNG; create the ASC app record.

## PHASE 2 — Depth wave (STARTED 2026-06-24, owner go-ahead post-launch-prep)
*Plan: `PHASE2_PLAN.md`. Each system ships behind a `balance.<system>.enabled` flag.*
- [x] **P2-A Power & Heat (LIVE):** racks draw power; over-subscribe → Compute throttles
      (soft cap, floored at 25%). 3 capacity upgrades (PSU/cooling/substation), a Power meter in
      the Hardware panel, power-aware sim. First ship 12m48s, no wall. 6 tests.
- [x] **P2-B Staff & Payroll (LIVE):** Researcher/Engineer/Ops multiply a lane, cost Money/sec
      payroll (over-hire tension). No save migration (counts in upgrades map). Staff panel revealed
      after first research. Opt-in — sim unchanged. 5 tests.
- [x] **P2-C Eras 4–5 + multi-room hall (LIVE):** Frontier Lab (teal) + Hyperscaler (indigo) reskins,
      ship-gated. Multi-room: renderer splits the expanded floor into 2/4 rooms with glowing glass
      partitions + lit walkways (pure-renderer, no engine/save change). Room count in the hall tag.
- [x] **P2-D Factions + event engine (LIVE):** persisted alignment (−1..1, save v3→v4), two-choice
      faction events (effect applied on pick + alignment shift), alignment in Lab Stats. 5 events.
- [ ] Cosmetic IAP store (themes/skins/lab name) — after the systems land, if retention justifies.

## Backlog (later Phase 1 + Phase 2+)
- [Phase 2+] power/heat, staff, factions, eras 4–6, multi-room hall, cosmetic store, Steam port

---

## Done log
*(append completed items with date as you go — keeps session handoff clean)*

### 2026-06-24 — UI visibility/glitch + difficulty pass (owner-directed, from TestFlight screenshots)
- [x] **Fixed stuck toasts** (the "pop-ups never leave the screen" bug). Root cause: the game
      re-renders ~10×/sec (10 Hz tick) and `Toast`'s dismiss-timer effect depended on the parent's
      `onDone` identity, which changed every render → the timeout was cleared+restarted forever and
      never fired. Fix: hold `onDone` in a ref so the timer keys only off the toast id; also made
      `pushToast`/`dropToast` stable with `useCallback` and capped the stack to the latest 3.
- [x] Toast stack z-index dropped below modal/sheet backdrops so an open pop-up covers toasts
      instead of them piling on top of the card you're reading.
- [x] **Dark-blue cleanup (all four, owner-confirmed):** neutralized the modal/sheet/celebration
      backdrops (charcoal scrim, no navy cast); lightened + de-saturated the hall room palette
      (`ERA_BG`/`ERA_FLOOR`) and softened the hall edge vignette; dialed the aurora blobs down
      (0.5→0.22 opacity); relit the dark Data Bazaar into a light lavender card and fixed all its
      light-on-dark text (heat meter, vendor/shady tags, risk lines) for the light theme.
- [x] **Readability:** darkened secondary ink tokens (`--ink-2`/`--ink-3`) for contrast on glass.
- [x] **Hall perf:** cached the static room (sky+walls+floor) to an offscreen buffer (blitted each
      frame instead of rebuilding ~a dozen gradients + the whole floor grid 60×/sec) and capped the
      canvas to ~30fps. Split `drawHall` → `drawHallStatic` + `drawHallDynamic`.
- [x] **Rack capacity = floor space (new rule):** racks (all tiers, shared) are now gated by the
      2.5D floor's tile count — you must expand the hall to buy more. New pure `src/engine/hall.ts`
      (`hallCapacity`/`totalRacks`/`floorFull`, shared by engine + renderer to avoid a cycle);
      `canBuyUpgrade` blocks racks when full; UpgradePanel shows a "Floor space: n/cap" meter and a
      "Floor full" reason on blocked rack cards. 5 new tests (95 total).
- [x] **Rack auto-replace (anti-softlock):** on a FULL floor, buying a higher-tier rack upgrades
      in place by evicting the lowest lower-tier rack you own (no money refund — the evicted tier's
      count just drops, making its rebuy cheaper). You're only hard-blocked (must expand) when the
      floor is full of equal-or-higher tiers. Cards show "↑ replaces a lower-tier rack" upfront so
      it's never a silent surprise. Chosen over a sell button: zero extra taps, no UI clutter, no
      softlock, no exploit. Engine: `evictableRackFor`/`rackTier` in `hall.ts`; 2 new tests.
- [x] **Difficulty pass (verified via `npm run sim`):** the floor cap IS the difficulty lever.
      First experiment also nerfed payouts + cost growth → sim showed first-prestige UNREACHABLE in
      240m (hard wall), so those economy nerfs were REVERTED. Floor cap alone moves first-ship from
      ~10.5m → ~14.8m (≈40% longer) + adds strategic floor management, with longest wall 0m55s and a
      compounding meta-loop. Beatable + smooth + harder. NOTE: after adding rack auto-replace
      (which softens the cap — the optimal player keeps a full best-tier floor), re-tuned payouts to
      dataPerCompute 0.28 / moneyPerCompute 0.45 to restore the difficulty: sim now first-ships
      ~12m11s with longest wall 1m05s and a healthy meta-loop (Gen2 ~1m, Gen3 ~55s).
- [x] Updated `scripts/balance-sim.ts` to model the floor cap: the greedy player now BUYS hall
      expansions when the floor fills and prefers the highest-tier affordable rack (filling permanent
      slots with cheap consumer cards was tanking the modeled income and faking a wall).
