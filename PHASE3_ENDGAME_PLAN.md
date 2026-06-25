# Phase 3 — Endgame & Spectacle (comprehensive plan)

*Owner asked for a detailed plan covering all four endgame directions. This is the
sequenced build order, dependencies, engineering breakdown, tests, and risk notes.
Source of truth for **what**: GDD §9 "Phase 3 — Endgame & spectacle". This file is
**how**.*

## Where the build actually is (reconciled vs. the GDD roadmap)
- **Phase 1 (Shippable MVP):** ✅ 2.5D hall + manifestation, research tree, Ship-the-Model
  prestige, events, offline modal, era transitions, premium IAP, settings, save/load.
- **Phase 2 (Depth wave):** ✅ power/heat **live**, individual-employee staff + assignment,
  event engine + factions, **5 eras** (Garage Closet → Hyperscaler).
- **Beyond roadmap:** full Products business (commercialise shipped models) — deeper than
  the GDD envisioned.
- **Phase 3 (Endgame):** ❌ not started. Leaderboards are explicitly **out** (no backend in
  this product). The four directions below are the rest.

The CLAUDE.md phase line is stale (says Phase 1). It will be updated to Phase 3 as part of
step 0.

---

## The dependency spine (why this order)
```
0. Lifetime Stats store  ──┬──> 1. Achievements ──┐
   (persistent counters)   │                      ├──> 3. Lab Reputation (meta-layer)
                           └──> 2. AGI Era 6 ──────┘
                                                        4. Polish & ship-prep (validates all)
```
Everything needs **persistent, cross-run counters** that don't exist yet (`lifetimeMoney` is
per-run; only `prestige.ships`, `products.sold/milestones/frontier` survive a ship). Building
that store first (step 0) unblocks Achievements (metrics), the AGI gate (a "total legacy"
threshold), and Lab Reputation (its earn formula). So step 0 is shared foundation, not a tax.

---

## Step 0 — Lifetime Stats store (shared foundation) · ~½ day · LOW risk
**Goal:** one pure, persistent `stats` object that accumulates across runs and prestige.

- **Engine:** add `stats: LifetimeStats` to `GameState` (survives prestige like `ships`).
  Fields (all plain numbers/Big, monotonic): `lifetimeMoney` (across runs), `peakComputePerSec`,
  `totalShips`, `totalLegacy`, `productsLaunched`, `versionsResearched`, `employeesHired`,
  `peakMrr`, `peakMau`, `worldEventsResolved`, `playtimeSec`.
- **Update site:** a pure `accrueStats(state, derived, dtSec)` folded once per tick (cheap,
  monotonic maxes + counters). Discrete events (launch, hire, ship, version) bump their counter
  at the action site.
- **Persistence:** add to `SavedShape`; **save v8 → v9** migration backfills a zeroed `stats`
  (seed `totalShips` from `prestige.ships`, `lifetimeMoney` from existing where possible).
- **Tests:** monotonicity (never decreases), prestige carry-over, migration backfill.
- **Risk:** low — additive, no balance impact. Just plumbing the other three stand on.

---

## Step 1 — Achievements · ~1–1.5 days · LOW risk *(recommended first feature)*
**Goal:** a cross-system badge collection that spans hall / research / prestige / products /
staff — the retention + dopamine layer (GDD §6), done honestly (no fake-urgency).

- **Data:** `src/engine/balance/achievements.ts` — `AchievementDef[]` mirroring the
  `productMilestones` shape: `{ id, label, desc, tier, metric, threshold, reward? }`. ~30–40
  defs across categories: Compute scale, Data, Money/MRR, Ships, Eras reached, Research depth,
  Products (launched/version/competitiveness), Staff (headcount/level/traits), Events survived,
  "secret"/satirical ones (e.g. *Intern Deleted Prod*, *Survived a Raid*).
- **Engine:** `src/engine/achievements.ts` — pure `evaluateAchievements(state)` reads the
  `stats` store + live state, returns newly-unlocked ids. `achievementProgress(state, def)` for
  the UI bars. Reward (if any) is a one-time Legacy/Money grant or a Reputation point (ties to
  step 3). Persist unlocked ids in `state.achievements: string[]` (survives prestige).
- **Store/juice:** fold `evaluateAchievements` into the tick; fire a `notice` toast +
  haptics.celebrate on unlock (reuse the milestone surfacing path).
- **UI:** an Achievements screen (modal or a tab on the Stats panel) — grid of badges with
  locked/unlocked state, progress bars, category filter, an `N/total` counter. Parametric badge
  art (initials/emoji + tier color) — no image assets, per the design spine.
- **Tests:** unlock detection at threshold, idempotence (no re-fire), persistence across
  prestige, progress math, save round-trip.
- **Risk:** low — additive, self-contained, reuses milestone patterns. Best ROI now.

---

## Step 2 — Era 6: Post-Singularity / "AGI" + spectacle · ~1.5–2 days · MEDIUM risk
**Goal:** a sixth era beyond Hyperscaler and a tentpole "you built AGI" moment.

- **Engine:** extend `currentEra` with `agiAtShips` (era 5); add the threshold to `balance.eras`.
  Decide the spectacle: either (a) a **capstone AGI prestige** — a rarer, bigger reset that
  grants a large Reputation/Legacy bonus and flips an "ascended" cosmetic flag, or (b) a pure
  era re-skin + transition with escalated production. Recommend **(a)** gated behind a deep
  research node (`agi_capability`) + a `totalLegacy` threshold from step 0, so it's earned.
- **Renderer:** a 6th `ERA_BG`/`ERA_FLOOR` palette (post-singularity: bright/white/iridescent)
  + the existing `EraTransition` tentpole reused for the AGI moment (distinct copy + fanfare).
- **Balance:** the new tier needs sim coverage — extend `scripts/balance-sim.ts` to model the
  6th era's thresholds so we don't ship an unreachable or trivial wall. Re-run `npm run sim`.
- **Tests:** era boundary at the new threshold, AGI gate (locked until research + legacy),
  transition fires once, save round-trip of the ascended flag.
- **Risk:** medium — touches the prestige/era curve; mitigated by sim validation + keeping the
  AGI reset opt-in (the player chooses to ascend).

---

## Step 3 — Lab Reputation (meta-progression layer) · ~2–3 days · HIGHER risk
**Goal:** a second persistent currency above prestige — permanent perks that span ALL runs,
giving the late game a reason to keep shipping (GDD §3 "reveal depth in waves").

- **Engine:** `reputation: { points: number; perks: string[] }` in `GameState` (persists through
  BOTH prestige and AGI ascension). Earned from: achievement unlocks, milestones, ships, and the
  AGI capstone. Pure `reputationGain(...)` + `buyReputationPerk(...)`.
- **Data:** `src/engine/balance/reputation.ts` — a small permanent perk tree (`ReputationPerk[]`):
  e.g. *+X% all production*, *start each run with N free racks*, *cheaper first research tier*,
  *+1 product slot*, *payroll discount*, *faster offline catch-up*. Costs in Reputation points.
- **derive:** fold owned reputation perks into the lane multipliers / starting state (mirrors how
  Legacy Weights and office perks already fold in).
- **UI:** a Reputation screen (likely under Prestige) — points balance + perk cards (owned /
  affordable / locked), each with a clear permanent effect. Reuse the upgrade-card pattern.
- **Balance:** this is the biggest curve risk — permanent global multipliers compound across
  runs. Model it in `balance-sim.ts` (greedy buyer spends Reputation) and tune earn-rate +
  perk magnitudes so it accelerates without trivialising. Gate strong perks behind real
  Reputation totals.
- **Tests:** earn accrual, perk purchase + persistence through prestige AND AGI reset, derive
  folding (a bought perk measurably changes rates), no double-spend.
- **Risk:** higher — second compounding economy. Sequenced last of the systems so Achievements +
  AGI feed it, and it gets the most sim time. Ship behind validation; easy to dial via data.

---

## Step 4 — Polish & ship-prep (validates everything) · ~1–2 days · LOW risk
**Goal:** make the whole thing feel finished and get it onto a TestFlight build.

- **Balance:** full `npm run sim` re-run with all systems on; confirm first-ship, era cadence,
  and Reputation curve are smooth (no walls, no trivialisation).
- **UX sweep:** empty states + first-run onboarding for the new tabs; the advisor nudge covers
  achievements/reputation next-actions; consistent number formatting; reduced-motion paths.
- **A11y/perf:** tab/badge ARIA, 10Hz re-render audit on the new panels (memoize), bundle check.
- **Self-review:** run the adversarial diff-review workflow over the Phase 3 diff; fix confirmed
  findings (the pattern that already caught the diminishing-returns bucket bug).
- **Ship:** update CLAUDE.md phase line + TASK.md/LEARNINGS; then **Actions → iOS TestFlight →
  Run workflow** (merging ≠ shipping — see CLAUDE.md). Tell the owner to update via TestFlight.
- **Risk:** low — no new systems, only validation + the deploy step.

---

## Hard rules kept throughout (design spine)
- **3 resources only** — Reputation/Legacy are *meta* currencies (prestige layer), not a 4th
  in-run resource. Legibility stays intact.
- **Engine stays pure/deterministic** — every new system is data-in-`balance/` + pure folds +
  tests. No `Date.now()`/`Math.random()` in engine.
- **No image assets** — parametric badge/era art only.
- **Humour in writing, not math** — achievement/era copy carries the satire.
- **No dark patterns** — achievements/perks are honest goals, never fake-urgency or pay-to-skip.

## Suggested order to execute
0 → 1 → 2 → 3 → 4. Step 0 is shared foundation; step 1 (Achievements) is the lowest-risk,
highest-ROI first feature and is independently shippable if we want a checkpoint before the
bigger AGI/Reputation bets.
