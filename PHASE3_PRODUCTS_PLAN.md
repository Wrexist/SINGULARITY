# PHASE3_PRODUCTS_PLAN.md — "Ship It": the AI Product / Deployment system

*Detailed design + build plan. Grounded in real 2026 AI-product economics (see
Research). Built on `GAMEPLAN.md`, the GDD, and `PHASE2_PLAN.md`. Read
`CLAUDE.md` → `TASK.md` → this before building it.*

> **Status / decisions (owner, 2026-06-25):**
> - **Relationship to prestige:** PARALLEL LAYER. "Ship the Model" (prestige reset
>   + Legacy Weights) is UNCHANGED. Products are a new system that **unlocks after
>   your first ship** (`prestige.ships ≥ 1`).
> - **Depth:** DEEP SaaS simulation (segments, conversion, churn/NRR, CAC/LTV,
>   concurrent-load serving cost, competitor frontier).
> - **Portfolio:** a FEW concurrent products (cap ~3, tunable).
> - **Timing:** WRITE THE PLAN NOW (this doc); BUILD AFTER the game is on TestFlight
>   and getting feedback. This is a Phase-3-scale system — building it pre-launch
>   is scope drift (the #1 documented risk).

---

## 0. The pitch (what the player does)

After you ship your first model, a new **Products** tab appears. There you:
1. **Release an AI as a product** — pick its **type/specialization** first (code &
   agentic, reasoning, general, multimodal, small-fast, domain), which sets its
   whole economic profile.
2. **Market it** — spend Money on campaigns to acquire users (at a rising CAC).
3. **Set up subscriptions** — configure pricing tiers per segment (Free / Pro /
   Max / Team-Enterprise / API); trade price against conversion & volume.
4. **Watch how it's going** — a live dashboard: MAU, paid subscribers, MRR, churn,
   NRR, margin, quality-vs-frontier.
5. **Push new versions** — spend Compute + Data to train v2, v3… → a growth/buzz
   spike, lower churn, and you close the gap on the advancing competitor frontier.
   Neglect it and churn climbs as rivals pass you.

Products **persist across prestige** (they're your standing revenue empire), giving
a Money head-start on each new run — the meta-reward for shipping good models.

---

## 1. Design-spine compliance (non-negotiable)

- **Three resources only.** Compute, Data, Money stay the only currencies.
  Products **cost Compute + Data to build/version** (ties to the lab) and **earn
  Money** from subs, **minus a Money serving cost**. Customers / MAU / MRR / churn
  are **product dashboard metrics**, NOT new global resources. Legibility intact.
- **Compute = build, Money = operate.** Mirrors reality (training is compute-heavy
  & one-time; serving is ongoing opex). This is also what lets products persist
  across a prestige reset (the lab's Compute resets; the Money business doesn't).
- **Humor in writing.** Changelogs, campaign names, churn-reason flavor, competitor
  press are satire surfaces. Systems stay clean.
- **No dark patterns.** No fake-urgency, no manipulative timers.
- **Reuses existing systems:** Regulatory **Heat** (domain/scraped-data products
  raise it), **world events** (hype cycles, competitor launches), Big numbers.

---

## 2. Research: how AI products actually work (2026)

*(Grounds the numbers; absolutes get tuned to the game's Money scale — the
RATIOS below are what matter.)*

- **Pricing ladder:** Free (funnel, capped) → Pro ~$20/mo → Max/Ultra $100–250/mo
  → Team/Enterprise $30–60+/seat → API per-token ($0.20–$14 / M tokens). Enterprise
  + API cross-subsidize consumer.
- **Conversion:** freemium free→paid **2–5%**; trials 14–43% (w/ vs w/o card).
- **Churn:** consumer/SMB **~3–5%/mo**; enterprise **<1%/mo**. Cutting churn 5%→3%
  ≈ **+67% LTV**. Retention dominates.
- **ARPU/LTV:** SaaS ARPU ~$52/mo avg; LTV ~$618 avg, $2.5k+ premium. Enterprise
  ARPU ~3× consumer, churn ~5× lower.
- **Growth levers:** marketing (→ signups at a CAC that rises with saturation),
  new versions (→ conversion up, churn down, launch buzz), pricing (price vs
  volume). Models stale in ~6–12 mo; competitor releases erode you unless you ship.
- **Unit economics:** revenue (subs/usage) − inference (scales w/ concurrent load)
  − marketing = margin.

Sources: aipricing.guru, explainx.ai (subscription costs), shno.co + eaglerockcfo
(churn/conversion/LTV benchmarks). See chat for links.

---

## 3. Specialization types (chosen at release; sets the whole profile)

Each type is a data row of multipliers. Starter ratios (tune via sim):

| Type | Segment skew | TAM | ARPU | Churn | Compute/user (serve) | Virality | Hype | Notes |
|---|---|---|---|---|---|---|---|---|
| **General Assistant** | Consumer | Huge | Low | High | Med | High | Med | Viral, cheap, leaky bucket |
| **Code & Agentic** | Prosumer/Enterprise | Small | High | Low (sticky) | High (agent loops) | Med | Med | Seat-based, durable |
| **Reasoning** | Technical/Research | Med | High | Med | High (long thinking) | Low | Med | Premium, pricey to serve |
| **Multimodal** | Consumer/Creator | Large | Med | Med-High | High (img/video) | High | **High** | Trend-driven spikes |
| **Small / Fast / Cheap** | API/Edge | Massive (calls) | Tiny/call | Med | Very low | Low | Low | Volume play, margin pressure |
| **Domain (legal/med/fin)** | Enterprise | Small | Very high | Very low | Med | Low | Low | **Raises Heat** (compliance) |

Types gate to **segments** (consumer / prosumer / enterprise / API), each with its
own conversion, ARPU, churn, and serving profile — that's the "deep sim."

---

## 4. Engine model (pure, deterministic, tested)

New module `src/engine/products.ts` + balance in `src/engine/balance/products.ts`.

### 4.1 State (save v5 → v6; persists across prestige)
> **As shipped** — the implemented model is leaner than the early sketch: a single
> price + marketing dial **per product** (not per-tier/segment tables), MAU/paid as
> flat scalars, and unlock derived from `prestige.ships` rather than a stored flag.
```ts
interface ProductState {
  id: string; name: string; type: ProductTypeId; version: number;
  quality: number;        // capability at last (re)launch; raised by pushing versions
  priceMult: number;      // player-set pricing knob (B.priceMin..priceMax)
  marketingPerSec: number;// ongoing Money spend the player dials in, per product
  mau: number;            // live monthly-active users
  paid: number;           // live paying subscribers (≤ mau)
  buzzSec: number;        // remaining launch/version buzz window
}
interface ProductsState {
  active: ProductState[]; // cap = balance.products.maxActive (≈3)
  frontier: number;       // global competitor capability, rises over time
}
```
- Add `products: ProductsState` to `GameState`. Save migration v5→v6 defaults it
  (`{ active: [], frontier: frontierStart }`). Unlock is derived
  (`productsUnlocked()` = `prestige.ships ≥ unlockAtShips`), not stored.
  **Prestige carries `products` over** (`prestige()` retains it, like Legacy Weights).

### 4.2 The per-tick simulation (folded into `tick()` / a `productsTick`)
For each active product, per elapsed `seconds` (deterministic, time passed in):
1. **Frontier drift:** `frontier += frontierGrowth × seconds` (competitors advance).
   `gap = max(0, frontier − quality)` → staleness.
2. **Acquisition (MAU in):**
   `acq = marketingAcq(spend, saturation) + virality(mau, quality)` where
   - `marketingAcq` has rising CAC as `mau/TAM → 1` (diminishing returns),
   - `virality = mau × viralityFactor × qualityFactor`.
3. **Churn (out):** `churnRate = baseChurn[type,segment] + stalenessPenalty(gap) +
   pricePenalty(tier) − qualityBonus`. `paid −= paid × churnRate × seconds`.
4. **Conversion:** `paid → target = mau × convRate[type,segment,price]`; ease paid
   toward target.
5. **Revenue/cost:** `MRR = Σ paid_seg × ARPU(tier)`. `serveCost = concurrentLoad ×
   computePerUser × inferenceMoneyRate`. **Money += (MRR − serveCost −
   marketingSpend) × seconds** (margin; can be negative → a real decision).
6. Clamp everything ≥ 0; cap MAU at TAM.

All rates/curves live in `balance/products.ts`. Pure; same inputs → same output.

### 4.3 Actions (pure transitions)
- `canReleaseProduct(state, type)` / `releaseProduct(state, type, name)` — costs a
  big **Compute + Data** chunk (train v1); requires a free product slot + unlocked.
- `pushVersion(state, productId)` — costs Compute + Data (scales with version);
  raises `quality` (closes the gap), fires a **launch-buzz** acquisition spike +
  temporary churn reduction (reuse the modifier system).
- `setTierPrice(state, productId, tier, price)` — reconfigure subscriptions.
- `setMarketingBudget(state, amountPerSec)` — dial ongoing acquisition spend.
- `retireProduct(state, productId)` — sunset (frees a slot; optional payout).

### 4.4 Derived (for the dashboard)
`productMetrics(product)` → `{ mau, paid, mrr, arpu, churnPct, nrr, margin,
concurrentLoad, serveCost, gapToFrontier }`. Pure; UI reads it.

---

## 5. UI

### 5.1 Tab navigation (NEW app structure)
The app is currently one scroll. Introduce a **2-tab switch** ("Lab" / "Products"),
shown only once Products unlock (keeps the first session unchanged). A clean
bottom segmented control or top pill toggle, sliding panels over the same hall
backdrop (clean-to-play: never a hard context switch).

### 5.2 Products tab
- **Portfolio header:** total MRR (big number), total margin/sec, active slots (n/3).
- **Product cards** (one per active product): name + type badge + version, MRR,
  paid subs, churn%, a **quality-vs-frontier bar** (turns amber/red as you fall
  behind), and a margin readout. Tap → detail.
- **Product detail:** segment breakdown (MAU/paid per segment), **subscription tier
  editor** (price sliders/presets per tier, live conversion/ARPU preview),
  **marketing budget** dial (with projected acquisition & CAC), **"Push v{n+1}"**
  button (shows Compute+Data cost + projected quality jump), retire.
- **Release flow:** "Release new AI" → **pick type first** (cards explaining each
  type's profile in plain language) → name it → confirm Compute+Data cost → launch
  moment (a tentpole, doubles as a screenshot).
- **Dashboard juice:** MRR sparkline (cheap, optional), launch-buzz animation,
  churn-reason flavor toasts ("Users left for a competitor's shinier demo").

### 5.3 Reveal & legibility
- Tab + system revealed at first ship. Reveal tiers/segments in waves (start with
  consumer Free+Pro; enterprise/API unlock as the product grows) — don't dump the
  full SaaS dashboard at once.

---

## 6. Integration with existing systems
- **Prestige:** unchanged. `products` persists across the reset → a Money income
  floor next run (the meta-reward). Tune so it accelerates, not trivializes.
- **Compute Focus / training:** versioning competes with research for Compute —
  the focus slider matters more.
- **Regulatory Heat:** Domain + scraped-data-trained products raise Heat; audits
  can hit product revenue. Real synergy with the Bazaar.
- **World events / factions:** competitor-launch events bump the frontier; hype
  events spike acquisition; alignment could gate enterprise trust (doomer) vs
  growth (accelerationist).
- **Eras:** later eras unlock higher tiers (Enterprise, API) and bigger TAM.

---

## 7. Balance (a real workstream — `npm run sim` extension)
- Add a products scenario to `balance-sim.ts`: model release → market → version →
  steady-state MRR; verify margins, CAC curves, churn/NRR, and the
  persist-across-prestige Money floor don't trivialize the core loop.
- **Targets:** (1) a first product is reachable shortly after first ship; (2) neglect
  → visible churn decline (must update); (3) a well-run portfolio meaningfully but
  not absurdly speeds prestige cycles; (4) each type plays differently (segment,
  ARPU, churn, serve-cost profiles are distinct).
- Numbers are RATIOS from §2 mapped onto the game's Money scale; expect many
  iterations.

---

## 8. Tests (engine-first)
- Growth/churn/conversion math; margin sign (over-marketing → negative); frontier
  drift + staleness churn; version push (quality jump + buzz + churn drop);
  TAM cap; marketing CAC diminishing returns.
- Persistence: products survive `prestige()`; save v5→v6 migration + round-trip.
- Unlock gate: products tab/actions locked until `ships ≥ 1`.
- Determinism guardrail: no `Date.now()` in the engine (time passed in).

---

> **BUILD STATUS (owner said "start"):** M1 ✅ engine, M2 ✅ tab+release, M3 ✅
> dashboard, M5 ✅ balance validated via the `runProduct` sim scenario (code burns
> ~7m then profits; each version push resets competitiveness to 100% then decays —
> "update or bleed"; general grows virally, domain is high-ARPU). Remaining: M4
> deep JUICE (launch-tentpole modal, churn-reason flavor toasts, hype/world-event
> hooks) — optional polish; the buzz spike + domain Heat are already wired.

## 9. Build order (milestones; each ends with a playable build)
1. **M1 — Engine core:** state + types + `releaseProduct`/`pushVersion` + the
   per-tick sim + derived metrics + save migration + tests. (No UI; sim-validated.)
2. **M2 — Tab + portfolio + release flow:** tab nav, product cards, type-pick
   release. Playable: ship → release one product → see MRR grow.
3. **M3 — Deep dashboard:** segments, subscription tier editor, marketing dial,
   version push with buzz. Playable: full management loop.
4. **M4 — Competition + persistence + juice:** frontier/staleness pressure,
   persist across prestige, launch moments, churn flavor, Heat/event hooks.
5. **M5 — Balance pass:** sim scenario, tune, era-gated tier unlocks.

---

## 10. Open questions — SETTLED (owner, 2026-06-25)
- **Money-floor strength → "hard early, compounds later."** Owner: the first
  customer and early scaling should be a *grind* (weak early models + entrenched
  competition); momentum should only spin up once quality/upgrades compound.
  Implemented via the products balance: high `marketingCacBase` (80) + faster
  `cacSaturation` (8), slower `convSpeed` (0.05), and a tight quality-gated
  marketing ceiling (`marketingCapPerQuality` 2000) that *opens as you progress*,
  plus quicker frontier drift (0.005) so competition bites if you don't version.
  Sim-verified: first-min subs ~190 (was ~1085), break-even ~min 10-11, then the
  flywheel ramps hard once versions stack. See `scripts/balance-sim.ts` runProduct.
- **Naming → keep.** Tab stays "Products"; release auto-suggests a satirical name
  (Nimbus, Oracle…) that the player can rename (✎). No change.
- **API/usage billing → distinct per-token mode, FUTURE.** Not folded in. A later
  pass adds a usage-billed mode where revenue scales with compute *served* (not
  seat count) — a second product economics model. Tracked in the backlog, not
  built yet (keeps the current model legible).
- **Retire payout → Money buyout + a lifetime "sold" badge.** Selling pays a
  one-time Money buyout (~`retireValuationSec` of MRR) AND increments a persisted
  `products.sold` counter shown in the portfolio header — a flip-and-track stat,
  no power coupling to prestige. Implemented.
- **Tab UI pattern → top segmented control** (Lab / Products). Shipped.
