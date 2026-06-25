# LEARNINGS.md — Singularity Inc.
*Accumulated gotchas and hard-won knowledge. Read before solving anything non-trivial; append whenever you learn something a future session would want.*

---

## Seeded knowledge (idle-game + stack specifics to know upfront)

### Idle-game engineering
- **`number` overflows fast.** Idle curves hit 1e308 (JS max) within hours of play. Use a BigNumber abstraction from day one; retrofitting it later is painful. Wrap it so the lib can be swapped.
- **Never call `Date.now()` inside the engine.** Pass elapsed time into `tick()`. This keeps the engine deterministic and testable, and makes offline progress just "a tick with a big elapsed value." Non-deterministic engines are untestable and produce balance bugs you can't reproduce.
- **Offline progress = clamp + summarize.** Cap accrued offline time (e.g. 8–24h) so returning players get a reward, not an exploit. The "while you were away" screen is a designed dopamine beat, not a dialog — treat it as a feature.
- **Balance is data, not code.** Cost/yield/multiplier curves live in `src/engine/balance/` as plain data. You will retune these hundreds of times; they must be editable without logic changes. Model the curve in a spreadsheet/sim before hardcoding — hand-tuning blind produces walls and runaway snowballs.
- **Prestige math is the retention engine.** Get the Legacy-Weights formula right: each prestige should feel like a meaningful jump, and the first one should land while the player is still engaged (≈ end of the tutorial-to-midgame transition), so they learn the loop before the wall.

### Stack / workflow
- **Logic/UI separation must be enforced from commit 1.** Once React leaks into the engine it's expensive to extract. The engine having zero React imports is what later enables a Steam/desktop port to reuse the core.
- **Zustand: keep game state in the store, derive UI values with selectors.** Don't duplicate state into component state; it desyncs from the engine.
- **Parametric rendering batches well; entity counts don't.** Represent "1000 GPUs" as one upgraded rack visual, not 1000 objects. Capacitor/mobile has a real draw-call budget.

### iOS / deployment (current as of June 2026 — verify before relying)
- **iOS 26 SDK is MANDATORY** for any App Store Connect upload since April 28, 2026. Build with Xcode 26 / iOS 26.2 SDK. Deployment target can still be lower (iOS 16/17) so older-OS users aren't excluded — it's the *build* SDK that's gated. If a build is rejected at upload, check this first.
- **Fastlane + Xcode 26 gotcha:** with multiple providers on the account using app-password auth, `pilot`/`upload_to_testflight` needs `itc_provider` / `--provider-public-id`. Without it, uploads fail on multi-provider accounts. (Owner has multiple apps → likely multi-provider.)
- **Privacy manifest (`PrivacyInfo.xcprivacy`) is a common rejection cause.** Declare "required reason" API usage (UserDefaults, file timestamps, disk space, etc.) with approved reason codes. A local-only idle game uses few of these, but UserDefaults/save APIs still need declaring.
- **Reuse the owner's existing Fastlane Match setup** (already configured across Dynasty Manager / PeptideX) for unified signing — don't regenerate certs from scratch.

---

## Project gotchas (append as discovered)

### 2026-06-23 — Phase 0 build
- **`exactOptionalPropertyTypes: true` is on.** Passing an explicit `undefined` to an
  optional prop fails typecheck. Declare such props `foo?: T | undefined`, or omit them.
- **break_infinity.js vs raw JS multiply drift.** `Big.of(15).mul(1.15)` is not bit-identical
  to `15 * 1.15`. Don't assert `.eq()` on derived costs in tests — use `toBeCloseTo` on
  `.toNumber()` or compare formatted strings.
- **Guardrail test greps for the literal `Date.now(`** in `src/engine`. Even a *comment*
  mentioning it trips the test (working as intended). Reword comments to "reads the wall clock".
- **Playwright CDN is blocked by the sandbox network policy** (403 on cdn.playwright.dev).
  Don't `playwright install`. There's a pre-installed Chromium at `/opt/pw-browsers/.../chrome`;
  `scripts/screenshot.mjs` auto-detects it via `executablePath`. Launch with `--no-sandbox`.
- **Number-pop juice:** only pop on discrete jumps (claims/buys), not the per-tick trickle,
  or the counter flickers every frame. Threshold: delta > 2% of previous value (see ResourceBar).
- **Wall clock lives in the UI/state layer only.** `Date.now()` is in `store.ts`/`useGameLoop.ts`;
  the engine stays pure so the guardrail passes and offline = "one big tick".

### Balance (Step 0.11)
- **The sim earns its keep immediately.** First `npm run sim` run exposed a design bug a
  spreadsheet would've hidden: Money was decoupled from Compute (fixed 10-compute runs with
  fixed payout), so Compute scaling to 24M left Money stuck at ~15K forever — prestige
  unreachable. Fix: run cost AND payout scale with Compute production (`costSeconds`,
  `dataPerCompute`, `moneyPerCompute` in balance). The three-resource triangle only works
  if the resources are actually coupled.
- **Prestige gate = capability, not a money number.** Gating "Ship the Model" on lifetime
  Money let the player hit the wall *before* researching the capstone (Inference API). Gating
  on the capability research (`prestige.capabilityResearch`) guarantees the arc: climb tree →
  deploy → ship. Legacy Weights still scale off lifetime Money for the payout size.
- **Current Phase 0 pacing (first pass):** Gen1 ~12.5m, Gen2 ~1.5m (×3.25 from 45 weights),
  no walls. Later-gen weight gains diminish (45 → +14 → +12) — fine for Phase 0; Phase 1 eras
  extend each run. Re-run `npm run sim` after any balance edit before committing.

### Premium / liquid-glass UI (owner-directed visual pass)
- **Owner explicitly authorized art polish in Phase 0** (CLAUDE.md normally defers it). It's a
  pure reskin of the existing loop — no new game systems — so it doesn't breach the phase
  boundary that matters (no hall/events/staff pulled forward).
- **Liquid glass = `backdrop-filter: blur() saturate()` + translucent white + a specular top
  edge** (the `::before` padding+mask border trick) + soft layered shadows + an animated aurora
  behind it for the blur to refract. Light/airy palette (Airbnb-clean); brand CTA uses Airbnb
  coral (#ff385c).
- **Kept it pure CSS — no framer-motion / animation lib** to protect the Capacitor bundle
  (CSS is 3.4kb gzip). Spring feel via `cubic-bezier(0.34,1.56,0.64,1)`; entrance stagger via
  `nth-child` animation-delay; progress sheen + pulse-glow via keyframes.
- **`@media (prefers-reduced-motion)` disables all motion** — accessibility is part of "premium".
- `color-mix(in srgb, …)` used for accent tints; needs a modern engine (fine for iOS/WebKit
  and the Chromium screenshot tool).

### Screenshots for the owner
- `npm run shot` → seeded mid-game capture (phone viewport) into `screenshots/`.
- Flags: `--fresh` (empty new lab), `--full` (full-page incl. research+prestige),
  `--wide` (desktop viewport), `--onboard` (first-run welcome overlay), `--offline`
  (WIWA screen, 2h away), `--stats` (expand Lab Stats), `--settings`, `--celebrate`,
  `--name foo` (output name). Just ask "screenshot" and I'll run it.

### Randomness in a deterministic engine (data-market risk rolls)
- **Same rule as the wall clock: keep nondeterminism OUT of the engine — pass it in.** The dark-web
  data buys have a clean/poisoned/raided outcome; the engine fn takes `roll: number` in [0,1) as a
  parameter, the store supplies `Math.random()`, and tests pass exact rolls to hit each branch
  deterministically. Never call `Math.random()` inside `src/engine/`.
- **Big math is exact; JS float isn't.** `Big.of(220).mul(0.12)` ≠ `Big.of(220 * 0.12)` (the latter
  is 26.4000…02). In tests, compute the expected value the *same way the engine does* (`.mul(0.12)`),
  not with native float arithmetic.
- **Clamp money sinks that can exceed balance.** A raid fine can be larger than the player's money;
  clamp the deduction so resources never go negative (affordability only checked the base cost).

### Engine audit (whole-engine pass) — fixed + deliberately deferred
Fixed (real, low-risk):
- **`legacyWeightsGain` must be Big-native.** It used `.toNumber()` then `Math.pow`/`Math.floor`,
  which returns `Infinity` once `lifetimeMoney` exceeds ~1e308 — permanently poisoning
  `legacyWeights` and every derived multiplier. Now `ratio.pow(exp).floor().max(1)` on Big. This
  is THE reason the Big abstraction exists; never round-trip resources through `toNumber()` for
  anything but UI ratios. (Added `Big.floor()`.)
- **`deserialize` hardened against partial/v0 saves.** It dereferenced `raw.resources.*` and
  `raw.prestige.*` blindly, but `migrate` only backfills `lifetimeMoney`/`heat` — so a true v0
  save (no `prestige`/`version`) threw, and `store.init`'s catch then WIPED the save. Now every
  field defaults from a fresh state, so partial/corrupt saves degrade gracefully.

Deferred on purpose (documented, not fixed unsupervised — current balance doesn't hit them):
- **Offline auto-train credits the whole window's Compute up front** before the run loop spends it,
  so offline run-count can differ from an equivalent live session. Harmless at current values
  (run 5s, cost 2s); fixing it means interleaving accrual inside the delicate offline loop —
  do it deliberately with the owner, not at 3am.
- **`tick`'s `guard < 100000`** silently drops runs if the offline cap is ever raised enormously
  (8h @ 5s = ~5760 iters today, safe). If the cap grows, derive the guard from it / carry remainder.
- **`runSpeedMult` uses an unclamped `Math.pow(1-perLevel, level)`** — safe today (0.94^12), but a
  future `perLevel >= 1` would zero/negate duration; the `Math.max(0.5,…)` clamp currently masks it.
- **`migrate` doesn't reject `version > SAVE_VERSION`** — only matters across app downgrades, N/A
  for a single-build prototype.

### Deepening the research tree shifts the WHOLE curve (re-sim after)
- Adding parallel **multiplier** nodes (extra ×compute/×data/×money) compounds the snowball, so a
  deeper tree makes the first prestige *earlier*, not later, even though there are more nodes to buy.
  Deepening from 5→11 nodes pulled first-ship from ~15m to ~8.5m until the late-gate costs were
  raised to bring it back to ~10.5m. Always re-run `npm run sim` after touching research.
- **Reveal in waves** in the UI: ResearchPanel shows owned/available nodes plus the *next* wave
  (locked nodes whose prereqs are owned-or-available), not the whole tree — keeps a deep tree from
  dumping (GDD spine #3). The branching `requires` is what makes "waves" meaningful.
- Sim hygiene: exclude non-production upgrades (automations, hall expansions) from the greedy
  "buy cheapest production upgrade" loop, or the sim wastes money on them and skews the curve.
- Current healthy curve: first ship ~10.5m, longest wall 0m55s, meta-loop compounds (gen 2–3 < 1m),
  ~72 Legacy Weights on first ship. `scaling_laws` is intentionally an optional post-ship power node,
  so "all research before prestige" is correctly NO.

### Balancing the Data Market (use the sim's EV table, not vibes)
- `npm run sim` now prints a **Data Market EV table**: clean data-per-$ and *expected* data-per-$
  for shady offers at Heat 0/50/100 (folding in poison/raid chance + the fine). This is how the
  Bazaar was tuned — analytically, not by guessing rolls.
- **Design target:** the Bazaar should BEAT the best legit ratio when cold (risk premium ≈ +35%,
  ~1.6 d/$ vs ClosedAI's 1.2), reach parity around mid Heat, and fall BELOW legit at max Heat
  (~0.8). The poison chance is the dominant EV drag — small changes there swing EV a lot.
- **Evidence finding (open design question, NOT yet acted on):** the market is currently *optional*
  for an engaged player — the sim's market-using policy hits the SAME first-prestige time as
  baseline because runs already supply enough Data; research is never data-bottlenecked. If we
  want the market to feel necessary rather than a catch-up/convenience tool, that's a deliberate
  research-cost rebalance for the owner to greenlight — don't force it silently.

### The 2.5D hall (Canvas 2D, parametric, no assets)
- **Assets are a hard no** (CLAUDE.md): no PNG/sprite/3D files — they bloat the Capacitor bundle and
  break the art direction. Quality comes from *better parametric rendering*: gradient-shaded faces,
  server-unit detail, rim lighting, floor light-spill, room enclosure, and additive particles. All
  in `src/render/hallRenderer.ts`, zero deps.
- **Keep the renderer pure** (`drawHall(ctx, model, opts)`); a React wrapper (`HallCanvas.tsx`) owns
  the canvas/rAF. The view-model (`buildHallModel`) is derived from game state and is the only thing
  the renderer reads — engine never imports render.
- **rAF lifecycle footgun:** guard the loop with a `running` flag and make start()/stop() idempotent.
  A naive `if (!raf)` check can spawn a second loop because a queued frame callback can run once
  after the tab hides and reassign `raf`. The visibilitychange handler just calls start()/stop().
- **Don't rebuild the model every frame.** Cache it behind a cheap signature of render-affecting
  fields (rack counts, run.active, era) — `run.progress` is excluded because the renderer animates
  from the clock, not progress. Saves ~46 object allocs/frame.
- **Particles are stateless:** each mote's position is a pure function of (index, time) via a hash
  seed, so there's no per-frame particle bookkeeping and it's deterministic.
- **DEFERRED perf path (do if profiling shows jank on low-end Android):** pre-render each
  (tier, size/density bucket) static rack body — faces + seams + power column — to an offscreen
  canvas ONCE, then each frame blit it and draw only the dynamic overlays (blinking LEDs, work glow,
  power-on bloom, light-spill). Eliminates the ~180 gradient objects/frame a full hall creates.
  iOS handles the current load fine, so this isn't done yet.

### Modifiers + large ticks: segment at expiry
- A timed buff folded into `derive()` as a flat multiplier will over-apply if a single `tick` window
  is longer than the buff's remaining time (a buff with 5s left would double an 8h offline catch-up).
  Fix: at the top of `tick`, if any modifier expires within the window, split the tick at the
  earliest expiry and recurse. Recursion depth is bounded by the number of distinct expiries.

### Time-driven random events without breaking determinism
- **The engine must stay deterministic, but events need to fire randomly over time.** Resolution:
  the per-frame `advance()` in the STORE rolls `Math.random()` and calls a pure engine fn
  (`maybeHeatEvent(state, seconds, fireRoll, pickRoll)`); the engine only ever consumes the rolls
  passed in. Same boundary as the wall clock and the data-market roll.
- **Don't fire events during the offline catch-up tick.** Offline goes through one big
  `applyOffline` tick, not `advance`, so events naturally only happen during live play — which is
  what you want (no "you were raided while away" surprise on a returning load).
- **Scale per-frame event probability by elapsed seconds and CAP it.** A tab-refocus can hand you
  a multi-second frame; without a cap, `chance = rate*seconds` can approach 1 and an event becomes
  near-certain in one frame. `balance.heat.eventChanceCap` guards this.
- **Surfacing a store event to React:** keep a `{ key, ... }` on the store and bump `key` each
  fire; the UI effect depends on `event?.key` so even a repeat of the same event re-triggers.

### Hydration vs. "on-unlock" UI (toasts, reveals)
- **The store boots with `createInitialState()` (empty), then `init()` hydrates the save in an
  effect AFTER first paint.** So any "fire on transition false→true" UI (unlock toasts,
  progressive-reveal animations) will spuriously fire on the empty→loaded hydration for a
  RETURNING player — they'd see "Research unlocked" every reload.
- **Fix pattern:** store exposes an `initialized` flag (set true in `init()`); the effect waits
  for it, then on the first settled pass syncs its "seen" refs to the loaded state WITHOUT
  firing, and only reacts to genuine in-play transitions after that. See `App.tsx` toast effect.
- The `--offline` screenshot mode is the quickest way to catch this class of bug (it loads a
  populated save just like a returning player).

### Timers in components that re-render every tick (the "toast never disappears" trap)
- **The app re-renders ~10×/sec** (the 10 Hz `advance` tick updates `game`, and `App` subscribes
  to it). Any child `useEffect` that sets a `setTimeout` and lists a **prop callback** in its deps
  will have that effect cleared+re-run on EVERY parent render if the callback isn't memoized — so
  the timeout is perpetually reset and **never fires**. This is exactly why unlock toasts got stuck
  on screen forever.
- **Fix pattern:** keep the callback in a ref (`onDoneRef.current = onDone`) and depend only on
  stable values (the item id), so the timer is armed once per item. Memoize the parent's
  `push`/`drop` helpers with `useCallback` too. Cap transient stacks (e.g. last 3) so a burst can't
  bury the screen. See `Toast.tsx` / `App.tsx`.
- General rule: in this codebase, treat "depends on a function prop" in a timer/interval effect as
  a bug unless that prop is `useCallback`-stable.

### Canvas perf: cache the static layer, cap the frame rate
- The hall's rAF loop rebuilt every gradient + the whole floor grid each frame. Big mobile win:
  paint the **static** parts (sky + walls + floor — depend only on room size/era) once into an
  offscreen canvas and **blit** it each frame; only the animated layer (racks/motes/markers/burst)
  redraws. Split is `drawHallStatic` + `drawHallDynamic` in `hallRenderer.ts`; the cache key in
  `HallCanvas.tsx` is `cols|rows|era|cssW|cssH|dpr`. Also cap paint to ~30fps (motion reads from
  the clock, so it still looks smooth). The opaque blit fully overwrites the prior frame, so no
  `clearRect` is needed.

### Auto-train can starve banked Compute (why the compute-gated research stalls)
- A run costs `computePerSec × costSeconds` (≈2× income) and yields Data/Money.
  Auto-train re-fires the instant `compute ≥ runCost`, so banked Compute is
  capped at ~one run's cost. Compute-COSTED research (MoE 75K, Inference API 130K,
  Scaling 300K) needs Compute *banked* — and it never gets there.
- It's worse once run duration is short (Batch Scheduler + KV Cache + Distillation):
  if `runDurationSec < costSeconds`, each auto-train cycle spends more than income
  replenishes, draining the bank toward zero. Player ends up with mountains of
  Data/Money and stuck Compute (real player report).
- **Fix — Compute Focus (`game.computeFocus`, 0..1, save v4→v5):** auto-train only
  fires once `compute ≥ runCost / focus`, so lowering focus lets the bank float up
  to `runCost/focus` (focus=0 = hold, no auto-train). Manual runs ignore it. A
  slider in the TrainingDock exposes it. focus=1 is byte-identical to the old gate
  (`compute ≥ runCost`), so existing saves + the balance sim are unchanged.

### Hall geometry/capacity is a GAME RULE, not just a view concern
- Rack capacity (you can only own as many racks as the floor has tiles → must expand) lives in
  `src/engine/hall.ts` so BOTH the engine (`canBuyUpgrade` gate) and the renderer view-model can
  use it. Putting it in `render/hallModel.ts` would have created an import cycle (actions ↔
  hallModel). `hall.ts` imports only `balance` + types, so no cycle. `buildHallModel` still
  downsamples for over-capacity (legacy/loaded saves) — the gate only blocks NEW purchases.
- **Per-tick rates that decay/grow must NOT be linearized for big (offline) ticks.** The product
  sim originally did `paid - paid*churn*seconds`; over an 8h offline catch-up (one ~28,800s tick)
  that term dwarfs `paid` → clamps to 0, silently wiping the entire paying base (even "sticky"
  products) on every reopen. Fix: solve the subscriber ODE in closed form —
  `paid = pStar + (paid0 - pStar)*exp(-k*seconds)` with `k = convSpeed + churn`,
  `pStar = convSpeed*target/k` — and bill revenue on the exact time-INTEGRAL of that curve, not the
  endpoint or a trapezoid. This matches the old per-frame math for small ticks (so balance is
  unchanged online) and converges sanely offline. Rule: anything of the form `x -= x*rate*dt` is a
  bug waiting for a large `dt`; use `x *= exp(-rate*dt)` (bounded) instead. Also: format negative
  money sign-OUTSIDE the unit (`-$5K`, not raw ungrouped `$-5000`) — `formatBig` only suffixes
  values ≥1000 and assumed positivity, so losses overflowed the card.
