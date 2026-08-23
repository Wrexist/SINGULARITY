# TASK.md — Singularity Inc.
*Live task list. Claude Code updates this as work progresses. One source of truth for "what's next."*

**Current phase:** PHASE 4 — Post-launch growth (live on TestFlight). Phases 0–3 complete.
Plan: `POST_LAUNCH_ROADMAP.md` (audit-driven: balance · friendliness · interactivity · fun).
Phase 0–3 history retained below for context.
**Phase 0 exit gate:** PASSED — owner confirmed the loop is fun without art.

---

## Depth batch (2026-08-21, from the parallel-audit wave) — uncommitted on `master-agentic-development`
*The gameplay-depth audit's top curve-safe proposals, shipped. Every new path is
gated behind a player-only action the sim never takes (stake/respec/charter/trial),
so the tuned curve is untouched — VERIFIED: `npm run sim` re-run byte-identical to
the morning baseline (29m35s / Gen2 16m47s / Gen3 12m55s · market 32m20s · wall 38s ·
same long-haul table + era arrivals). SAVE_VERSION 31→32 (+migration+sanitizers).*
- [x] **Frontier Race stakes** — wager Lab Reputation on outranking ONE named rival
      before your next ship (Products → leaderboard): win pays by rival weight tier
      (+6/+4/+2 Rep), loss pays nothing, one wager per run, resolved at prestige via
      pure `resolveStakeOutcome` → `stats.stakesRepEarned` → `earnedReputation`. The
      race is finally winnable AND losable for something that matters.
- [x] **Charter conviction ladder** — consecutive same-charter ships now escalate:
      ×1.15 → ×1.25 → ×1.40 capped (`charterStreak` persisted; CharterPanel shows the
      live rung). A push-your-luck identity layer on an existing free choice.
- [x] **Endowment Directive respec** — refund one claimed doctrine for an escalating
      Reputation fee (20 × 1.6^n); the freed pick is immediately re-choosable.
      Fixes the audit's "stack one lane forever by tier 3" collapse. Respec row in
      the ReputationModal's Directives block.
- [x] **Trial variety** — two new condition Trials extend the arc past ship 11:
      *Running Hot* (ship with Heat ≥ 60, unlock 13) and *Apolitician* (ship inside
      the ±0.4 faction band, unlock 15). `trialConditionMet` is now the single source
      for ALL conditions — prestige's inline solo-only check was replaced with it,
      so future conditions can't drift from their ship-time evaluation.
- [x] Verified: `tsc` clean · **645 tests** (+13) · built app driven headless through
      the stake flow end-to-end ("Staked vs Cortex-5 … +6 Rep") with **zero console
      errors** · balance sim byte-identical (above).

---
## Delight batch (2026-08-21, from the parallel-audit wave) — uncommitted on `master-agentic-development`
*Fun/content audit findings, all shipped. Renderer/UI/audio only — zero engine math
touched (notices.ts pools are pure data; the sim never reads them).*
- [x] **Ascension super-ceremony** — an AGI-ascension ship now gets its own tier
      everywhere: dedicated headline ("The Singularity Files Its Own Press Release")
      + subtitle branch in `headlines.ts` (unit-tested, outranks even #1 rank),
      a gilded card (gold edge/glow/rocket via `.celebrate-card.ascended`), all-gold
      confetti at double density (26→48). Reduced motion keeps the gold card, skips
      confetti (as before).
- [x] **Stinger trio** (`sound.ts`, ~15 lines each on the existing `tone()` recipe):
      `megaproject()` rising-fifth run replaces the generic `success` on cycle
      completion; `institute()` warm sustained chord replaces `purchase` for wing
      founding; `incidentCleared()` bright two-note resolve fires when the LAST bad
      modifier resolves (App watches the modifier set; prestige wipes don't count).
- [x] **Thin-pool content top-up** — ship subtitles 6→14, MODEL_READY 6→10,
      research-start tails 5→10, sold/hire/fire tails to 10 each. These are the
      highest-frequency strings in the game; all were exhausted within a sitting.
- [x] **Day/night music shading** — `setMusicDaylight(phase)` beside `setMusicEra`:
      night eases the pad ~28% quieter with the filter closed ~35% and the chorus
      detune flattened; dawn reopens it. Smooth `setTargetAtTime` ramps driven from
      App at 24 phase buckets (~every 10s) using the renderer's day phase.
- [x] Verified: `tsc` clean · **632 tests** (+1 ascension-tier test) · full suite green.

---
## Safety batch (2026-08-21, from a 4-way parallel audit) — uncommitted on `master-agentic-development`
*Audit wave 1 of the owner's "audit everything, then improve" directive: UI/UX · code
health · gameplay depth · fun/content agents ran in parallel; this is the code-health
MUST-FIX list, all shipped. Sim untouched by construction (sanitizers are load-path
only; the derive change is comment-only).*
- [x] **IAP failure paths** — `iap.refresh()` no longer surfaces a StoreKit/network
      init failure as an unhandled rejection at launch (log-only, later buy/restore
      still retries); SettingsSheet buy/restore catch init throws and SAY SO
      ("Store unreachable…", "Purchase didn't complete — you haven't been charged.",
      "No previous purchase found") instead of a spinner that silently stops.
- [x] **Game-loop error containment** — `advance()` in useGameLoop now runs under
      try/catch (once-per-session log): an interval throw is invisible to the root
      ErrorBoundary and previously meant a silently frozen game + 10Hz console spam.
- [x] **Save sanitizer hardening** (crafted-save class): duplicate product ids dedupe
      keep-first (colliding React keys / find()-targeting), duplicate employee ids
      dedupe, employee `level` clamps to `balance.staff.maxLevel` (was ≥1 only — a
      crafted 1e9 minted a ~1e9× staff multiplier via the uncapped linear level
      effect), unknown roleIds drop / unknown traits null (filter-don't-wipe), and
      draft `quality` clamps to PROD_CAPS.quality (launchDraft bypassed the clamp →
      a crafted 1e300 launched a permanently ∞/NaN-bricked product).
- [x] **Run-yield double-apply guardrails** — the DELIBERATE global-mult² behaviour
      (legacy rides runComputeCost AND the yield mults) now has a comment at the
      return site plus magnitude-pin tests: lane event modifiers apply exactly once;
      global mults scale yields SQUARED. A future "cleanup" can't silently retune.
- [x] **Purity guardrail extended** — engine scan now also rejects localStorage /
      window / document / fetch (call-shaped patterns; doc prose can't trip it).
- [x] Verified: `tsc` clean · **631 tests** (+7: 4 save-sanitizer, 2 yield pins,
      1 platform-purity guardrail) · built app driven headless through load → ticks
      → autosave → settings sheet with **zero console errors**.

---
## Living Hall pass (owner-directed 2026-08-21, "more graphics and fun") — uncommitted on `master-agentic-development`
*Renderer-only aliveness wave: the hall now has a day/night cycle, incident weather,
reactive staff, and a claim shockwave. Zero engine files touched → the tuned curve is
untouched by construction (sim not re-run; nothing for it to see).*
- [x] **Day/night cycle + stars** — a ~4-min ambient loop driven by the RENDER clock
      (`dayPhase`/`nightFactor`, pure + unit-tested): era sky lerps toward deep night,
      a deterministic star field fades in above the horizon (occluded correctly by the
      skyline, hidden while a storm's clouds are up), rival tower windows dim at night
      and the home beacon burns brighter. Static-layer repaints quantised to 48
      phase buckets (~one per 5s worst-case); reduced motion freezes the sky at day.
- [x] **Incident weather** — an active BAD modifier overcasts the sky band always
      (state without motion), and with motion on adds slanted rain streaks plus a
      deterministic double-strobe lightning flash (`lightningFlash`, unit-tested).
      Weather is meaningful (tied to real state), never random noise.
- [x] **Agents react** — roamers drift toward a smoking incident rack (bounded pull,
      shared `agentSpots` so draw + hit-test stay in lockstep), and a ready-to-claim
      lab makes staff bounce on their toes instead of idly swaying. Both unit-tested;
      reduced motion keeps them still.
- [x] **Claim shockwave** — an expanding iso floor ring races out from the room centre
      under the existing claim sparks (same 950ms envelope).
- [x] Verified: `tsc` clean · **624 tests** (+6) · built app driven headless
      (day-storm + night captures via a one-off Playwright script, since deleted) with
      **zero console errors**. three.js was considered and deliberately declined:
      live-iOS perf/bundle risk vs. the established parametric Canvas style.

---
## IDEAS.md audit → full implementation (owner-directed 2026-07-04, "do everything you recommend") — branch `claude/game-design-audit-incbe8`
*The design/UX audit (IDEAS.md, same branch) was implemented in full overnight: 3 quick wins +
copy sweep + all 10 feature ideas. Every step verified (tests / typecheck / build / browser
captures); every curve-adjacent change sim-checked BYTE-IDENTICAL (57m59s/62m17s · wall 1m05s).
440→520 tests.*
- [x] **Quick wins + copy sweep.** (1) `@capacitor/haptics` wired through the designed seam —
      the whole haptic layer was silent on iOS (web Vibration API no-ops there); Taptic mappings
      per tier, light-mode steps impacts down, web fallback kept. ⚠️ wants a device check on the
      next TestFlight build. (2) Cooling-fan BLADES moved to the dynamic layer (shared geometry
      helper) — fans actually spin now. (3) Open-source ship mode confirms via ConfirmSheet with
      an explicit "no product draft next run" warning. (4) Awards badge counts NEW unlocks since
      last open (was a permanent lifetime total). (5) Celebration/EraTransition confetti gated on
      reduced motion + the setting seeds from OS `prefers-reduced-motion` on first run.
      (6) Onboarding no longer promises tabs that don't exist at gen 0.
- [x] **#1 Bare Metal** — Rig Bay components manifest ON the racks: post-unlock every rack shows
      its component bays on the left face; an EMPTY bay is a dark open socket (the fleet visibly
      wants parts), fitted bays grow per-class geometry (heatsink fins / spinning rack fan / lit
      cable trunk with data pulses), glow-tinted by grade. HallModel carries a per-tier rig view
      (null pre-unlock → the reveal is a visual moment too). Renderer-only, curve-free.
- [x] **#2+#7 People with identity** — Supervisor Chen patrols the floor once scrutiny is a named
      tier (tap → status card + how to cool it); floor agents map 1:1 to real employees
      (team-tinted, golden sparkling 10×, product-assigned staff cluster at their product's beam;
      tap → name/role/level/trait card). Shared `agentSpots`/`chenSpot` keep draw + hit-test in
      lockstep. Screenshot harness grew a `--chen` mode.
- [x] **#3 Loading dock** — unmarked black crates stack by the entrance while regulatory Heat is
      up (count ∝ heat, melts as it cools — the "cold trail" made visible); component buys dolly
      a pale crate in along the front edge (transient, reduced-motion-safe).
- [x] **#8+#4+#6 Static-layer set** — charter hangs as a colored monogram banner on the back
      wall; the five rivals are horizon datacenter silhouettes (height = market share, windows go
      dark when press-blitzed, your violet beacon tower joins post-ship); the **Legacy Wall**:
      every prestige appends `{mode, era, ascended}` to a new `shipLog` (capped 24; sanitizer
      caps at lifetime ships so crafted saves can't fake trophies) rendered as era-tinted
      wall-mounted plinths, gold-ringed on ascensions — prestige leaves a permanent trace.
- [x] **#5 Incident theater** — every BAD timed modifier smokes on a deterministic rack (red warn
      blink; reduced motion = static haze); good events draw a crowd of onlookers at the front
      lip. Tapping the smoking rack "works the problem": engine `workProblem()` shaves a flat
      `worldEvents.workShaveSec` (12s) once per incident — tap-gated + bounded, curve-safe by
      construction (the sim never carries modifiers).
- [x] **#9 Sponsor contracts** — the board never dies: post-ladder, one deterministic date-seeded
      objective per local day (lane/mult/satirical sponsor by day hash; target ANCHORED at roll
      time = beat-your-best-by-20–40%). Reputation-only (flat 6); completions stored as
      `sponsor_<dayNumber>` (pattern-validated, deduped, bounded 400; rep re-read from balance,
      never the save). Rolls on mount/60s/foreground alongside the daily-boost check.
- [x] **#10 Frontier preprints** — research never goes inert: tree complete → a repeatable
      "publish a preprint" hero card (rotating satirical titles, cost 250K/15K ×1.9^papers × the
      difficulty knob, ×1.02 all lanes per paper, HARD cap 10/run ≈ ×1.22 ceiling, reset by
      prestige). derive folds `preprintMult` (identity at 0) → **sim byte-identical, verified**.
- [ ] **Owner actions:** run the iOS TestFlight workflow (the haptics + everything above need a
      real-device pass: fans/bays/Chen/crates on device, Taptic feel, `cap sync` picks up the new
      plugin automatically on CI); then the standing items (notifications plugin batch, telemetry
      read) from the list below.

## App review: debug + de-noise + wayfinding (owner-directed 2026-07-02) — branch `claude/app-review-improvements-jad29r`
*Owner ask: review the app, find critical issues/bugs, restructure noisy tab pages, add experience
features. Two audit passes (engine + UI) ran first; every shipped fix was verified end-to-end
(Playwright drive: sell-cancel keeps sheet, sections navigate, reset confirm works).*
- [x] **Lab tab restructure** — the Lab stacked 11 panels in one scroll (the noisiest page; Ship the
      Model stranded mid-scroll). Now three sub-sections behind a sticky segmented switcher:
      **Build** (hall/dock/charter/hardware) · **Research** (tree + data market) · **HQ** (prestige,
      contracts, stats, codex, activity log). Switcher appears when Research unlocks (reveal in waves);
      only one section renders at a time (≈3× less 10Hz render work on the tab). HQ shows the golden
      Ship pill when a prestige is ready; the ship-badged Lab nav lands on HQ; post-ship the Lab
      resets to Build. Products: market leaderboard now defaults collapsed (reference, not control).
- [x] **Advisor nudge chip** — the engine's `nextAction()` existed, was tested, and was never wired
      into the UI. It's now a one-line tappable chip under the daily bar that navigates to the exact
      tab AND Lab section that resolves it (AdvisorItem grew an optional `section`).
- [x] **Engine bug fixes (audit-driven)** — Big.format tier-boundary bug ('1000K' → '1M', +1 test);
      one malformed product on load wiped the whole portfolio → per-entry filtering (test re-pinned);
      offline summary could report capped:true with 0ms applied on non-finite elapsed; milestone
      rewards + retire payouts never reached `stats.totalMoney` (all-time earnings under-reported →
      totalMoney-gated unlocks harder than tuned). **Sim re-run: byte-identical curve (58m52s /
      Gen2 14m53s / Gen3 10m27s / wall 3m05s).** 440 tests.
- [x] **UI bug fixes (audit-driven)** — new in-app `ConfirmSheet` replaces all 3 `window.confirm`
      sites (native panel froze the 10Hz loop while open → post-dismiss mega-tick); cancelling a
      product sale no longer closes the management sheet; ship Celebration and EraTransition no
      longer stack when a ship crosses an era (era waits); daily-boost bar re-checks on rollover/
      foreground; collapsed Stats/Codex panels no longer build their content at 10Hz.
- [x] **Follow-up (owner 2026-07-02): dopamine & progression pass** — (1) **Next-goal carrot**: pure
      `engine/goals.ts` (`goalCandidates`/`nextGoal`, +6 tests) scans eras + board contracts + locked
      non-secret achievements and surfaces the one closest to completion; UI = a quiet one-line strip
      whose progress fill is the background, % ticking live, tap lands where the goal resolves. Honest
      by construction (real tracked progress only; no timers, nothing to buy → no dark patterns).
      (2) **Buy juice**: hardware buys float the actual derived rate gain ("+12/s") at the tap point
      (derive before/after the synchronous action); rate-neutral buys stay quiet. (3) fx leak guard:
      burst/floatText no-op under reduced motion (nothing drains the arrays there). Sim byte-identical.
      Also (owner): removed the claim-run advisor nudge (the Claim button IS the nudge) + the chip's
      purple accent edge.
- [x] **Pre-launch unfinished-content pass (owner 2026-07-02).** Two audits (code sweep + UX walk)
      found NO dead code, NO leaked debug strings, NO unwired features — the gaps were thin flavor
      pools and silent moments. Shipped: taglines 14→40 + shuffled order (was a fixed 2-min loop on
      permanent display); ship-headline fallback 5→12; escalating upgrade satire 4→14 upgrades (and
      wired into the Data Market tools panel); +6 post-ascension contracts (rep ladder no longer
      permanently empties; appended after existing rungs → board order unchanged, sim byte-identical);
      one-time toasts for first faction tilt / auto-train online / first hire; end-of-content capstone
      lines (research tree / achievements / codex); Onboarding '\$'→'Money'; Settings about-footer
      (v1.0.0 + Privacy/Support links to the GitHub Pages site); index.html meta description;
      manifest colors matched to the light app chrome + in-voice description. package.json 0.0.0→1.0.0.
      **Owner to-dos that remain:** confirm GitHub Pages is enabled (docs/ → wrexist.github.io links
      in Settings + App Store privacy URL), and decide on research-tree deepening (23 nodes is the
      endgame ceiling — real design work + retune, not a copy fix).
- [x] **Self-review of the whole session diff (owner 2026-07-02, 8-angle review).** No critical bugs;
      9 real findings fixed: claim-waiting badge regression under Lab sectioning (claim now counts in
      Build dot + Lab nav badge; verified e2e), dead section deep-links pre-sectioning (gated on
      `labSectioned`), hardReset not resetting App-local nav (lands on Lab/Build), faction toast now
      keyed on tilt DIRECTION (a later accel↔doomer flip re-announces), one-time toasts refactored to
      a data-driven list (one row per toast; check-then-update so shared keys can't mask), nextGoal
      gated behind notice-slot visibility (no hidden 10Hz achievement scans), onBuy reuses the render
      derive, fx reduced-motion reads the settings store (no per-emit DOM query), stale ProductDetail
      cleanup + ExpandConfirm a11y parity + assorted dead-code removal. 446 tests; sim untouched.
- [x] **Opening retune + on-device fixes (owner 2026-07-02, from TestFlight screenshots).**
      (1) **"Too boring in the beginning"** → new `difficulty.upgradeCostRampLevels` (12): the
      combined costMult×upgradeCostMult ramps from ×1 at level 0 to full by 12 owned — first rack
      = $15 base (buyable in <1m), automation pulled forward (auto_claim 90 / auto_train 320 data
      flat → online ~3m40s / ~7m15s). `upgradeCostMult` 1.6→2.0 claws total length back:
      **first prestige 59m31s/64m43s (owner band held), longest wall 3m05s → 1m16s**, Gen2 ~12m,
      Gen3 ~8m. +ramp test.
      (2) **Sticky-header overlap** (screenshot 2): the sticky labnav z-fought the sticky resource
      bar → labnav is normal-flow again, and the resource bar got an opaque full-bleed slab so
      strips can't bleed through its card gaps (screenshot 1).
      (3) **"Can't close settings"** (screenshot 3): sticky sheet header with an always-reachable ✕.
      All three verified in a scripted browser drive.
- [x] **Rig Bay C1 — rack components, store & inventory (owner 2026-07-02).** Research-backed
      (genre brief + integration recon in RIG_BAY_PLAN.md): per-rack-TIER loadout templates (never
      per-rack — the genre's documented micromanagement failure), class-typed slots with ONE stat
      each (accelerator +% compute · cooling −% draw · interconnect +data/s per rack), fixed
      fully-visible catalog (11 parts, 3 grades, money only, reveal by fleet size), physical copies
      (one copy = one slot), buy-and-fit in one tap from the slot's chooser. Engine: pure
      `components.ts` (+14 tests, 460 total), save v17 + per-entry sanitizer, derive/power wiring,
      prestige-reset via fresh-spread. Hall: fitted tiers pulse brighter. Sim buys components
      (step 2b); catalog + `upgradeCostMult` 2.0→4.0 retuned the curve back into band:
      **first prestige 61m24s/62m47s · wall 1m08s · Gen2 ~13-14m · Gen3 ~10m** — with the first
      part landing ~4m40s (the new early-game decision layer). Verified end-to-end in a browser
      drive. Phases C2 (earned trophy parts), C3 (fusion), C4 (set bonuses) in RIG_BAY_PLAN.md.
- [x] **Rig Bay C2+C3 (owner 2026-07-02: "start the plan, add a lot more").** C2 trophy hardware:
      4 named parts earned from specific milestones (first ship / 1M compute achievement /
      megacluster contract / first ascension), granted idempotently in tick from persistent
      sources, SURVIVE prestige (carryEarnedComponents; bought parts still reset), visible in the
      chooser as locked "earn it" chase targets, one-time toast each. C3 fusion: 3 free copies →
      next rung up the class ladder (fusesInto; slotted copies never consumed, trophies never
      fuse). Catalog 11→15 purchasable + 4 trophies; late rungs (Dyson-Adjacent Cluster,
      Zero-Kelvin-ish Chamber, Orbital Laser Mesh); collection counter. Sim fits trophies too;
      `upgradeCostMult` 4.0→4.2 recentres: **first prestige 60m59s/62m17s · wall 1m06s**.
      +7 tests (467). E2E: fuse flow + trophy rows verified in a browser drive.
- [x] **Rig Bay C4 — matched-rig set bonus (owner 2026-07-02: "do C4").** A tier whose EVERY slot
      (2+ only — single-slot tiers can't "match") is filled with parts of one grade draws
      `setBonusPowerMult` 0.88 of its power. Deliberately an EFFICIENCY lane: the first cut (+6%
      compute) compounded through racks→money→racks and moved first prestige ~10 min (sim-caught;
      rule recorded in LEARNINGS.md). MATCHED pill in the Rig Bay tier card. Also delivered
      IMPROVEMENTS.md — 26 ranked UX/gameplay items (the owner-requested improvement list).
- [x] **Owner on-device fixes round 2 + improvements batch 1 (2026-07-02).** Fixes from TestFlight
      screenshots: (1) hire nudge now requires a LIVE product + affordable signing bonus; (2)
      training-intensity slider scales RUN SIZE (`run.focusCostFloor` 0.3 — light runs sip Compute,
      yields proportional, identity at focus 1 → curve byte-identical), dock relabeled; (3) explicit
      charter "Lock in" button (charterLocked, save v18 + migration). Improvements shipped from
      IMPROVEMENTS.md: **moment queue** (5 full-screen moments render one-at-a-time by priority),
      **first-ship explainer** (one-time, settings-persisted, gen-1 only), **heat coach toast**
      (first cross of 25), **store notice FIFO** (same-tick notices drain instead of dropping),
      **product milestones in the goal strip** (mid-game carrots → tap lands on Products), resource
      slab overdraw for iOS rubber-band. +6 tests (475). All e2e-verified in a browser drive.
- [x] **Self-review round 2 (owner 2026-07-03, 8-angle review of everything since 8ff4bba).**
      No curve or data-loss bugs. 10 findings fixed: save sanitizer now drops crafted trophy copies
      whose source milestone isn't complete (trophies reconcile against contracts/achievements like
      every other earned system) + owned copies clamped to a `maxCopies` knob; notice queue made
      strictly oldest-first (new notices no longer jump queued ones), multi-ship / multi-level-up
      ticks coalesce ("N products shipped…"), and the backlog clears on prestige + import (no stale
      replays); Onboarding waits for `moment === null` (no stacking over full-screen moments); ship
      explainer retires itself if the first ship lands before it's shown; `trainingIntensity(focus)`
      single-sourced in derive (UI label now clamps like the engine); equipComponent/RigBayPanel
      reuse `freeCopies()` (dead re-slot term removed); HallCanvas caches componentFill by loadout
      ref (was 3 tier scans per 30fps frame); advisor locked-tab sweep de-vacuized (now guarded to
      actually exercise the products/employees branches). 477 tests · sim byte-identical
      (57m59s/62m17s · wall 1m05s) · build clean.
- [x] **"Do all" wave (owner 2026-07-03) — the six planned improvements, each verified + committed:**
      1. **Prestige share card** (#2): runtime-drawn 1080×1350 Generation Report PNG (headline,
         stat grid, era; zero image assets) → Web Share API with text/download/clipboard fallbacks;
         Share button on the Celebration pauses its auto-dismiss. Rendered + inspected headless.
      2. **Backup UX R8.2 Stage A** (#15): "Share backup…" hands the save as a .txt to the OS share
         sheet; the restore confirm now PREVIEWS the pasted backup (gen/era/money/achievements/
         playtime — bad pastes fail at preview); one-time backup nudge at 2 ships if never backed
         up (settings.lastBackupAt). E2E-driven: preview text + invalid-paste rejection.
      3. **Rival counterplay — the press blitz** (#8): rivals AHEAD of you can be blitzed from the
         leaderboard (cost scales with their user base; −15% users per strike for the run; max 3
         per rival; 240s press cycle). Curve-safe by construction — the leaderboard is a pure
         sidecar, so it's a money sink buying race position + reeling reactions. Save v19
         (+migration/sanitizer). +4 tests (481). Sim byte-identical (57m59s/62m17s · wall 1m05s).
      4. **Interactive onboarding — First Steps** (#11): a live 3-step checklist on Build (start a
         run → claim → buy a rack) that ticks off REAL state facts and retires itself; no new
         persistence. Welcome modal slimmed to point at it. E2E-driven through all three steps.
      5. **Music layers** (#3): the ambient pad is now era-keyed data (root walks up, filter opens,
         later eras add a voice) with a natural crossfade on era change. Still zero audio assets.
      6. **Game Center** (#18): full app-side bridge (score submits each prestige, hydration-synced
         achievement mirror, Settings row) that silently no-ops until a native `GameConnect` plugin
         exists — the only maintained plugin peers on Capacitor 5 vs our 6, so the dependency is
         deliberately deferred. Owner steps in GAME_CENTER_SETUP.md.
- [x] **Wave 2 (owner 2026-07-03, "continue") — six more, each verified + committed:**
      rack-tap LED flicker (#4, reduced-motion-safe, DrawOpts.tapFlash identity-optional);
      post-session recap (#16: applyOffline now diffs the catch-up tick for EVENTS — era
      crossings, rank moves, milestones, finished upgrades, training — rendered as story lines
      in the WIWA modal, +2 tests); scientific-notation setting (#14: Big.formatScientific,
      engine stays pure — the UI's fmt() picks; one switch re-skins every number, +2 tests);
      lighter-haptics toggle (#23: half-strength pulses, row shown only while haptics on);
      VoiceOver pass (#20: aria-valuetext on every slider so VO reads meaning, dock slider
      renamed to its visible label; dialogs/toasts/canvases/chips audited clean). #5 (milestone
      chase ladder) was already live via the goal strip — marked shipped. 485 tests · engine
      untouched except display-only Big method + offline story diffs (sim-irrelevant).
- [x] **Wave 3 (owner 2026-07-03, "do iPad overlay and so on", Steam memo skipped):**
      **iPad layout** (#22): ≥900px splits the Build pane into a two-column grid — hall/First
      Steps/dock sticky left, charter/hardware/Rig Bay right, notice+labnav spanning; wrappers are
      display:contents on phones (screenshot-verified at both viewports, phone byte-identical).
      **Regulator negotiation** (#9): deterministic sit-down card at suspicion ≥55 — settle (−20%
      cash, suspicion −30) / lobby (−8%, +heat relief, doomer tilt) / defy (Compute ×1.3·60s,
      heat+suspicion rise); one-time-ness structural (settle/lobby dip below trigger; factor-1
      truce marker gates re-fire — defiance means Chen RETURNS). Outranks the ambient pool; +6
      tests. **Content wave**: R7.2 callback sequels (six \`after\`-gated events referencing their
      parent beat, guard test cross-checks ids) + R7.4 rotating era press releases
      (eraBlurb(era, gen) rotates a per-era pool, so run 3's Scale-Up crossing reads fresh). +5
      tests. 496 tests · sim byte-identical (57m59s/62m17s · wall 1m05s).
- [ ] **NEXT:** local notification opt-in (#17 — needs @capacitor/local-notifications, batch with
      the Game Center native session) → panel memoization (#19, AFTER a real-device profile);
      **research-tree deepening** (owner design call) and the **post-TestFlight telemetry read**
      (R8.1) before further balance moves. Owner actions open: run the iOS TestFlight workflow
      (merging ≠ shipping), confirm GitHub Pages links, and the Game Center native steps when a
      Capacitor-6 plugin lands.
- [ ] **Flagged for owner (not touched):** run yields apply global multipliers twice (derive.ts —
      runComputeCost carries them, then runMoney/DataYield multiply again). The tuned curve is BUILT
      on this behaviour, so changing it = a full retune; decide deliberately. Also noted: App's
      effects rely on 10Hz re-render freshness (fine today; revisit if the tick→render path is ever
      throttled). (The old single-notice-slot drop is fixed — notices queue FIFO as of round 2.)

## UI polish + research depth (owner-directed 2026-06-30) — branch `claude/ui-polish-theme-fixes`
*Owner screenshots + asks: kill the green accent lines, make themes actually recolour the app
and lay them out symmetrically, add a second research fork, wire a category subsystem.*
- [x] **Green-line cleanup** — removed the coloured top rule on world-event ('BREAKING') modals and
      the green left accent bar on completed research nodes (read as ugly seams/noise). The violet
      CTA bar stays only on actionable nodes. Swept the app — that left bar lived only on `.node`.
- [x] **Themeable app accent** — hall themes now drive a doc-root `--accent` (each theme defines one
      in `hallThemes.ts`); bottom-nav active state + theme selection ring recolour to the choice, on
      top of the existing hall tint. Cosmetic only; semantic compute/data/money never theme.
- [x] **Symmetrical theme grid** — theme + rack-skin pickers use a fixed 4-col grid with 2-line
      clamped labels (was ragged flex-wrap).
- [x] **Research category subsystem** — pure data (`balance/researchCategories.ts`) + pure accessor
      (`researchCategories.ts`: `categoryOf`/`groupByCategory`); panel groups nodes under themed
      headers (Foundations/Efficiency/Scale/Product/Frontier) with an owned/total count. Presentation
      only → curve byte-identical. +6 tests (full-coverage guard).
- [x] **Second research fork** — new `deployment` exclusive group off `inference_api`: **Closed API**
      (×2.2 money) vs **Open Weights** (×2.2 compute), symmetric/equal cost, both leaves. The sim
      reaches `inference_api` exactly at the Gen-1 prestige boundary, so the fork is just out of reach
      for the sim → **curve byte-identical (58m52s / Gen2 14m53s / Gen3 10m27s / wall 3m05s)** while
      real players reach it mid-game as a genuine build pick. +1 test (439 total).

## PHASE 4 — Post-launch growth (active) · plan: `POST_LAUNCH_ROADMAP.md`
*The "five things" critical path the owner approved first. Each obeys the design spine:
3 in-run resources, pure/deterministic engine, data-in-`balance/`, hard-gated compounding,
no dark patterns. Re-run `npm run sim` after any economy change.*

### ⚠️ DIFFICULTY RETUNE (owner-directed 2026-06-29, TWO steps) — the curve is now MUCH longer
*Step 1 "a lot harder/slower": 12m15s → ~38–40m via `costMult` 1.0→2.0.
Step 2 "much longer, keep it feeling like progress" (owner target ~1h–1.25h): now **first prestige
≈ 59–72m, Gen2 ≈ 13–15m, Gen3 ≈ 10m**, longest dead-air gap **~3m**. Achieved with a NEW upgrade-only
length knob — `balance.difficulty.upgradeCostMult = 1.6` — NOT by pushing `costMult` (which walls the
game at ~2.5 because the prestige gate is a fixed compute STOCK against a fixed income ceiling; see
LEARNINGS "three-knob model"). `difficulty` now has three separated knobs: `costMult` 2.0 (research /
gate), `upgradeCostMult` 1.6 (length, SAFE), `productionMult` 1.0 (income dilation, spare). Snowball
still bounded via `prestige.scale` 1e5 + `multiplierPerPoint` 0.018. 432 tests. **All "sim 12m15s"
or "≈38m" notes below are HISTORICAL** (pre-retune records), not the current target.*

### ⭐ ACTIVE WAVE — R8 Platform & LiveOps (owner-picked 2026-06-28) · plan: `R8_PLATFORM_LIVEOPS_PLAN.md`
*The R0–R5 critical path is essentially shipped (350 tests, sim 12m15s). R8 turns balance tuning
into data, makes the save durable, and widens the platform. R8 touches NO balance → sim stays 12m15s
at every step (a regression check of the wave). Engine stays pure: telemetry/sync/platform glue live
in the store/UI layer, never `src/engine/`.*
- [x] **R8.1 · Local telemetry instrument** (P2) — SHIPPED. Pure `summarize()` + `purchaseSignature()`
      in `src/engine/telemetry.ts` (data→data, no clock/storage/RNG — engine-pure) + impure recorder
      `src/state/telemetry.ts` (own `localStorage` keys, never touches `SAVE_KEY`, opt-out clears data).
      Store hooks ride the EXISTING prev→next diff: `init` (session + baselines), `advance` (purchase
      via signature-diff + era-arrival via `currentEra` diff — fires only on the rare transition, not
      the 10Hz trickle), `doPrestige` (gen run-time from cumulative `playtimeSec`), and a `goTab` wrap
      in App for tab usage. "Diagnostics (on-device)" Settings panel shows the summary (time-to-first-
      ship, run times, era reached, longest idle stretch, most-used tab) + Clear + opt-out toggle.
      **100% on-device, no transmission → App Store "Data Not Collected" label preserved** (verified:
      zero network code in the telemetry path). Run timing uses engine `playtimeSec`, not wall-clock,
      so offline/backgrounding can't distort it and it lines up with the sim. +12 tests (359 total);
      typecheck + build clean; **sim 12m15s (byte-identical — no balance touched).**
- [ ] **R8.2 · Durable save** (P3) — Stage A: harden the existing `exportSave`/`importSave` into a
      real backup UX (Share sheet, import preview+confirm, gentle backup nudge) — no backend, no
      privacy change. Stage B (OWNER DECISION): optional cloud sync behind a `SaveSync` interface
      (recommend Apple iCloud/CloudKit — data in the user's own iCloud, likely still "Data Not
      Collected"; Supabase only if cross-platform forces a shared account). Conflict = highest-progress
      wins, not last-writer.
- [ ] **R8.3 · Android build** (P3) — self-contained `.github/workflows/android.yml` mirroring
      `ios-testflight.yml` (`cap add android` on CI, `android/` gitignored); verify the parametric
      renderer on Android WebView (backdrop-filter/color-mix/DPR); decide premium on Android (Play
      Billing vs hide v1). Owner action: Play Console record + upload keystore + service account.
- [ ] **R8.4 · Steam/desktop port eval** (P3) — write `STEAM_EVAL.md` (Tauri vs Electron, save paths,
      premium model, effort, go/no-go tied to observed retention). Memo, not code; do last.

### Content & customization wave (owner-directed 2026-06-28 — "more options & customizability")
*Player-facing content on the R6 replayability track. All cosmetic-only or post-first-ship → the
tuned curve is byte-identical (sim 12m15s).*
- [x] **R6.3 · Earnable hall-theme collection** — the cosmetic layer is now a cross-reset chase:
      8 new themes earned by play (ships, 1M Compute/s, 5 products, $1B all-time, 15 events, 5h,
      AGI ascension) on top of 4 free + 1 premium. Data in `balance/cosmetics.ts`; pure
      `src/engine/cosmetics.ts` (`themeUnlocked`/`collectionProgress`/`unlockHint`) reads ONLY
      monotonic lifetime stats → unlocks never re-lock after prestige (no unlocked-set to persist);
      cosmetic-only → not in derive. `hallThemes.ts` is now pure presentation. Settings theme picker →
      a collection grid (locked chips show their unlock hint + a lock glyph, plus an owned/total count).
      +6 tests; sim 12m15s.
- [x] **R6.1+ · Expanded Lab Charters** — the per-run build-choice pool grows 3 → 7: **Data Monopoly**
      (+data −compute), **Cash Machine** (+money −data), **Mad Science** (+compute −money), **Frugal
      Genius** (+compute +money −data). Data-only addition to `balance/charters.ts`; `charterMods`
      folds them via the existing path; identity at none/first-run → sim byte-identical (12m15s).
      +2 tests (unique ids, advertised tilts).
      ↳ Follow-up (done): **rack skins** — a 2nd cosmetic axis (recolours the racks, independent of the
        hall theme). 7 earn-by-play skins (`balance/cosmetics.rackSkins` + `skinUnlocked`/`skinProgress`).
        Renderer applies a pure HSL tint to the ONE tier-base RGB each rack derives from, so faces/LEDs/
        rim/spill all follow and per-tier contrast is preserved; "classic"/undefined is an early-return
        identity → default render byte-identical (no static-cache key change). `settings.rackSkin` +
        a second Settings collection grid. ⚠️ wants an on-device look before the next TestFlight push.
        +1 test; sim 12m15s.
- [x] **R6.2 · Faction-branched event pools** — committing to a side (|alignment| past
      `worldEvents.factionThreshold` = 0.4) opens a themed event pool, so a safety run and a send-it run
      diverge. Doomer pool (safety grant / 'the safe one' premium / interpretability) vs accel pool
      (the 10× run / momentum raise / ship-first viral). `WorldEvent.faction` tag; `pickWorldEvent(roll,
      alignment)` filters the eligible pool; neutral (incl. the sim) sees no tagged event → curve-safe.
      +5 tests; sim 12m15s.
- [x] **R6.3 follow-up · Collection achievements + codex** — `themesUnlocked` metric (themes earned by
      play, premium excluded) feeds both achievements (Wardrobe 6 / Haute Couture 10) and the codex
      (Interior Decorating + Picking Sides field notes). Monotonic; no new persisted state. +1 test.

### ⭐ Depth & context-richness — plan: `DEPTH_ROADMAP.md` (synthesized from 4 system audits)
*Diagnosis: the game is strong on the moment, weak on memory, siloed across systems. Wave A "Living
Market" (pure engine, curve-safe, zero render risk) is the connective tissue every audit ranked #1.*
- [x] **A1 · Reactive rival identities** — each named rival has a FOCUS (scaler/safety/money, mirrors
      alignment) + personality blurb; the leaderboard generates a deterministic reaction line from the
      player's standing ("You've passed them — expect a we're-focusing-on-AGI blog post"). +2 rival
      ship-events so all 5 ship with voice. Leaderboard is a sidecar (no resources/derive) → curve-safe.
      +3 tests.
- [x] **A2 · "Hot topics" event chaining** — a recent fired event biases the next roll toward same-topic
      events (×3 for a 3-event window) so crises cluster. Central id→topic map; `pickWorldEvent(roll,
      alignment, recentIds)`; transient ring in the store. Identity with no history → curve-safe. +3 tests.
- [x] **A3 · History-aware ship headlines** — the "Model Shipped" tentpole reflects what the run achieved
      (#1 market / scaling triumph / cash-flow / top-three / generation milestones) instead of a fixed
      rotation. Pure `shipHeadline()`. +5 tests.
- [x] **A5 · "This run's story" recap** — the Generation Report auto-generates a 2–3 line satirical
      summary (era + gen, alignment stance, product business). Pure `runStory()`. +4 tests.
- [x] **A4 · Living codex** — Field Notes re-read by tenure + stance: doomer vs accel see different
      faction lore; a veteran (5+ ships) sees a matured "Closet Years". Data-driven `variants` + pure
      `codexBody()` (veteran > faction > default). +3 tests.
- [x] **B1 · Charter conviction prestige bonus** — shipping the SAME charter as the previous run
      banks +15% Legacy (charter↔prestige resonance). New persisted `lastCharter` (save v14→v15);
      pure `charterConvictionMult` folded into `legacyWeightsForMode`; CharterPanel shows the bonus.
      Curve-safe (no charter at first ship; sim never sets one). +5 tests.
- [x] **B1b · Doomer conviction → Lab Reputation** — shipping while committed to safety (alignment ≤
      −factionThreshold) earns bonus Reputation (alignment↔meta), like open-source goodwill. New
      monotonic `safetyShips` stat (sanitizer-defaulted, no version bump); `perSafetyShip = 3`.
      Curve-safe (first ship neutral; Reputation is meta). +2 tests.
- [x] **C1 · Alignment spectrum bar** — Lab Stats shows a visual Doomer↔Accel bar (gradient + marker)
      once a faction choice is made, surfacing the now-strategic alignment axis. UI-only.
- [x] **B3 · The Regulator (escalating scrutiny + long memory)** — a named regulator (Supervisor Chen)
      whose persisted `suspicion` rises with every shady buy, never cools on its own (only lobbying
      appeases), and survives prestige. Escalates the regulatory-event rate (up to ×2.5) and, once
      escalated, signs the events (a recurring antagonist). Pure `regulator.ts` (4 tiers); save
      v15→v16; StatsPanel surfaces it. Curve-safe (clean lab/sim never goes shady → suspicion 0 →
      identity). +8 tests.
- [x] **B2 · Surface true team morale** — the Morale KPI showed only officeMorale, hiding the Mentor
      contribution that `derive()` actually applies (hiring a Mentor did nothing *visible*). New pure
      `totalMorale()` (office + mentors, single source of truth); EmployeesPanel KPI + tooltip breakdown
      + a Lab Stats row. Display-only fix, no balance/curve change. +1 test.
      ↳ Remaining **Wave B**: morale *consequences* (decay/turnover/burnout) — a LIVE-PLAYER BALANCE
        change, deferred for owner sign-off (don't silently nerf existing saves); **B4** staff↔product
        synergy + anti-degenerate floors (churn floor / cannibalization) — also balance-affecting.
- [x] **C1 legibility sweep** — all the cheap, no-render-risk surfacing wins:
      • alignment **spectrum bar** in Lab Stats · • **prestige-ready** pulse + gold "Ship" badge on the
      Lab nav · • **portfolio health** (bleeders float to the top, "⚠ N need attention" header) ·
      • **status ticker** (persistent regulator chip in the ModifierBar via a generic StatusChip API).
- [x] **C2 · Hall manifestation** (renderer; verified via the `npm run shot -- --manifest` harness, but
      still wants a real-device glance before the next TestFlight push):
      • **C2a** thermal-stress shimmer (red wash + heat-haze bands when power draw nears/exceeds
        capacity) + cooling-fan cap raised 3→6 so cooling visibly scales.
      • **C2b** staff as little **floor agents** working the open front of the hall (capped 14, bob/drift,
        reduced-motion safe).
      • **C2c** product **uplink beams** rising from the front edge, height/alpha ∝ revenue share.
      • **C2d** **alignment tint** — faint room wash (doomer→blue, accel→amber), capped low.
      All parametric (no assets), all gated so early game (no staff/products, neutral, not throttled) is
      byte-identical. +2 model tests; sim 12m15s.
      • **C2e** era-5 **Post-Singularity transformation** — an iridescent ceiling bloom + a vortex of
        data spiralling up into a singularity core. Gated era≥5 (earlier eras byte-identical);
        reduced-motion keeps the bloom, drops the swirl. Verified via `--ascend` seed.
      ✅ **Wave C2 complete.** (Per-era room splits already existed via `hallRoomSplit`.)
      ↳ Owner-decision (live-player BALANCE changes, not done unilaterally): morale decay/turnover/
        burnout; product churn floor / lifecycle decay; cross-segment cannibalization vs TAM expansion.
- [x] **R3.4 · More world-event dilemmas + dead-content fix** — 4 new two-choice dilemmas (Mine the
      Chat Logs / Automate Your Researchers / Power the Datacenter / Emergency-Brake Eval), each
      feeding the now-active alignment fork (doomer − / accelerationist +) → more player agency, not
      dismiss-only. **Bug fix:** found two duplicate event ids (`gpu_shortage`, `benchmark_win`) — since
      `applyWorldEvent` resolves by `find` (first match), the later entries' unique headlines were dead
      content; renamed to `gpu_shortage_global`/`benchmark_vibes` so they're reachable. +2 guard tests
      (id-uniqueness; every dilemma has 2 oppositely-signed branches). Data-only; sim 12m15s.

### Step 1 — Foundation (R0)
- [~] **R0.1 · Kill the 10Hz whole-app re-render** (P1) — INVESTIGATED + partially done. Finding
      overturns the original premise: (a) derive's expensive O(employees×products) staff fold is
      ALREADY cross-tick cached (`staffCache`), so derive is cheap per tick; (b) store subscriptions
      are already narrow — only `App` reads whole `game` (it must, to compute `d`), the rest use
      slices; (c) the active panel's per-tick re-render is largely INHERENT — it shows live 10Hz
      numbers (resource counts, rates, affordability, MAU/MRR, training bars), so it legitimately
      updates. The residual win is keeping each re-render CHEAP. Safe slice DONE: memoized the pure
      presentational leaves (`Avatar`, `Stars`) so a big roster doesn't reconcile N avatars/star-rows
      every tick when only numbers changed. Remaining (deferred, on-device-profiler-gated): memoizing
      interactive list ROWS (employee/upgrade/product cards) needs stabilizing their drag/selection
      closures — real risk of breaking drag-to-assign/selection that can't be validated blind, and the
      benefit is unmeasurable without a device profiler. Not shipping that part blind (per CLAUDE.md:
      rigorous partner, smallest proving change, no risky premature optimization).
- [x] **R0.2 · Extend the balance sim to the long game** — new `runLongHaul()` in
      `scripts/balance-sim.ts`: 20 generations driving the lab loop + the products business
      (commercialise deployed drafts, push versions). Reports per-gen ship time, total weights,
      legacyMult, era, weights/hr, and the data/compute + $/compute ratios; plus era-arrival times
      and a "sub-minute ships" collapse flag. **Immediately quantified the R4 targets:** 18/20 ships
      are sub-minute (meta-loop collapsing → R4.1), legacyMult ×1→×18. Baseline run() untouched
      (first prestige still 12m15s). (Staff = RNG-rolled employees in the store, out of a pure sim's
      scope — documented, same as the baseline.)

### Step 2 — Friendliness (R1)
- [~] **R1.1 · Advisor "Next: …" banner** — built it, then **removed it per owner UX feedback**
      (2026-06-28 TestFlight screenshot): the persistent "Next:" banner cluttered the top of the
      stage. The advisor engine (`nextAction`/`advisorItems`, still tested) stays and continues to
      drive the bottom-nav attention badges; only the banner UI was taken out.
- [x] **R1.2 · Buy ×1 / ×10 / Max** — segmented selector in the Hardware panel; pure engine
      `planBulkUpgrade` / `buyUpgradeBulk` (simulate real buys → exact total cost, honor
      affordability + floor space + rack auto-eviction; Max capped at floor). Cards show the batched
      total + "×N" for the qty that will actually buy. +5 tests; UI/engine-additive (sim 12m15s).
- [x] **Bonus · "Recommended next" = best value, not cheapest** — fixed the panel hero surfacing a
      strictly-worse rack (+2/s $106 over +12/s $220). New pure/tested `recommendedUpgrade()` scores
      by marginal money-equivalent throughput per cost. +4 tests.

### Step 3 — The hall (R2)
- [ ] **R2.1 · Tappable, inspectable racks** (P1) — tap a rack → parametric callout + satirical name.
      *(Canvas hit-testing/interaction — best done with on-device verification.)*
- [~] **R2.2 · Fix manifestation-rule violations** (P1) — 🟡 *partial*: **overclock** now manifests
      (racks visibly run hotter — folds into the existing work-pulse glow, GDD §5's exact example)
      and **auto-train** spawns a roaming "ops bot" dot. Pure model fields (`overclock`, `autoBot`)
      + 2 tests; renderer changes are additive/reduced-motion-aware. ⚠️ visuals want an on-device
      check before the next TestFlight push. *Remaining: staff desks, live-product uplink beams.*
- [x] **R2.5 · Rack-buy juice** — audit's "no celebration" was stale: `UpgradePanel` already fires
      `burst()` + `punch()` on every buy card. Left as-is (already covered).

### Step 4 — Endgame balance (R4 — do after R0.2)
- [x] **R4.1 · Tame the Legacy snowball** — `legacyMult` is now diminishing:
      `1 + perPoint × weights^multiplierExponent` (0.8), tunable in `balance.prestige`. At 0 weights
      it's exactly 1, so **first prestige is unchanged (12m15s)**; the meta-loop past it is retuned:
      lab-baseline **Gen2 1m03s → 2m11s, Gen3 0m59s → 1m49s** (no longer collapsing), and the
      long-run multiplier ceiling is bounded (gen20 ×18 → ×6.4). Validated via the R0.2 long-haul.
      ↳ Note: sub-minute *gen times* in the product-heavy long-haul are gate-driven (how fast you
        re-reach the ship gate), a deeper balance item separate from the multiplier ceiling R4.1 fixes.
- [x] **R4.2 · Close the retire→relaunch windfall** — lowered `retireValuationSec` 1800 → 900 AND
      added a maturity gate: a new `ProductState.ageSec` accrues in the sim and the retire payout
      ramps linearly to full value over `retireMaturitySec` (1200s). A freshly-launched/relaunched
      product is worth ~nothing to sell, so the pump-a-free-draft→dump-for-cash loop is closed; genuine
      cash cows still retire fairly. Old saves' products default to mature (no returning-player penalty).
      +3 product tests; existing retire test matured. 279 tests; sim 12m15s.
- [~] **R4.3 · Re-couple the triangle** — 🟡 *investigated with the instrument; needs an owner
      design call before shipping.* Added a "Products sink %" metric to the long-haul (how much
      produced Compute/Data the product business consumes). Findings (measured, not guessed):
      • Products today sink only **6.4% of Compute, 0% of Data** — confirms F1/F4 decoupling.
      • The audit's lever (raise version costs) **backfires**: higher prices → fewer affordable
        pushes → *less* sink (6.4% → 4.1% → 1.9%).
      • Pricing versions/releases in "seconds of current production" made them **unaffordable** (0%
        sink) — because **auto-train pins spendable Compute near one run's cost**, so there's no
        Compute bank to sink into products at all. *(Both pricing experiments reverted.)*
      → Real re-coupling requires changing how Compute BANKS (the audit's "Compute Reservoir" — let
        compute accumulate so it can be spent), which is a **core-loop change** (touches the
        auto-train/computeFocus flow) that wants an owner design call + on-device feel. Not shipped.
- [x] **R4.6 · Lift hardcoded balance constants into `balance/`** — moved the staff hire-discount
      floor (0.25), product-mod floors (serveCost/churn/heat), the post-raid heat ×0.4, and the min
      run duration (0.5s) out of logic into `balance.staff`/`balance.heat`/`balance.run` (CLAUDE.md
      data-driven rule). Values unchanged → pure refactor, sim byte-identical (12m15s). 281 tests.

### Step 5 — Depth (R5)
- [x] **R5.1 · Activate the dead `alignment` dial** — was set by faction choices but read nowhere.
      Now a real, data-driven strategic fork (`balance.alignment` + pure `src/engine/alignment.ts`):
      **accelerationist** trades money for compute and runs hotter (+Heat on shady buys);
      **doomer** trades compute for money and stays clean (−Heat). Folded into `derive` (compute/$
      tilt) + the two Heat sites; surfaced as "Stance effects" in Lab Stats so it's legible.
      Hard-gated — neutral (0) is identity, so the sim is **byte-identical** (12m15s). +6 tests.
      ↳ Follow-up (optional): alignment→Reputation-gain and alignment→product-acquisition forks.
- [x] **R5.2 · Contracts board** — a guided ladder of accept-and-fulfill objectives
      (`balance/contracts.ts` 15-deep pool + pure `src/engine/contracts.ts`). The board is DERIVED
      from a single persisted `completed[]` (first N uncompleted, like achievements — minimal save
      surface), shows live progress bars, and pays **Lab Reputation** (meta-currency → no in-run cash
      injection, curve-safe). Completed contracts feed `earnedReputation`. Save v11→v12; persists
      through prestige. ContractsPanel in the Lab tab. +10 tests (board derivation, readiness,
      no double-claim, off-board guard, rep accounting, save round-trip + migration). Sim 12m15s.
      ↳ Follow-up: ✅ advisor now nudges "Claim the '<title>' contract — +N Rep" when one is ready
        (extends the recommendation system); tab badge still optional.
      ↳ Follow-up (done): **endgame ladder** — extended the pool 15→25 so the board no longer runs dry
        mid-game. New rungs reach into the deep/endgame (10M users, 50 racks, $1B earned, 1B Compute/s,
        15 ships, 25 staff, and a capstone AGI **ascension** contract). Added `peakMau`/`ascensions`
        contract metrics (read from stats). Rep rewards escalate 5→10. Reputation-only payout → still
        curve-safe (sim 12m15s). +1 test (339 total).

- [x] **R5.5 · Cross-system interactions** — existing systems now ripple into the product business
      (emergent depth, ~no new content): **alignment → products** (accelerationist markets harder →
      +product acquisition; doomer ships cautiously → −product Heat) and **Heat → product churn**
      (a sketchy lab under regulatory pressure bleeds customers, linear in Heat). Both fold into
      `derive`'s product mods (so `simulateProducts` picks them up with no signature change), identity
      at neutral/cold → **sim byte-identical (12m15s)**. +5 tests.
      ↳ Optional polish: surface these in the Lab Stats "Stance effects" line.
- [~] **R5.6 · Reputation → cross-system perks** — 🟡 *started*: added **Portfolio Expansion** (cost
      40) — a Reputation perk that grants **+1 concurrent product slot** (`maxActiveProducts` =
      base + perk-granted slots), the first reputation perk that touches another system instead of a
      flat global mult. New `productSlot` effect kind + `bonusProductSlots`; wired through the slot
      checks, advisor free-slot nudge, and the Products header. Gated → sim byte-identical (12m15s).
      +2 tests. ↳ Follow-up (done): **Research Fellowship** (cost 28, requires Data Partnership) — a
      second cross-system perk that discounts every research node −20% Compute & Data via a new
      `researchDiscount` effect kind + pure `researchCostMult` (floored at 0.25 so research can't go
      free). Folded into `researchCost`/`canBuyResearch`/`buyResearch`; the Research panel shows the
      discounted price + ETA. Neutral (mult=1) with no perk → **sim byte-identical (12m15s)**. +4 tests.
      ↳ Follow-up (done): **Founder's Stockpile** (cost 32, requires Compute Grant) — a third
      cross-system perk (`startingRacks` effect): every fresh run begins with 3 `rack_basic` already
      humming, bounded by the starting floor capacity so it can't break the floor-space rule. Wired in
      `prestige` (injects into the fresh upgrades map); zero with no perk → first run's cold open is
      byte-identical (sim 12m15s). +3 tests. *Remaining (optional): mutually-exclusive build branches.*
- [x] **R5.3 · Research auto-buyer** — new **Research Director** Reputation perk (cost 24) auto-buys
      the cheapest affordable, prereq-met research node. Pure `applyAutoResearch` folded into `tick`
      (so it works offline too); gated behind the perk → off by default → **sim byte-identical
      (12m15s)**. Does exactly what an engaged player does by hand, so it can't outrun the curve.
      New `automate` reputation-effect kind; +5 tests. The genre-standard automation layer the audit
      ranked as the top idle convenience.

- [x] **R4.3 · Re-couple the resource triangle (Data lever)** — Compute is auto-train-pinned and
      can't be a sink without a core-loop change (documented), but **Data accumulates**, so it CAN.
      `versionCostFor(state, v)` adds 600s of current Data output to each version push ("AI R&D runs
      on data"), tying the cost to the Data economy so it stays a real sink instead of decaying to
      nothing. Curve-safe by construction (no products pre-first-ship → first-prestige 12m15s, Gen2
      2m11s byte-identical). Sim-validated sweet spot: Data sink **0.0%→2.3%** with products still
      pushing (Compute sink stays 6.3%); past N=600 the cost starves products and both sinks collapse
      (the documented backfire — peak found via the sink metric). +3 tests; LEARNINGS updated.
- [x] **R2.1 · Tappable racks** — the hall is now interactive: tapping a rack opens a small info card
      (tier name + flavor, count owned, Compute/s each, tier total); tap empty floor or × to dismiss.
      Pure hit-testing — `rackHitAreas(model,W,H)` in the renderer mirrors `drawHallDynamic`'s placement
      exactly (same tile order, floor-diamond quads), and `rackInfo(state,tier)` is a pure engine read
      model. Front-to-back hit order so the frontmost rack wins a tap; markers still take precedence.
      Read-only → sim/curve untouched (12m15s). +4 tests.
- [x] **R7.2 · Codex lore for the new systems** — the Field Notes encyclopedia (15→21 entries) now
      covers this session's systems: charters (Mission Statements), contracts (Enterprise Sales /
      Always Be Closing), the market leaderboard (The Leaderboard / Market Leader), and the Legacy
      tree (Specialisation). Extended `CodexMetric` to read live state (`contractsCompleted`/
      `rivalsBeaten`/`legacyInvested`) like achievements do, so each new system has discoverable,
      threshold-gated lore. Pure data + a 3-case switch extension; zero curve impact. +1 test.
- [x] **R7.1 · Tiered upgrade flavor** — the most-bought upgrades (racks, overclock) now have
      *escalating* satirical descriptions at owned-count breakpoints ("Your landlord has questions
      about the power bill.") instead of one static line. Pure `upgradeFlavor(id, owned, fallback)`
      + data in `src/engine/flavor.ts`; the upgrade card shows it. +3 tests. UI text only — no curve
      impact. High personality-per-byte (the GDD's satire wedge).

- [x] **R6.1 · Lab Charters** — a per-run modifier you pick at the start of each generation (after
      the first ship): **Open-Source Crusade** (+data −money), **Bootstrapped** (+money −compute),
      **Moonshot** (+compute −data). Each tilts the triangle so runs play differently. Charter is
      chosen while the run is fresh, then locks once you research; resets to null each prestige.
      Pure `charterMods`/`setCharter` (`balance/charters.ts` + `src/engine/charter.ts`), folded into
      derive; save v12→v13; CharterPanel in the Lab. Identity when none/first-run → **sim
      byte-identical (12m15s)**. +7 tests. The audit's core replayability lever.

- [x] **R5.4 · Spendable Legacy / prestige skill tree** — turns the flat "weights → one global
      multiplier" into a focus-vs-breadth CHOICE. A small **Legacy Investments** tree (in the Prestige
      panel) lets you spend weights on permanent lane biases (Compute/Data/Money specialist → mastery);
      invested weights are REMOVED from the global-multiplier pool (`legacyAvailable` = total −
      invested), so it's a real trade-off — concentrate a lane or keep the broad boost. Owned perks
      persist across prestige; `spent` is derived (can't desync). Save v13→v14. **Curve-safe by
      construction:** nothing invested → available = total → identical legacyMult, so first prestige
      (12m15s) and the sim are byte-identical until the player chooses to invest. +5 tests
      (identity-when-unspent, spend trade-off + lane bias, affordability/prereqs, no double-buy/
      overspend, persist + save migration).

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
