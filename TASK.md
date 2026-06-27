# TASK.md — Singularity Inc.
*Live task list. Claude Code updates this as work progresses. One source of truth for "what's next."*

**Current phase:** PHASE 4 — Post-launch growth (live on TestFlight). Phases 0–3 complete.
Plan: `POST_LAUNCH_ROADMAP.md` (audit-driven: balance · friendliness · interactivity · fun).
Phase 0–3 history retained below for context.
**Phase 0 exit gate:** PASSED — owner confirmed the loop is fun without art.

---

## PHASE 4 — Post-launch growth (active) · plan: `POST_LAUNCH_ROADMAP.md`
*The "five things" critical path the owner approved first. Each obeys the design spine:
3 in-run resources, pure/deterministic engine, data-in-`balance/`, hard-gated compounding,
no dark patterns. Re-run `npm run sim` after any economy change.*

### Step 1 — Foundation (R0)
- [ ] **R0.1 · Kill the 10Hz whole-app re-render** (P1) — narrow store selectors + `React.memo`
      on leaf panels; isolate the only truly-10Hz component (`ResourceBar`). Biggest perf/battery win.
- [ ] **R0.2 · Extend the balance sim to the long game** (P1) — `scripts/balance-sim.ts` long-haul
      policy (10–20 gens, buys products/versions/staff); report weights/hr + era cadence. The
      instrument that unblocks all of R4.

### Step 2 — Friendliness (R1)
- [x] **R1.1 · Advisor "Next: …" banner** — wired the already-built/tested `nextAction()` as a
      persistent, tappable banner above the stage that jumps to the resolving tab. UI-only (sim
      byte-identical, 12m15s); +1 invariant test (the banner can never point at a locked tab). 250 tests.
- [x] **R1.2 · Buy ×1 / ×10 / Max** — segmented selector in the Hardware panel; pure engine
      `planBulkUpgrade` / `buyUpgradeBulk` (simulate real buys → exact total cost, honor
      affordability + floor space + rack auto-eviction; Max capped at floor). Cards show the batched
      total + "×N" for the qty that will actually buy. +5 tests; UI/engine-additive (sim 12m15s).
- [x] **Bonus · "Recommended next" = best value, not cheapest** — fixed the panel hero surfacing a
      strictly-worse rack (+2/s $106 over +12/s $220). New pure/tested `recommendedUpgrade()` scores
      by marginal money-equivalent throughput per cost. +4 tests.

### Step 3 — The hall (R2)
- [ ] **R2.1 · Tappable, inspectable racks** (P1) — tap a rack → parametric callout + satirical name.
- [ ] **R2.2 · Fix manifestation-rule violations** (P1) — overclock/cooling/auto/staff/products
      get a physical echo in the hall.
- [ ] **R2.5 · Juice the rack-buy moment** (P1, S) — wire `punch()` + burst + "+X/s" floater to buys.

### Step 4 — Endgame balance (R4 — do after R0.2)
- [ ] **R4.1 · Tame the Legacy snowball** (P1) — make `legacyMult` diminishing so Gen2/3 don't
      collapse to sub-minute ships. Re-sim.
- [ ] **R4.2 · Close the retire→relaunch windfall** (P1) — lower `retireValuationSec` (1800 → ~300–600).
- [ ] **R4.3 · Re-couple the triangle** (P1) — late-game Compute/Data/Money sinks (reservoir cap /
      data freshness decay / infra maintenance). Model in the R0.2 sim first.

### Step 5 — Depth (R5)
- [x] **R5.1 · Activate the dead `alignment` dial** — was set by faction choices but read nowhere.
      Now a real, data-driven strategic fork (`balance.alignment` + pure `src/engine/alignment.ts`):
      **accelerationist** trades money for compute and runs hotter (+Heat on shady buys);
      **doomer** trades compute for money and stays clean (−Heat). Folded into `derive` (compute/$
      tilt) + the two Heat sites; surfaced as "Stance effects" in Lab Stats so it's legible.
      Hard-gated — neutral (0) is identity, so the sim is **byte-identical** (12m15s). +6 tests.
      ↳ Follow-up (optional): alignment→Reputation-gain and alignment→product-acquisition forks.
- [ ] **R5.2 · Contracts / quests board** (P1) — rotating `contracts[]` in balance, pure fold in
      `tick`, Reputation/Money payouts; persisted like achievements.

> Full R0–R8 backlog (R3 active-engagement, R6 replayability, R7 content waves, R8 platform)
> lives in `POST_LAUNCH_ROADMAP.md`.

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
- [Phase 3] **"Ship It" AI Product/Deployment system** — ✅ **SHIPPED (M1→M4)**, see the
  2026-06-25 done-log entry below. Design in `PHASE3_PRODUCTS_PLAN.md`.
- [Phase 3+] **Per-token / usage-billed product mode** (owner decision 2026-06-25):
  a distinct revenue model where income scales with compute *served* rather than
  seat count, sitting alongside the subscription model. Deferred to keep the
  current model legible; build after launch if it adds depth without clutter.

---

## Done log
*(append completed items with date as you go — keeps session handoff clean)*

### 2026-06-25 — Phase 3 "Ship It" Products system (full build, M1→M4)
- [x] **M1 — Products engine core.** Pure/deterministic `src/engine/products.ts` + balance data
      `src/engine/balance/products.ts` (6 model types: general/code/reasoning/multimodal/small/domain,
      each with TAM/ARPU/churn/conversion/computePerUser/virality/hype/heat). `simulateProducts`
      models frontier drift, paid+organic acquisition (CAC rises with saturation), conversion,
      staleness/price churn, and margin. Save v5→v6 migration; persists across prestige. Products
      cost Compute+Data to build/version and earn Money to operate (no 4th resource).
- [x] **M2 — Tab nav + portfolio + release flow.** Lab/Products tab switcher (Products tab appears
      after first ship); type-picker release modal; portfolio header (MRR / net / slots).
- [x] **M3 — Deep dashboard.** Per-product cards: MRR/subs/MAU/churn/margin, competitiveness bar
      vs the rival frontier, price slider, marketing dial, push-version button.
- [x] **M4 — Competition, juice, persistence.** Launch tentpole modal (`ProductLaunch.tsx`,
      satirical press release); staleness-nudge toast when a product slips <50% competitiveness;
      two market world events (`competitor_launch` jumps the frontier, `industry_hype` buzzes all
      live products); rename a product (✎); **retire now pays a one-time buyout** (≈30min of MRR) —
      a real "cash out vs keep earning" call. Validated economics via `scripts/balance-sim.ts`
      `runProduct` scenarios. 18 product tests (140 total). typecheck + build clean.

### 2026-06-25 — Phase 3 product BUSINESS expansion (ship→product→research)
Owner-directed: make shipping start an AI product, deepen the Products page, add timed
upgrades + a full Employees page. Built on branch `claude/phase3-product-business`.
- [x] **Ship deposits a draft model.** Prestige drops a "raw model" in Products (quality =
      frontier at ship). `launchDraft` commercialises it (pick market, pay) → product starts at
      the shipped model's quality. Manual release replaced by the draft flow.
- [x] **Timed version upgrades.** `startUpgrade` pays upfront; `advanceUpgrades` drains the rest
      over a research window (escalates w/ version); stalls if broke; completes → frontier catch-up
      + buzz. Offline-capable. UI: live progress bar + ETA; completion celebration.
- [x] **Employees page.** Dedicated tab. Infra team (Compute/Data/Money lanes) + Product team
      (ML=research speed, SRE=serve cost, Success=churn, Growth=acquisition) folded into the sim
      via derive.productMods. Headcount + payroll + active buffs headline.
- [x] **Product detail screen.** Tap "details ▸" → metric grid, penetration/competitiveness bars,
      pricing/marketing workbench, version-research roadmap (3 deep), retire.
- [x] **Milestones.** 12 portfolio goals w/ one-time Money rewards, persisted; grid UI + 🏆 toasts.
- [x] **Ops events.** Per-product outage/viral/breach/press/price-war one-shots; 🎲 toasts w/ tone.
- Save v6→v7 (drafts + upgrades + milestones). 174 tests; typecheck/build/sim clean.

### 2026-06-25 — Phase 3 depth follow-ups (post-#10 merge)
- [x] **Era-gated product types.** Not all 6 model types unlock at once — premium high-ARPU
      types arrive as you ship (Ship 1: general/code/small · 2: multimodal · 3: reasoning ·
      4: domain). `unlockAtShips` per type + `typeUnlocked()`; the picker shows 🔒 + "Unlocks
      after shipping N models". Reinforces "hard early, compounds later".
- [x] **Churn-reason flavor toasts (M4 juice).** When a product is materially shedding subs, an
      occasional satirical quip names the dominant reason — **stale** (rivals pulled ahead) vs
      **pricey** (the dial is cranked too high). Pure `churnReason()` + RNG-parameterized
      `maybeChurnFlavor()` in the engine (deterministic, like `maybeHeatEvent`); cadence + rolls
      live in the store's `notice` channel; App surfaces it with a light tap (not the heavy
      regulatory warn). Makes "update or bleed" legible + funny. +9 tests (155 total).

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

---

## Phase 3 audit fixes + polish (post product/employee redesign)

### Audit pass (critical bugs + perf)
- [x] **Drag stale-closure fix:** EmployeeBoard pointer handlers were re-bound every 10Hz render,
      capturing stale `onAssign`/`onSelect` mid-drag → a drop could mis-assign. Now ref-stable
      handlers + memoized zone grouping + per-zone render cap.
- [x] **Sim hardening:** `simulateProducts` clamps billed seconds to `mau·seconds` (no over-billing);
      `channelAcq` falls back to 100% ads on a degenerate mix (no wasted spend); `sanitizeChannelMix`
      keeps only known channel ids.
- [x] **Perf:** one memoized `productMetrics` pass per render (was up to 3×/product ×10Hz); cross-tick
      `computeStaffEffects` memo in derive (keyed on stable employees ref + morale + product set);
      memoized roster splits; collapsed milestones.

### P1 polish batch
- [x] **A5 — inline rename:** new `EditableName` component replaces `window.prompt` (bad on iOS) in
      the product card + detail header. Commits on Enter/blur, cancels on Escape.
- [x] **A1/B4 — advisor:** new pure `src/engine/advisor.ts` (`nextAction`/`attentionCounts`,
      7 tests) powers a single "do this next" nudge bar + small per-tab attention badges. Signals are
      deliberately conservative & unambiguous (draft waiting *with a free slot*, empty portfolio →
      ship, stale product, first hire). Tapping the nudge jumps to the right tab.

### P2 batch (B1 / B2 / B5 / C1)
- [x] **B1 — diminishing-returns hiring (BALANCE):** `computeStaffEffects` now ranks each lane's
      contributors by raw output and weights the k-th at `1/(1 + k·perLaneRate)` (`balance.staff.
      diminishing.perLaneRate = 0.18`). Output diminishes, payroll does NOT → a small, trained,
      high-trait team beats a wall of juniors. 1–2 hires ≈ unchanged; at 80-on-one-lane acq is
      ~2.25× (was 7.4× linear) while you still pay 80 salaries. `npm run sim` unchanged (first
      prestige ~12m, longest wall 1m05s — the sim doesn't model staff, so the lab curve is intact).
      3 new staff tests (diminishing, per-head falloff, seniority > headcount).
- [x] **B2 — role-summary strip:** compact "N RoleName" chips on the Employees → Team pane (memoized),
      so a big roster is legible at a glance.
- [x] **B5 — suggest mix:** pure `suggestChannelMix(p, t)` weights channels by acquisition efficiency
      (1/effective-CAC) at the current penetration; "✨ Suggest mix" button on the Marketing tab applies
      it. Cheap channels lead early, budget shifts as they saturate. 2 new tests.
- [x] **C1 — dead-field cleanup:** removed `products.assignments` (superseded by per-Employee
      `assignedProductId`). Save v7→v8 migration strips it; retire now frees crew via their own
      `assignedProductId`. 1 new migration test.

---

## Phase 3 — Endgame & spectacle (plan: PHASE3_ENDGAME_PLAN.md)

- [x] **Step 0 — Lifetime Stats store:** persistent, monotonic cross-run counters (peak compute/MRR/
      MAU, totals, ships, legacy, hires, events, playtime, ascensions). accrueStats folded per tick +
      event-site bumps. Save v8→v9 backfill. The data backbone for everything below. 5 tests.
- [x] **Step 1 — Achievements:** 37 badges across scale/business/team/legacy/meta (+2 secret), pure
      detection over the stats store, persist across prestige (save v9→v10), toast on unlock,
      AchievementsModal (topbar trophy + count, category filter, progress bars, masked secrets). 6 tests.
- [x] **Step 2 — Era 6 Post-Singularity / AGI:** 6th era (agiAtShips=9) + iridescent hall palette;
      ascension = a ship in the AGI era past a Legacy floor → permanent compounding ascensionMult
      (1+n·0.08) in derive; bespoke AGI era-transition + AGI banner/✦Ascend button in Prestige. Hard-
      gated (ascensions=0 until deep endgame) so the curve is untouched (sim unchanged). 12 tests.
- [x] **Step 3 — Lab Reputation:** second meta-currency = earned−spent (earned is pure from
      achievements+ships+ascensions, only `spent` stored → can't desync); 8-perk tree w/ prereqs
      folded into derive (compute/data/money/payroll); persists through prestige+ascension (save
      v10→v11); ReputationModal from a Prestige strip. Curve-safe (no perks owned at run start). 8 tests.
- [x] **Step 4 — Polish & ship-prep (dev side):** adversarial diff-review of the 3 new economies →
      fixed passive-money legacy²/ascension² squaring (curve-neutral, sim byte-identical), scraper
      lane missing rep.dataMult, and achievement-toast coalescing; CLAUDE.md phase line + docs updated;
      readability pass (plain-language all business jargon for new players). 232 tests green.
      ↳ REMAINING (owner action): run **Actions → iOS TestFlight → Run workflow** to ship to phones
        (merging ≠ shipping — see CLAUDE.md).

> Curve discipline held throughout: every Phase-3 compounding term (ascension, reputation perks) is
> hard-gated to the endgame, so `npm run sim` first-prestige stays ~12m / wall 1m05s across all of it.
