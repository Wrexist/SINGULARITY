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
