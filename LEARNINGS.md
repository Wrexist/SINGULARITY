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

### Screenshots for the owner
- `npm run shot` → seeded mid-game capture (phone viewport) into `screenshots/`.
- Flags: `--fresh` (empty new lab), `--full` (full-page incl. research+prestige),
  `--wide` (desktop viewport), `--name foo` (output name). Just ask "screenshot" and I'll run it.
