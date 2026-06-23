# GAMEPLAN.md — Singularity Inc.
*The master execution plan. Ordered steps, exit gates, and the dopamine/feel layer. Built on `SINGULARITY INC GDD.md` (the "what") and `CLAUDE.md` (the "how"). This file is the "in what order, and how do we know we're done."*

**Status:** v1.0 · Owner: Isac (Wrexist)
**Reading order for any new session:** `CLAUDE.md` → `TASK.md` → this file → `LEARNINGS.md`.

---

## 0. How to read this document

The GDD locked the design. This plan turns it into a build order. Three rules govern everything below:

1. **Phase gates are real.** You do not start a phase until the previous phase's exit gate is signed off by the owner. The single biggest risk on this project (documented in GDD §11) is scope drift — pulling later-phase shine forward before the core is proven. This plan is structured so that's physically hard to do.
2. **Every step has a deliverable and a "done when."** No step is "work on X." It's "X exists, is tested, and proves Y."
3. **Fun is a measurable gate, not a vibe.** Each phase ends with a playtest question that has a yes/no answer. If the answer is no, you fix or kill — you don't proceed.

> **The dopamine promise, stated honestly up front:** "filled with dopamine" is the goal, and §7 is the entire feel system that delivers it. But dopamine in this genre comes from *legible progress the player caused* — number goes up because I made a good choice, and I can see it. It does **not** come from dark patterns (fake timers, nag pops, energy gates). The GDD commits to honest juice; this plan engineers it. Honest juice out-retains manipulation and keeps App Store review clean.

---

## 1. The fun thesis (what "great and clean and dopamine-filled" actually means here)

Before the steps, name the target so we can aim at it:

- **Great** = the core loop is compelling in *ugly flat UI*, before any art. If it's fun as a spreadsheet, the hall makes it sing. If it's not, no amount of 2.5D saves it. (This is why Phase 0 exists.)
- **Clean** = three resources, one primary action at any moment, panels that slide over the world instead of replacing it, and a player who is never confused about what to do next. Legibility is the feature (GDD §0.1.2).
- **Dopamine-filled** = a tight stack of feedback at three timescales: the *micro* hit (every claim pops, sounds, sparkles), the *session* hit (a milestone era transition that reskins the world), and the *meta* hit (prestige — the most exciting button in the game). All three are engineered in §7.

If a feature doesn't serve great-clean-dopamine, it's Phase 2+ backlog or it's cut.

---

## 2. Phase map at a glance

| Phase | Name | Goal | Exit gate | Rough size |
|------|------|------|-----------|-----------|
| **0** | Loop prototype (flat UI) | Prove the loop is fun as numbers | Owner plays, confirms it's compelling with zero art | ~1 week |
| **1** | Shippable MVP | A real release: hall + eras 1–3 + prestige + juice | Live on TestFlight, real retention data coming in | ~4–6 weeks |
| **2** | Depth wave | Power/heat, staff, full events, eras 4–5 | Data shows Phase 1 retained; depth deepens it | post-launch, data-driven |
| **3** | Endgame & spectacle | Era 6 / Post-Singularity, AGI prestige spectacle, meta | Endgame players have a reason to keep prestiging | data-driven |
| **4** | Platform expansion | Steam port (Electron wrap) | Only if Phases 1–3 earned it | gated |

**We are in Phase 0.** Everything past §4 of this document is parked. Do not build it.

---

## 3. PHASE 0 — Loop prototype (flat UI, NO 3D)

**Mission:** prove the loop is fun as numbers. Ship nothing. Build the smallest thing that lets the owner feel the loop and answer one question: *"Do I want to take one more action?"*

This phase maps 1:1 to the current `TASK.md`. Below is the **ordered build sequence** with dependencies and "done when" criteria — the part TASK.md doesn't give you.

### Step 0.1 — Scaffold & guardrails (foundation)
Build order matters: get the architecture right before any game logic, because the logic/UI split is expensive to retrofit (LEARNINGS).

1. Vite + React 18 + TypeScript **strict**. Confirm `tsc --noEmit` is clean.
2. Create the directory contract:
   - `src/engine/` — pure TS, **zero React imports** (enforce with a lint rule or a test that greps for `react` in engine files).
   - `src/engine/math/` — BigNumber wrapper (see 0.2).
   - `src/engine/balance/` — all tunables as plain data.
   - `src/ui/` — React, consumes engine output only.
   - `src/state/` — the Zustand store wiring engine ↔ UI.
3. Zustand store skeleton (empty game state, one no-op action).
4. Vitest configured; one trivial passing test committed.
5. Git init already done — first commit of scaffold, push to branch.

**Done when:** `npm run dev` shows a blank app, `npm test` passes, `npm run build` succeeds, and the engine folder imports zero React. *Commit.*

### Step 0.2 — BigNumber abstraction (before any economy)
Idle curves blow past `1e308` within hours; retrofitting BigNumber later is painful (LEARNINGS).

1. Wrap a library (e.g. `break_infinity.js` for speed, or `decimal.js` for precision — decide on benchmark, default to `break_infinity.js` for idle math) behind our own thin interface `Big` in `src/engine/math/`.
2. Expose only what we use: `add, sub, mul, div, pow, gte, lt, max, min, format`.
3. Implement `format()` with idle-game number notation (K, M, B, T, then scientific/named). This is also a *feel* surface — readable big numbers are part of the dopamine.
4. Unit-test the wrapper, including format edge cases.

**Done when:** wrapper is tested and nothing else in the engine touches the underlying lib directly. *Commit.*

### Step 0.3 — Resource model & deterministic tick
The heart. Build it test-first (write the test before the feature — TASK.md says so, and it's how the engine stays honest).

1. State shape: `{ compute, data, money }` as `Big`, plus production rates.
2. `tick(state, elapsedMs): state` — **pure**, deterministic, **no `Date.now()` inside** (pass time in; this is what makes offline progress just "a big tick" — LEARNINGS).
3. First behavior: passive Compute generation from a base rate.
4. Test: given a state and `elapsedMs`, Compute increases by the exact expected amount. Determinism test: same inputs → same output.

**Done when:** `tick` is pure and tested for passive generation and determinism. *Commit.*

### Step 0.4 — The manual action (the "I caused this" beat)
This is the active loop and the first dopamine source. Keep it to ONE primary action.

1. Action: **assign Compute to a training run** → on completion yields Data and/or Money.
2. Model the run as a progress value that advances on tick; completion triggers a payout.
3. Test the full cycle: assign → tick to completion → payout lands → run resets/clears.

**Done when:** a player action visibly converts Compute into Data/Money, fully tested. *Commit.*

### Step 0.5 — Upgrades (~10) and the cost curve
The "spend it" half of the loop. This is where balance becomes real.

1. Upgrade data lives in `src/engine/balance/upgrades.ts` as plain data: id, cost curve params, effect.
2. Cover the genre-critical archetypes:
   - **Rack tiers** (raise Compute production) — the core "buy more engine" upgrade.
   - **Yield multipliers** (×Data, ×Money per run).
   - **At least one automation** (auto-claim or auto-assign) — the genre-defining "remove the manual grind" reward. Players *love* the moment the game starts playing itself a little.
3. Cost scaling is exponential per purchase (standard idle curve); the growth factor is a tunable in balance, never hardcoded.
4. Test: buying an upgrade deducts cost, applies effect, raises next cost.

**Done when:** ~10 upgrades exist as data, purchase logic is tested, costs scale. *Commit.*

### Step 0.6 — One research branch (~5 nodes)
The progression spine, in miniature. Reveal depth in a wave, don't dump.

1. Research data in `src/engine/balance/research.ts`: nodes with prerequisites, Compute/Data cost, and an effect (a multiplier or a capability unlock).
2. Five nodes in a line/small tree, ending in **one capability unlock** that opens a new income source — so the player feels the tree *means* something.
3. Test: prerequisites gate purchase; effects apply.

**Done when:** a 5-node branch unlocks a new capability, tested. *Commit.*

### Step 0.7 — Offline progress
The idle half. Clamp and summarize (LEARNINGS): cap accrued time (start at 8h, tunable) so it's a reward, not an exploit.

1. On load: compute `elapsedMs` since last save, clamp it, run `tick` with the big elapsed value.
2. Produce an **offline summary object** (what was earned) — this is the data the "while you were away" screen will render. Build it as engine output now, even though the pretty screen is later.
3. Test: a known elapsed time produces the expected accrual and a correct summary; clamping works.

**Done when:** closing and reopening accrues the right resources and yields a summary. *Commit.*

### Step 0.8 — Prestige ("Ship the Model") — the retention engine
The most important math in the game (LEARNINGS). The first prestige must land while the player is still engaged.

1. Trigger: a capability/threshold check that enables the Ship button.
2. Reset: Compute, Data, Money, racks, most research.
3. Persist: **Legacy Weights** meta-currency + one permanent global multiplier purchased with it. Also persist cosmetic/achievement stubs (even if empty now).
4. The Legacy Weights formula is a tunable in balance — model it so each prestige is a *meaningful jump* and the first one is reachable in one engaged session arc.
5. Test: prestige resets the right things, keeps the right things, grants Legacy Weights per the formula, and the permanent multiplier actually speeds the next run.

**Done when:** a full prestige cycle works and the second run is measurably faster. *Commit.*

### Step 0.9 — Save/load (versioned, with migration from day one)
1. Serialize the Zustand/engine state to local storage.
2. Version the save; write a `migrate(save)` with a v0→v1 stub so the pattern exists before we need it.
3. Test: round-trip save→load is lossless; an old-version save runs through migration.

**Done when:** state survives reload, versioned, migration stub tested. *Commit.*

### Step 0.10 — Deliberately ugly flat UI
No art, no hall. Just enough to *feel* the loop. This is where even Phase 0 gets a thin slice of §7 juice — because the fun-gate is partly a feel test.

1. Resource counters (Compute / Data / Money) — with a **number-pop on change** (the cheapest, highest-value juice; do it even in flat UI).
2. Action dock: claim / assign training run, with a progress bar.
3. Upgrade list: buy buttons, live costs, owned counts, affordability state (greyed when unaffordable — clarity).
4. Research panel: the 5-node branch, with locked/available/owned states.
5. Prestige button + confirmation modal + a clear "here's what you keep / what you lose" summary.
6. "While you were away" screen on load, rendering the §0.7 summary as a small stacked reward (not a dialog box).

**Done when:** the owner can play a full arc — earn, upgrade, research, go offline, come back, prestige — in flat UI. *Commit.*

### Step 0.11 — Balance pass + the FUN GATE
1. Build a tiny **balance sim** (a script or a Claude-in-artifact simulator) that runs the curve forward and graphs time-to-first-prestige, so we tune with evidence, not by hand (GDD §11.3).
2. Tune so the first prestige lands at a satisfying point — not so early it's meaningless, not so late the player walls out first.
3. **Owner playtest. The gate question:** *"In ugly flat UI, do I keep wanting to take one more action — and is the first prestige exciting?"*
   - **Yes →** Phase 0 passed. Proceed to Phase 1.
   - **No →** diagnose: is it pacing, payout cadence, or the prestige payoff? Fix the loop. **Do not add art to compensate.** If it can't be made fun as numbers, this is the cheap place to kill it.

**Phase 0 exit deliverable:** a playable flat-UI build + a balance sim + a signed-off fun-gate.

---

## 4. PHASE 1 — Shippable MVP (a real release)

**Mission:** turn the proven loop into a complete, shippable game with the visible hall, three eras, the full prestige loop, and the milestone spectacle. Ship to TestFlight and get real retention data. Treat Phase 1 as a release, not a milestone (GDD §9).

> Gate to enter: Phase 0 fun-gate signed off. Do not start the hall before this.

### Workstream A — The 2.5D hall & the manifestation rule
The hall earns its screen space only because purchases physically appear in it (GDD §5).

- **A1. Renderer decision.** Benchmark what ports from Silicon. Default order of preference: Canvas/SVG 2.5D → Pixi → Three. Pick the lightest thing that hits 60fps on a mid iPhone with the manifestation rule satisfied. Decide *here*, with the loop in hand — not before.
- **A2. The hall scene.** A clean isometric room with rack slots. Warm, readable, parametric (boxes + lights, no image assets — keeps the Capacitor bundle tiny and matches the philosophy).
- **A3. Manifestation binding.** Wire engine state → hall: buy a rack, it slides into an empty slot and powers on. This is load-bearing dopamine; budget real time for the *feel* of placement.
- **A4. Scale abstraction.** "1000 GPUs" is one upgraded rack visual, not 1000 objects (LEARNINGS — draw-call budget). Define the visual tiers per era.
- **A5. Overlay UI.** Resource counters + action dock are persistent overlays; research/shop panels slide over the hall, never replace it (clean-to-play rule).

### Workstream B — Eras 1–3 & the full research tree
- **B1. Era data.** Server Closet → Startup Garage → The Lab, each a visible reskin of the hall (GDD §3).
- **B2. Full research trees** for eras 1–3, with the four node types (capability, multiplier, automation, cosmetic/structural). Pacing rule: ~1–2 hours of fresh decisions per era; reveal in waves.
- **B3. Era transitions** = the tentpole milestone moments (see §7).
- **B4. First prestige lands at the end of Era 3** so the player learns the reset while still engaged (GDD §3 pacing rule).

### Workstream C — The full "Ship the Model" prestige loop
- **C1. Player-flavored ship choice** (deploy / open-source / sell to hyperscaler) with minor differing bonuses — a small, meaningful decision that adds replay texture.
- **C2. Legacy Weights store** — permanent multipliers, faster early eras, unlocks.
- **C3. Lab reputation stub** — the slow meta-track, seeded now, deepened in Phase 3.

### Workstream D — Lightweight satirical events (~12)
- **D1. Event engine (lightweight):** a trigger + modifier + flavor-text system. Data-driven so writing is editable without code.
- **D2. ~12 events** in the satirical voice (GPU shortage, breakthrough paper, competitor launch, regulator visit, data breach, the intern who deletes prod). Humor lives here; systems stay clean (GDD §0.1.5).

### Workstream E — Juice & the dopamine layer (see §7 for the spec)
- **E1. Micro-feedback** everywhere (number-pops, sounds, particles).
- **E2. "While you were away"** as a designed reward screen.
- **E3. Milestone era-transition moments** — full-screen, reskin, swelling beat, satirical "press release" pop. These double as App Store screenshots (GDD §8 — bake marketing assets out of the game; don't repeat the Dynasty Manager UK-ASA screenshot issue).
- **E4. Settings:** sound/haptics/reduced-motion toggles (accessibility = clean-to-play and respects the player).

### Workstream F — Ship infrastructure
- **F1. Premium unlock IAP** (~$6.99–8.99): generous base game; premium removes friction + cosmetic/QoL bundle. No ads, no energy gates, no pay-to-win (GDD §7).
- **F2. Capacitor iOS build.** Follow `DEPLOYMENT.md`. iOS 26 SDK is mandatory for upload (LEARNINGS); reuse the owner's Fastlane Match setup; add `PrivacyInfo.xcprivacy`.
- **F3. TestFlight** internal → external. Export compliance, age rating, screenshots from E3.

**Phase 1 exit gate:** the game is live on TestFlight, a full era-1-to-3-to-prestige arc is fun and clean on a real device, and retention data is starting to flow. **Then, and only then, decide Phase 2.**

### Suggested Phase 1 milestone ordering (so there's always a playable build)
1. **M1 — Hall + manifestation on the Phase 0 loop** (Workstream A on top of proven numbers). Playable: you see your purchases appear.
2. **M2 — Era 1 fully juiced** (B1/B2 for era 1 + E1/E2). Playable: one polished era.
3. **M3 — Eras 2–3 + full prestige** (rest of B + C). Playable: the full progression arc.
4. **M4 — Events + milestone moments** (D + E3/E4). Playable: the game has personality.
5. **M5 — Ship infra + store polish** (F). Shippable: on TestFlight.

Each milestone ends with a build the owner can play. Never go more than one milestone without a playable build.

---

## 5. PHASE 2 — Depth wave (post-launch, data-driven)

Only after Phase 1 retains. Add depth to a proven base; don't add breadth to an unproven one.

- **Power & heat:** racks draw power, emit heat; cooling is a cost + a visible animation (fans, coolant). A soft cap the player engineers around — Silicon's systems-depth instinct, gated behind early-game mastery (GDD §2.2).
- **Staff:** researchers / engineers / ops — hireable, assignable, payroll cost.
- **Full event engine + factions** (doomers vs accelerationists).
- **Eras 4–5** (Frontier Lab, Hyperscaler) + multi-room hall.
- **Cosmetic IAP store** (themes, rack skins, custom lab name — never power).

**Gate:** each addition is justified by a retention/engagement question, not "it'd be cool."

---

## 6. PHASE 3 — Endgame & spectacle · PHASE 4 — Platform

**Phase 3:** Era 6 / Post-Singularity, the **"AGI" milestone as a prestige-gated spectacle** (a satire payoff, not a literal claim), deep meta-progression (lab reputation), achievements, leaderboards.

**Phase 4:** Steam port via Electron wrap, reusing the Dynasty Manager `STEAM_PORT.md` playbook — desktop input/layout. Explicitly gated behind the mobile game succeeding; never a parallel effort.

---

## 7. The dopamine & feel system (the spec for "filled with dopamine")

This is the heart of the owner's ask, engineered as a system. Built honestly: every hit is a reward for *legible progress the player caused*.

### 7.1 The three timescales of reward
| Timescale | Beat | Where it's built |
|-----------|------|------------------|
| **Micro (seconds)** | Number-pop + sound + particle on every claim; progress bars that ease toward full; satisfying "ka-chunk" when a run completes. | Phase 0 (flat) → Phase 1 (juiced) |
| **Session (minutes–hours)** | The "while you were away" reward stack; an automation unlock that makes the game play itself a little; a research node that visibly changes the hall. | Phase 0 → Phase 1 |
| **Meta (days–weeks)** | **Prestige** — the most exciting button in the game. Era transitions that reskin the world. Legacy Weights compounding so each run flies. | Phase 0 (math) → Phase 1 (spectacle) |

### 7.2 The anticipation engine
The genre runs on *almost-there*. Always show the player the next thing:
- "Next unlock in…" teasers and a visible cost they're saving toward.
- Progress bars that are *near* completion when the player returns (tune offline so something is about to pop).
- A clearly-telegraphed next era so the player has a goal above the current one.

### 7.3 The milestone moment (tentpole reward — Phase 1)
An era transition is the biggest beat in the game:
1. Screen takes over (the hall is the star).
2. The room **reskins** to the new era live.
3. A beat of motion + sound swells.
4. A satirical "press release" / headline pops in the game's voice.
5. New research depth is revealed in a wave.
These screens *are* the App Store screenshots — design them as marketing assets (GDD §8).

### 7.4 What we will NOT do (the honest-juice firewall)
No fake-urgency timers. No manipulative "come back!" nags. No energy gates that exist only to sell skips. No dark-pattern retention. Respecting the player's time is itself a retention driver, and it keeps Apple review clean (GDD §6 restraint note, CLAUDE.md "What NOT to do").

---

## 8. The "clean to play" system (legibility as a feature)

- **One primary action at a time.** The player always knows the single best thing to do right now. Secondary actions live in panels they choose to open.
- **Three resources, forever.** The triangle (Compute → Data → Money) is the whole economy. We do not add a fourth resource to "add depth"; depth comes from the research tree and the systems, not from more counters.
- **Panels slide over the world; they never replace it.** The hall is always the backdrop. No full-screen mode-switches that lose context.
- **Affordability is always visible.** Buttons grey out when you can't afford them; costs are always shown; nothing is hidden behind a tap to "check."
- **No tutorial wall.** The first era *is* the tutorial — it teaches by giving you exactly one new thing at a time (reveal depth in waves).
- **Accessibility = cleanliness.** Reduced-motion, sound/haptic toggles, readable contrast. A clean game is one everyone can read.

---

## 9. Balancing as a first-class workstream

Balancing the idle curve is the real, hard, mostly-new work (GDD §10 — "reuse is high so cost is low" is ~40% true; the economy is all new).

- **All tunables are data** in `src/engine/balance/`. Never hardcode a curve value in logic.
- **Model before tuning.** A balance sim (script or Claude-in-artifact) runs the curve forward and graphs time-to-prestige, resource ratios, and wall locations. Tune with the graph, not by hand.
- **The three targets:** (1) first prestige lands while engaged, (2) no dead "wall" with nothing to do, (3) no runaway snowball that trivializes choices.
- **Re-tune freely.** Expect hundreds of iterations. The data/logic split is what makes that cheap.

---

## 10. Definition of done (per layer)

- **An engine feature is done when:** it's a pure function (no React, no `Date.now()`), it has a test, the test passes, and its tunables are in `balance/`.
- **A UI feature is done when:** it reads engine state via selectors (no duplicated state), it handles locked/available/owned/unaffordable states, and it has the §7 micro-feedback wired.
- **A phase is done when:** its exit gate (a yes/no playtest question) is signed off by the owner.
- **A commit is done when:** it's one logical change with a descriptive message, and `npm test` + `npm run build` are green.

---

## 11. Immediate next actions (start here)

1. **Confirm scope:** we are in Phase 0. The only work that exists is §3.
2. **Step 0.1 — scaffold** (Vite + React 18 + TS strict, the `engine`/`ui` split, Zustand, Vitest). Commit + push.
3. **Step 0.2 — BigNumber wrapper.** Test-first.
4. Continue down §3 in order. One logical change per commit.
5. Keep `TASK.md` updated as you go; append any gotcha to `LEARNINGS.md`.
6. **Set a Phase 1 ship date and write it down.** A date is what turns a project into a release (GDD §12).

> Reminder to the next session: do not build the hall, events, staff, or power/heat until the Phase 0 fun-gate passes. Protecting that boundary is part of the job (CLAUDE.md).
