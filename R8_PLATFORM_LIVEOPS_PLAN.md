# R8 — Platform & LiveOps (the next big thing)
*Owner-selected 2026-06-28. The post-launch roadmap's R0–R7 critical path is essentially
shipped (350 tests green, sim first-prestige 12m15s). R8 is the chosen next wave: turn balance
tuning from vibes into **data**, make the save **durable**, and **widen the platform**. Source
of truth for *what* the game is: the GDD. Plan in `POST_LAUNCH_ROADMAP.md §R8` — this file is
the detailed build plan.*

---

## 0. Guardrails (every item obeys these — non-negotiable, inherited from the roadmap)
1. **Three in-run resources only.** R8 adds no gameplay numbers — it's plumbing + reach.
2. **Engine stays pure & deterministic.** No `Date.now()` / `Math.random()` / network / storage in
   `src/engine/`. All telemetry, sync, and platform glue live in the **store / UI layer** — the same
   boundary that already owns the wall clock and the RNG rolls (see `LEARNINGS.md`).
3. **Compounding meta-terms stay hard-gated** → the tuned curve is byte-identical. R8 touches **no**
   balance, so `npm run sim` must remain **12m15s** at every step (a regression test of the wave).
4. **Humor in writing, no dark patterns, no image assets, cosmetic-only IAP.**
5. **PRIVACY IS A FEATURE, NOT A FOOTNOTE.** The shipped App Store privacy label is **"Data Not
   Collected"** (`appstore/`). R8.1 is engineered to *keep* that true. Anything that would change it
   (any off-device transmission) is called out explicitly and gated behind owner sign-off, because it
   forces an App Store privacy-label change and a re-review consideration.

---

## 1. Why R8, why now
- The endgame was retuned **by simulation, not by observed play** (R4). We have no idea where real
  players actually wall, rage-quit, or get bored. The sim models a greedy optimal player; humans
  aren't that. **R8.1 closes the loop**: it measures the real curve on-device so the *next* balance
  pass is evidence-driven.
- The save is a single `localStorage` blob. A reinstall, an iOS storage purge, or a device swap wipes
  a player's entire progression. For an idle game whose whole value proposition is *compounding
  long-term progress*, that's the highest-severity non-crash risk. **R8.2 makes progress durable.**
- The engine is already pure and portable — that was always the bet (`CLAUDE.md`: "it's what lets a
  Steam port reuse the core later"). **R8.3/R8.4 cash that bet** for marginal cost (Capacitor already
  targets Android; the engine is React-free).

---

## 2. The wave at a glance (sequenced by risk & dependency)

```
R8.1  Local telemetry instrument ...... on-device only · no privacy change · NO secrets · build NOW
R8.2  Durable save (export → cloud) .... export/import hardening first, then a backend (owner call)
R8.3  Android build .................... cap add android + CI workflow mirroring iOS · owner secrets
R8.4  Steam/desktop port eval ......... a written feasibility memo, not code · do last
```

**Sequencing logic.** R8.1 is the instrument and is 100% buildable in this repo today (no device, no
secrets, no privacy change) — so it goes first, exactly like R0.2's sim went first for R4. R8.2 starts
from the `exportSave`/`importSave` that **already exist** in `store.ts` (harden them into a real
backup UX), then layers an *optional* cloud sync behind an interface — the backend choice is an owner
decision (see §R8.2). R8.3 is mechanical once R8.1 ships (mirror `ios-testflight.yml`). R8.4 is a memo.

**Effort:** S ≤ ½ day · M ~1–2 days · L ~3+ days · XL ~1 week+.

---

## R8.1 — Local telemetry instrument *(P2, M) — BUILD FIRST*
*Goal: an on-device, opt-out record of how the game is actually played, visible to the player, that
never leaves the device — so it informs balance without changing the privacy label.*

### Privacy contract (the thing that makes this shippable)
- **100% on-device.** Stored in its **own** `localStorage` key (`singularity.telemetry.v1`), never in
  the versioned game save (so it can't corrupt a save — same isolation `daily.ts`/`settings.ts` use).
- **No transmission, no backend, no network call. No PII** (no ids, no device info, no timestamps that
  could fingerprint — only elapsed durations and counters). → The App Store label stays **"Data Not
  Collected."** This is asserted in the plan and must stay true; if a future item wants to *send* this
  data, that's a new, separately-greenlit decision (and a privacy-label change).
- **Player-visible & opt-out.** A "Diagnostics" panel in Settings shows the player their own numbers
  and a one-tap **Clear** + **off** switch. Honest by design (GDD §6) — it's the player's data, shown
  to the player.

### Architecture (engine stays pure)
- **`src/engine/telemetry.ts` — PURE aggregation.** The summarization is a pure fold:
  `summarize(events: TelemetryEvent[]): TelemetrySummary`. No clock, no storage — just data→data, so
  it's unit-testable like every other engine module. (Lives under `engine/` because it's pure; it
  imports only types. The *recording* of events — which needs the clock — lives in the store.)
- **`src/state/telemetry.ts` — IMPURE recorder.** Owns the `localStorage` key, reads `Date.now()`,
  appends events to a capped ring buffer (e.g. last 500), exposes `record(evt)`, `getEvents()`,
  `clear()`, and an `enabled` flag. Mirrors `daily.ts`'s separate-key, try/catch-guarded pattern.
- **Store hooks.** `store.advance()` already detects prev→next transitions (training done, milestones,
  achievements) — telemetry rides the *same* diff. Emit on:
  - **prestige** (`doPrestige`): generation index, run wall-clock seconds, weights gained, era reached.
  - **era arrival**: era index + seconds-into-run (the "era-arrival times" the roadmap wants).
  - **session**: start (in `init`) and a heartbeat/duration on save; offline duration on load.
  - **wall detection**: longest interval with no upgrade/research/ship purchased (the "wall points"
    R8.1 names). Derived in the pure summarizer from purchase-event timestamps, not stored separately.
  - **tab usage**: increment a per-tab counter on tab switch (UI layer).
- **Settings integration.** Extend `useSettings` with a `telemetry: boolean` (default decided by
  owner — recommend **ON**, since it's local-only and the value is the whole point; trivially flipped
  as it's one default). `SettingsSheet` gets a "Diagnostics (on-device)" section: the toggle, a compact
  summary (time-to-first-prestige, gen times, current session length, most-used tab, detected wall),
  and **Clear data**.

### Acceptance criteria
- `summarize()` is pure + table-tested (given fixture events → expected summary; wall detection;
  empty/garbage input degrades gracefully).
- Telemetry persists to its own key; **the game save round-trips byte-identically** (telemetry never
  touches `SAVE_KEY`). A test asserts the save serializer is unchanged.
- `npm run sim` = **12m15s** (no engine/balance change). `npm test` green. `tsc` clean.
- Guardrail grep still passes (no `Date.now(`/`Math.random(` added under `src/engine/`; the recorder is
  under `src/state/`).
- Privacy: a code-search confirms zero network calls in the telemetry path.

### Out of scope for R8.1 (deliberately)
- Any off-device send. Any remote dashboard. Those are R8.2-adjacent / a separate decision.

---

## R8.2 — Durable save: export → optional cloud *(P3, L) — owner backend decision*
*Goal: a player never loses a long-running save. Built in two shippable stages so value lands early.*

### Stage A — Harden local backup (no backend, build anytime after R8.1)
- `store.ts` **already** has `exportSave()` (base64) and `importSave()` (base64-or-JSON). Today they're
  a raw textarea in Settings. Harden into a real UX:
  - **Copy / Share** the backup string (Capacitor Share sheet on device → save to Files/Notes/email).
  - **Import with a confirm + dry-run validate** (we already validate; add a human-readable "this save
    is Gen N, era X, shipped Y times — overwrite your current run?" preview before committing).
  - **Auto-backup reminder**: a gentle, non-dark-pattern nudge to back up after a milestone ship
    (honest: no fake urgency, dismissible, never blocks play).
- Pure-ish: the preview summary reuses the same read models the UI already has. No engine change.

### Stage B — Optional cloud sync (OWNER DECISION REQUIRED — changes privacy posture)
Two viable backends; **this is a design call the owner must make** (flagged here, not chosen
unilaterally — `CLAUDE.md`: ask rather than guess on design calls):

| Option | What it is | Privacy / cost | Effort |
|---|---|---|---|
| **A. Apple iCloud (CloudKit/KVS)** ⭐ recommended | Save synced through the *user's own* iCloud account via a Capacitor plugin. | Cleanest: data lives in the **user's** iCloud, not a developer backend → typically **still "Data Not Collected"** by us. No server to run. iOS-only (fine — iOS is the primary target). | M–L |
| **B. Supabase (or similar) backend** | Developer-operated Postgres + auth; save row keyed to an account. | Requires accounts/auth, a privacy-label change ("Data Linked to You"), a privacy-policy update, ToS, and ongoing ops. Cross-platform (helps R8.3/R8.4). | L–XL |

- **Recommendation:** ship **Stage A** now (pure win, no privacy change), and do **iCloud (Option A)**
  for Stage B if/when cross-platform isn't yet needed — it's the least-privacy-invasive, no-backend
  path and matches the iOS-first posture. Revisit Option B only when Android/Steam (R8.3/R8.4) make a
  shared account genuinely necessary.
- **Architecture:** put cloud sync behind a `SaveSync` interface (exactly like `iap.ts` wraps
  StoreKit) so the engine/store never knows the backend. Web/dev keeps a no-op stub so tests/QA run.
- **Conflict policy:** last-writer-wins is wrong for idle (offline progress). Use **highest-progress
  wins** (compare a monotonic `lifetimeMoney`/playtime), with a manual "use local / use cloud" prompt
  on genuine divergence. Define this before building Stage B.

### Acceptance criteria
- Stage A: export/import has a confirm+preview; a round-trip (export → fresh state → import) restores
  an identical save (test). No privacy-label change. `npm test`/sim green.
- Stage B: behind the interface + stub; default OFF; privacy docs updated **before** it ships.

---

## R8.3 — Android build *(P3, M) — mechanical, owner secrets*
*Goal: widen reach. Capacitor already lists Android as a target; the engine is React-only; the hall is
parametric Canvas 2D (no native assets) → it should "just run."*

- **Add the platform on CI, not in git** (mirror the iOS pattern: `ios/` is gitignored and
  regenerated). New `.github/workflows/android.yml`: `npm ci` → `npm run build` → `cap add android` →
  `cap sync android` → Gradle assemble/bundle → upload artifact (and, later, Play Internal Testing via
  a service-account JSON secret).
- **Self-contained, like `ios-testflight.yml`.** No new app code beyond `capacitor.config.ts` already
  having the appId. Android signing = an upload keystore in secrets (owner action, parallel to the 4
  ASC secrets).
- **Verify the parametric renderer on Android WebView** (Chrome WebView ≠ WebKit): `backdrop-filter`,
  `color-mix`, Canvas DPR scaling, and `prefers-reduced-motion` all need a device/emulator check.
  Likely-fine but must be confirmed (note in `LEARNINGS.md` after).
- **Owner actions (flagged, not blockers for the workflow scaffold):** create the Play Console app
  record + upload keystore + service-account; decide package name (reuse `com.wrexist.singularityinc`).

### Acceptance criteria
- `android.yml` builds a signed AAB on a clean runner. App launches; hall renders; save persists;
  IAP path either works or is cleanly stubbed (StoreKit is iOS-only → Android needs Play Billing or
  premium hidden on Android v1 — decide explicitly). A `LEARNINGS.md` entry records WebView gotchas.

---

## R8.4 — Steam / desktop port eval *(P3, XL) — written memo, not code*
*Goal: a decision-quality feasibility memo, since the pure engine makes it plausible (GDD §10).*

- Deliverable: `STEAM_EVAL.md` covering: shell choice (Tauri ⭐ vs Electron — Tauri keeps the lean-bundle
  ethos; the engine is portable as-is), input/resolution/windowing changes, save-path differences,
  IAP→premium-unlock model on Steam, the (lack of) image-asset problem, effort estimate, and a
  go/no-go recommendation tied to observed TestFlight/Play retention (R8.1 data + R8.3 reach).
- **No code in this item** — it's the gate before any XL desktop investment.

---

## 3. Build order for *this* session (smallest change that proves the next thing)
1. ✅ Plan (this doc) + `TASK.md` + `CLAUDE.md` phase line.
2. **R8.1** end-to-end (pure summarizer + recorder + store hooks + Settings panel + tests). The
   instrument, fully on-device, no privacy change — the safe, high-value first slice.
3. **R8.2 Stage A** (harden export/import into a real backup UX) — pure win, no backend.
4. Pause for the **owner backend decision** (R8.2 Stage B) and **Android secrets** (R8.3) before any
   off-device or platform work.

## 4. Risks & counters
- **Privacy-label regression** → R8.1 is provably on-device (no-network assertion in tests/review);
  any send is a separate greenlit decision with a docs update *before* shipping.
- **Save corruption from a new system** → telemetry uses an isolated key and never touches `SAVE_KEY`
  (test-asserted), exactly like `daily.ts`.
- **Curve drift** → R8 touches no balance; `npm run sim` 12m15s is a per-step regression check.
- **Scope creep into a backend** → staged: local-only value (R8.1, R8.2-A) ships before any backend;
  the backend is explicitly gated on an owner call.
- **WebView rendering differences on Android** → device/emulator verification gate in R8.3 before any
  Play submission; findings recorded in `LEARNINGS.md`.
