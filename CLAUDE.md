# CLAUDE.md — Singularity Inc.
*Master context for Claude Code. Read this fully at the start of every session before touching code.*

---

## What this project is
An AI compute tycoon (idle/incremental + management) with a 2.5D data-center hall, a 3-resource economy (Compute / Data / Money), an AI-research tech tree, a "Ship the Model" prestige loop, and a satirical voice. Full design lives in `SINGULARITY_INC_GDD.md` — that is the source of truth for *what* to build. This file is *how* to work.

**The design spine (never violate without explicit owner sign-off):**
1. Clean 2.5D hall that grows visibly as compute scales (upgrades physically manifest).
2. Three resources only. Legibility is the feature.
3. Research tree is the progression spine; reveal depth in waves, never dump.
4. Prestige ("Ship the Model") is core, not optional.
5. Humor lives in writing/events; systems stay clean.

## The current phase (UPDATE THIS LINE EVERY SESSION)
> **PHASE 4 — Post-launch growth (in progress).** The game is LIVE on TestFlight and stable.
> Phases 0–3 complete (MVP + 2.5D hall, power/heat, staff, events/factions, eras 0–6 + AGI ascension,
> Products business, achievements, Lab Reputation). The audit-driven growth plan lives in
> `POST_LAUNCH_ROADMAP.md` (R0–R8: balance · friendliness · interactivity · fun). The approved
> "five things" critical path (R0–R5) is essentially shipped (350 tests, sim 12m15s). **Active wave:
> R8 — Platform & LiveOps** (owner-picked 2026-06-28, plan in `R8_PLATFORM_LIVEOPS_PLAN.md`): on-device
> **telemetry** (build first — instrument the real curve, zero privacy change), **durable save**
> (harden export/import → optional cloud behind an interface, backend = owner call), **Android** (CI
> workflow mirroring iOS), and a **Steam** feasibility memo. R8 platform work touches NO balance on its
> own; the current tuned curve is the retune below (NOT the old 12m15s — see CURVE).
> See `TASK.md` for live status.
> Rendering: **Canvas 2D isometric** (parametric, no image assets). Hard rules still hold: 3 in-run
> resources only (Legacy/Reputation are meta-currencies, not a 4th resource); engine pure/deterministic;
> humor in writing not math; all new systems are data-in-`balance/` + pure folds + tests.
> **CURVE (retuned 2026-06-29 in two owner steps — "a lot harder/slower", then "much longer"):**
> first prestige **≈ 59–72m** (one good session / a multi-check climb), meta-loop **Gen2 ≈ 13–15m,
> Gen3 ≈ 10m**, longest dead-air gap **~3m** (purchases keep flowing). Pace is set by THREE separated
> knobs in **`balance.difficulty`** (each acts on a different part of the curve — see LEARNINGS):
> **`costMult` (2.0)** scales RESEARCH cost — but research is gated by a fixed COMPUTE stock against a
> fixed income ceiling, so pushing this WALLS the game (~2.5 = unreachable in 240m); leave it modest.
> **`upgradeCostMult` (1.6)** is the SAFE length dial — scales upgrade cost only, stretching the
> hall-build-out journey (the fun, purchase-dense part) WITHOUT touching the research gate, so it
> lengthens without walling. **`productionMult` (1.0 = identity)** is a global income-rate dilation
> (documented spare lever; also walls if pushed). The Legacy snowball is bounded by `prestige.scale`
> (1e5) + `multiplierPerPoint` (0.018). To re-pace: move `upgradeCostMult`, re-run `npm run sim`,
> watch BOTH "First prestige" and "Longest wall". NOTE: `TASK.md` entries citing "sim 12m15s" or
> "≈38m" are historical records from before these retunes, not the current target.

If a request would pull work forward from a later phase, STOP and flag it. Scope drift is this project's #1 documented risk. Protecting the phase boundary is part of your job.

---

## Tech stack (ported from Silicon Tech Tycoon)
- **Framework:** React 18 + TypeScript (strict) + Vite
- **State:** Zustand (single source of truth for game state; see conventions below)
- **Mobile shell:** Capacitor (iOS primary target; Android later)
- **Rendering (Phase 1+ only):** parametric — boxes/lights, no image assets, batched. Decide Pixi vs Three vs Canvas when the hall is actually built, not before.
- **Persistence:** local save (serialize Zustand store), versioned with a migration function from day one.
- **No backend in Phase 1.** Everything local. Don't add a server.

## Architecture conventions (hard rules — these mirror the owner's established workflow)
- **Logic / UI separation is strict.** Game simulation (resource ticks, offline calc, prestige math, research effects) lives in pure, framework-agnostic TS modules under `src/engine/` with ZERO React imports. UI under `src/ui/` consumes engine output. This makes the engine unit-testable and portable (it's what lets a Steam port reuse the core later).
- **The engine is deterministic and testable.** Given a state + elapsed time, `tick()` returns the next state. No `Date.now()` inside the engine — pass time in. This is non-negotiable; it's what makes offline progress and balancing tractable.
- **Numbers use a BigNumber abstraction** from the start (idle games overflow `number` fast). Wrap it so it can be swapped.
- **All tunable values live in `src/engine/balance/` as data**, never hardcoded in logic. Balancing is a first-class workstream; it must be editable without touching code.
- **Commit-per-turn discipline.** One logical change per commit, descriptive message. Matches owner's established habit.

## Working agreement (how the owner wants you to operate)
- The owner wants a **rigorous engineering partner, not a yes-man.** If an instruction is unwise (scope creep, premature optimization, a balance value that breaks the curve), say so with reasoning and propose a better path. Push back grounded in evidence.
- Read `TASK.md` for the active task list. Update it as you go. Read `LEARNINGS.md` for accumulated gotchas before solving anything non-trivial — and append to it when you learn something that'd save a future session time.
- Prefer the smallest change that proves the next thing. This project ships by staying small.
- When unsure about a design call, check the GDD first; if still unsure, ask rather than guess and build the wrong thing.

## What NOT to do
- Do not build later-phase systems early (see phase line above).
- Do not add image assets (breaks the parametric philosophy + bloats the Capacitor bundle).
- Do not add dark-pattern retention mechanics (fake-urgency timers, manipulative pop-ups, energy gates that exist only to sell skips). The GDD commits to honest juice; this also keeps App Store review clean.
- Do not introduce crypto/real-money-earning framing. This is explicitly an AI-compute game; the crypto theme was rejected for review-risk and saturation reasons.
- Do not hardcode balance values into logic.

## Session start checklist (do this every time)
1. Read this file, then `TASK.md`, then skim `LEARNINGS.md`.
2. Confirm the current phase line above. If the task isn't in-phase, flag it.
3. Run the test suite (`npm test`) before and after your changes.
4. Commit per logical change.
5. Before ending: update `TASK.md`, append any new gotcha to `LEARNINGS.md`.

## iOS TestFlight Deployment (self-contained)

This repo ships to TestFlight via its **own** workflow,
`.github/workflows/ios-testflight.yml`. It is deliberately **self-contained**:
a GitHub macOS runner builds the Capacitor app and signs it with Xcode
**automatic (cloud-managed) signing** driven by an App Store Connect API key,
then uploads via `altool`. There is **no** Fastlane Match and **no** dependency
on the `Wrexist/ios-certificates` repo — that kit was evaluated and rejected
here because it requires changing/operating that repo (its secrets + an
onboarding run that writes certs into it), which is out of scope for this app.

- **Bundle ID:** `com.wrexist.singularityinc`
- **Trigger:** Actions tab → **iOS TestFlight** → Run workflow (also runs on
  pushing an `ios-v*` tag).
- **Build number** (`CFBundleVersion`) = the GitHub Actions run number (always rising).
- **Marketing version** (`CFBundleShortVersionString`) = the **`marketing_version`** workflow
  input (default `1.0`, i.e. unchanged behaviour), or an `ios-v<ver>` tag. Apple **rejects** an
  upload whose marketing version isn't higher than the last *approved/released* App Store version
  ("train 'X' is closed for new build submissions", error 90062/90186). While a train is open you
  can keep uploading builds to it (only the build number must rise); once a version is
  approved/released, bump this for the next batch (Actions → Run workflow → set `marketing_version`
  e.g. `1.0.1`, or push tag `ios-v1.0.1`).
- **Secrets (4, all on THIS repo only):** `APPLE_TEAM_ID`, `ASC_KEY_ID`,
  `ASC_ISSUER_ID`, `ASC_KEY_P8`.
- **`ios/` is gitignored** and regenerated on the runner (`cap add ios`); the
  workflow handles this inline, so nothing native is committed.

### ⚠️ Merging ≠ Shipping to TestFlight

Merging a fix into `main` does not change the binary on anyone's phone — you
must run the workflow. After merging a user-visible fix, tell the user:

> The fix is on `main`, but your phone still runs the previous TestFlight
> build. To deploy: Actions → **iOS TestFlight** → Run workflow → wait ~15 min
> for the build + Apple processing → update from the TestFlight app.

### ⚠️ `ASC_KEY_P8` format (the trap that caused the original failure)

Store `ASC_KEY_P8` as **either** the raw `AuthKey_XXXX.p8` contents (including
the `-----BEGIN PRIVATE KEY-----` / `END` lines) **or** its base64
(`base64 -i AuthKey_XXXX.p8`). No trailing newline/space, and don't paste the
Key ID / Issuer ID by mistake. A truncated or wrong value shows up as
"ASC_KEY_P8 is not a valid App Store Connect .p8 key".
