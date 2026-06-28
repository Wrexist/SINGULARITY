# Singularity Inc. — Post-Launch Roadmap (v2)
*A fresh, audit-driven roadmap written after the game shipped to TestFlight and runs cleanly.
Goal: make the game **more balanced, more user-friendly, more interactive, and more fun** —
without breaking the design spine. Supersedes the now-historical `IMPROVEMENTS_ROADMAP.md`
(most of its A/B/C/D items are shipped). Source of truth for **what** the game is: the GDD.
This file is **how we grow it next.***

> **Status when written:** Live on TestFlight, 249 tests green, `tsc` clean, `npm run sim`
> first-prestige ~12m15s. Save schema **v11**. The pre-prestige curve is well-tuned and
> well-guarded. The debt is concentrated **after the first ship** and in **moment-to-moment
> aliveness** — that's what this roadmap attacks.

---

## 0. The guardrails (every item below obeys these — non-negotiable)
1. **Three in-run resources only** — Compute / Data / Money. Legacy / Reputation / Ascension are
   *meta*-currencies, never a 4th resource. Legibility is the feature.
2. **Engine stays pure & deterministic** — no `Date.now()` / `Math.random()` in `src/engine/`.
   Every system is data-in-`src/engine/balance/` + pure folds + tests.
3. **Every compounding meta-term is hard-gated** so the tuned early/mid curve stays
   byte-identical — verify with `npm run sim` after any economy change.
4. **Humor in writing, not math. No dark patterns. No image assets (parametric only).
   Cosmetic-only IAP.**

---

## 1. What the audit found (the case for this roadmap)
Five parallel audits (economy/balance, UX, fun/game-feel, systems-depth, code-health) converged
on a small set of high-leverage truths. The roadmap is organized around fixing these.

**The five cross-cutting findings (each flagged by 2+ audits):**

| # | Finding | Why it matters | Audits |
|---|---------|----------------|--------|
| F1 | **The "what do I do next?" advisor is fully built, tested, and never rendered.** `nextAction()` (`src/engine/advisor.ts:116`) is imported nowhere in the UI; players see only a bare numeric tab badge. | The single best guidance signal in the codebase is invisible. Fixing it removes the "idle-but-boring / what now?" lulls at near-zero engine risk. | UX, Fun |
| F2 | **The post-first-prestige game is thin AND unmeasured.** The sim (`scripts/balance-sim.ts`) only times time-to-ship for 3 generations; Legacy multiplier is linear & ungated (`derive.ts:152`) so Gen2/Gen3 collapse to **sub-minute ships**. Runs are mechanically identical. | The meta-loop — the genre's retention engine — degenerates into a formality. We're balancing the endgame by vibes. | Economy, Systems, Fun |
| F3 | **The 2.5D hall is a passive backdrop with manifestation-rule violations.** The only hall interaction is tapping an expansion marker (`HallCanvas.tsx:167`); overclock, cooling, auto-*, staff, and live products produce **no** physical change in the room. | The GDD stakes the entire 3D justification on the hall being *where you act and see your money become a place*. Half the buys have no physical echo. | Fun |
| F4 | **The Compute/Data/Money triangle decouples after midgame.** Auto-train pins spendable Compute near one run's cost while Data & Money run away 2–3 orders of magnitude; the Data Market is self-admittedly optional. | The 3-resource tension — the core design promise — stops being real exactly when the player has the most tools to manage it. | Economy, Systems |
| F5 | **The whole React tree re-renders at 10Hz with zero memoization.** `App.tsx` subscribes to the entire `game` object; no `React.memo` anywhere. | Biggest battery/jank risk on older iPhones, and it gets **worse with every panel we add** — i.e. it taxes this whole roadmap. Fix the foundation before piling on content. | Code-health |

**Plus standout single-audit findings worth roadmap slots:**
- **No buy-multiple / buy-max** — core idle QoL absent; late-game = RSI tapping (UX P1).
- **`alignment` is a dead dial** — set by faction events, read nowhere in `derive` (Systems P1). Best depth-per-effort fix in the audit.
- **Retire → relaunch cash windfall** — `retireValuationSec: 1800` pays 30 min of MRR instantly, exploitable with free draft relaunch (Economy P1).
- **Missing genre systems**: contracts/quests, research auto-buyer, spendable-Legacy prestige tree (Systems P1).

---

## 2. The roadmap at a glance

```
R0  Foundation hardening ........ perf + the sim instrument (do FIRST — it de-risks everything)
R1  Player-friendliness ......... wire the advisor, buy-max, locked-state clarity, QoL  (highest ROI)
R2  The hall comes alive ........ tappable racks + manifestation + per-era growth  (the pillar)
R3  Active engagement ........... combo/manual-boost/player-initiated events  (kills the idle lull)
R4  Endgame balance ............. fix the legacy snowball, re-couple the triangle, close exploits
R5  Depth systems ............... activate alignment, contracts, auto-buyer, prestige tree
R6  Replayability & meta ........ lab charters, faction branching, earnable cosmetics, rivals
R7  Content & satire waves ...... tiered flavor, event chains, milestone teasers
R8  Platform & LiveOps .......... analytics, cloud save, Android, Steam  (only if earned)
```

**Sequencing logic:** R0 is the instrument and the floor — it makes everything after it measurable
and cheap. R1 is pure ROI (mostly wiring existing logic). R2/R3 deliver the "more fun & interactive"
ask. R4 must follow R0 (you can't tune an endgame you can't simulate). R5/R6 are the depth bets,
gated behind the foundation. R7 is continuous. R8 is optional and data-driven.

**Effort key:** S ≤ ½ day · M ~1–2 days · L ~3+ days · XL ~1 week+.
**Priority key:** P0 ship-blocker · P1 high · P2 medium · P3 nice-to-have.

---

## R0 — Foundation hardening *(do this first; it de-risks the whole roadmap)*
*Goal: a foundation that stays fast and measurable as we add systems. Mostly invisible to players,
but it's what keeps R2–R6 cheap and safe.*

- **R0.1 · Kill the 10Hz whole-app re-render** *(P1, M)* — `App.tsx:47` subscribes to the entire
  `game`; `advance()` mints a new ref every tick (`store.ts:266`); zero `React.memo` exists.
  Narrow each panel to the store slice it needs, wrap leaf panels in `React.memo`, and isolate the
  one component that *legitimately* needs 10Hz (`ResourceBar`). Copy the pattern `HallCanvas`
  already uses (rAF outside React). **Biggest battery/perf win, and it pays off more with every
  panel this roadmap adds.**
- **R0.2 · Extend the balance sim to the long game** *(P1, M)* — `scripts/balance-sim.ts` only
  times 3 generations of time-to-ship. Add a "long-haul" policy: 10–20 generations that buy
  products + versions + staff, reporting **weights/hour, era-arrival times, and resource ratios**.
  **This is the instrument for all of R4** — you cannot tune the endgame you can't see.
- **R0.3 · Memoize `derive()` once per tick in the store** *(P2, S)* — `App.tsx:60`'s
  `useMemo(…, [game])` never hits (fresh `game` ref each tick), so `derive()` (a full
  upgrade+research+roster fold) runs 10×/sec and is re-invoked across the action layer. Compute it
  once in `advance()` and stash it. Pairs with R0.1.
- **R0.4 · Extract `deriveNotices(prev, next)` out of `store.advance()`** *(P2, M)* — the
  toast/notice surfacing (`store.ts:277–377`) is a fragile chain of "if no one claimed the slot"
  conditionals that every new event-bearing system must thread through. Make it a pure, tested
  helper. Shrinks the `store.ts` god-object before R5 grows it.
- **R0.5 · Harden the guardrail + migration tests** *(P2, S)* — add `Math\.random\s*\(` to the
  engine-purity grep (`guardrails.test.ts` only checks `Date.now`); add a `derive.test.ts` pinning
  that each lane multiplier (legacy × ascension × rep) composes **exactly once** (the squaring bug
  class already bit once); add table-driven save-migration fixtures (v0→v11) so a returning
  TestFlight player's save can't silently corrupt.
- **R0.6 · Make `Big` overflow/div-by-zero an explicit contract** *(P2, S)* — `break_infinity`'s
  `div(0)→0` and `toNumber()→Infinity` (past ~1e308) are silent-wrong landmines for the endgame.
  Pin them in `Big.test.ts`, document on the methods, and move endgame upgrade-affordability out of
  `.toNumber()` space (`tick.ts:121`) so Phase-3 numbers don't mis-compute.

---

## R1 — Player-friendliness *(highest ROI; mostly wiring logic that already exists)*
*Goal: a first-time player is never lost, and a veteran never fights the UI. This is the
fastest path to "more user-friendly."*

- **R1.1 · Ship the advisor as a live "Next: …" banner** *(P1, S)* ⭐ — render `nextAction(game)`
  (already pure & tested) as a persistent, tappable one-liner above the stage that jumps to the
  resolving tab. **The single highest-ROI item in this roadmap** — the logic exists; it's just not
  on screen. Directly fixes F1 and the "idle-but-boring" complaint.
- **R1.2 · Buy ×1 / ×10 / Max** *(P1, M)* — no buy-multiple exists anywhere (`UpgradePanel.tsx`
  buys one at a time; infinite-max racks = 50+ taps late-game). Add a global segmented control that
  batches `upgradeCost` accumulation (the cost math is already pure in `actions.ts`). Add a "Buy all
  affordable / Catch up" sweep for the post-offline power spike.
- **R1.3 · Locked tabs & panels show *why*** *(P2, S)* — Products/Team nav buttons just vanish until
  unlocked (`App.tsx:434`). Show them greyed with a lock glyph + one-line unlock condition ("Unlocks
  after first Ship"). Advertises depth without dumping it (GDD "reveal in waves" — show the
  requirement, not the content). Make every pre-unlock tab uniform.
- **R1.4 · Disambiguate the tab badges** *(P2, S)* — the attention badge is a bare number with no
  meaning, and the Awards badge (a *collection count*) looks identical to an *alert* (`App.tsx:448`).
  Make attention badges reveal text (ties to R1.1); restyle the Awards count as a non-alert pill.
- **R1.5 · Replace native `confirm()` with in-app modals + add missing confirms** *(P2, S)* — hard
  reset, product sell, and save-import use jarring `window.confirm`; **firing a trained employee has
  no confirmation at all** (`EmployeesPanel.tsx:281`) — a rage-quit risk. Reuse `ExpandConfirm`;
  prefer an undo-toast for reversible-feeling actions.
- **R1.6 · Animate the "While You Were Away" screen** *(P2, M)* — `OfflineModal.tsx:40` dumps three
  final numbers instantly; the GDD §6 explicitly wants "the *stack* building up." Count totals up
  (reuse `useEasedBig.ts`), fire a particle burst per resource as it lands, escalate haptics, rotate
  the recap quip. The genre's signature dopamine beat, currently flat.
- **R1.7 · Mobile tap-target & readability pass** *(P2, M)* — bottom-nav items lack `min-height`
  (~46px, borderline), badge font 9.5px, pervasive 10–11px interactive text, a single-glyph drag
  grip. Enforce 44×44pt minimums (Apple HIG), bump smallest interactive text to ≥12px, enlarge the
  employee grip hit area. Move type to a scalable unit and respect iOS Dynamic Type.
- **R1.8 · Consistent modal dismissal + real swipe-to-close** *(P2, S)* — dismissal is inconsistent
  (some backdrop-tap, some Escape, some neither), and the bottom-sheet grip *looks* draggable but
  has no handler (a broken affordance). Standardize: backdrop-tap + visible close everywhere; wire
  the grip to an actual swipe-down, or remove it.
- **R1.9 · Persist money-affecting events; surface the EventLog** *(P2, S)* — fines/raids/breaches
  flow through auto-dismissing toasts with the same weight as flavor quips and can be evicted
  unseen, so the player's money drops with no explanation. Give money-affecting events a persistent
  acknowledgement and badge the (currently collapsed, session-only) EventLog when there's unread
  important content.
- **R1.10 · First-encounter tooltips for jargon** *(P3, S)* — "Legacy Weights", "Competitiveness /
  qf", "Regulatory Heat", "Compute focus / banks up to N" appear with no explanation. Add one-time
  info-chips on first appearance (reuse the `pd-info-card` pattern). Plus `aria-live`/`progressbar`
  parity on training, competitiveness, and power bars.

---

## R2 — The hall comes alive *(the defining pillar — make it earn its screen space)*
*Goal: turn the 2.5D hall from a backdrop into the place you act and watch your money become a
place. All parametric, no image assets.*

- **R2.1 · Tappable, inspectable racks** *(P1, M)* ⭐ — the hall's only interaction is the expansion
  marker (`HallCanvas.tsx:167`). Make racks tappable → a parametric callout (tier, compute
  contribution, a satirical name: "GPU #418 — running hot, regrets nothing"). Turns the pillar into
  an action surface and folds the satire layer into the world (today the hall has exactly one flavor
  line).
- **R2.2 · Fix the manifestation-rule violations** *(P1, M)* ⭐ — high-impact buys that change a
  number but not the room (GDD §5 violation). Cheap parametric echoes: **overclock** → racks run
  hotter (orange rim + faster LED blink, reuse `workPulse`); **cooling/liquid loop** → coolant
  pipes/glow on the floor run; **auto-train** → a roaming "ops bot" dot / pulsing console;
  **staff** → small desk/figure props along a wall that multiply with headcount; **live products**
  → a glowing uplink beam per product to a cloud glyph.
- **R2.3 · Per-era structural growth, not just re-skin** *(P2, L)* — cooling units cap at 3, floor
  expansions at 4, racks downsample so "1000 GPUs" reads like "60", and eras 4–6 only swap palette.
  The pillar goes static exactly when the player has invested most. Add per-era structure
  (Hyperscaler → second wing / rooftop cooling towers; Post-Singularity → an iridescent server
  monolith centerpiece) and upgrade the *rack visual itself* (taller/denser/halo) past capacity so
  density keeps reading as growth.
- **R2.4 · Ambient life + a status board** *(P2, M)* — no human-scale motion or live event echo in
  the room. Add a slow-roaming maintenance dot, a wall status-board glyph that reflects the active
  modifier in real time (heatwave = red, viral demo = green), and a room flicker on bad events.
  Ties the satire/event layer into the pillar instead of only into modals.
- **R2.5 · Juice the rack-buy moment** *(P1, S)* — buying a rack (the signature manifestation
  moment) fires only `haptics.tap()` + a sound — *lighter than a routine claim*. Wire the existing
  `punch()` (`fx.ts:58`) + a `burst` + a "+X compute/s" floater to the buy. Tiny work, fixes the
  flattest important beat.

---

## R3 — Active engagement *(give the player something to DO once automation lands)*
*Goal: the active loop currently self-destructs — once auto-train + auto-claim are bought there's
nothing to tap. Add opt-in active layers that reward presence without punishing idlers (honest,
per GDD §6).*

- **R3.1 · Claim-streak combo meter** *(P2, M)* — every claim is identical juice. Add a decaying
  ×1.1→×2 multiplier built by consecutive manual claims within a window, shown in the dock + hall.
  Idlers lose nothing; hands-on players get a reason to stay. Temporary modifier only (can't inflate
  the permanent curve).
- **R3.2 · Manual boost that survives automation** *(P2, M)* — an opt-in tap (on the hall/dock) that
  spends banked Compute on a short ×N surge with diminishing returns — a real micro-decision, not a
  grind. Restores GDD §2's "active loop (seconds)" after auto-train removes it.
- **R3.3 · Player-initiated events — "Press the Big Red Button"** *(P2, M)* — events only *happen
  to* you on a ~150s timer. Add a cooldown-gated console button in the hall that rolls a
  high-variance satirical gamble (compute moonshot vs. lab incident). Converts passive
  event-watching into sought-out agency.
- **R3.4 · More events become 2-choice dilemmas** *(P2, M)* — only ~10 of ~50 events offer a choice;
  the rest are dismiss-only. Convert simple buffs into risk/reward dilemmas with an alignment shift
  (which R5.1 finally makes matter), so choices compound across a run.

---

## R4 — Endgame balance *(must follow R0.2 — tune what you can now measure)*
*Goal: make the meta-loop a real game instead of a sub-minute formality, and keep the
3-resource triangle in tension to the end. All pure-data, all re-sim'd.*

- **R4.1 · Tame the Legacy snowball** *(P1, S)* — `legacyMult = 1 + weights×0.05` is linear and
  ungated (`derive.ts:152`), which is *why* Gen2/Gen3 collapse to <1 min. Make it diminishing
  (`1 + k·weights^0.85` or logarithmic) so each prestige still feels like a jump but generations
  don't trivialize. Re-sim. (F2.)
- **R4.2 · Close the retire→relaunch windfall** *(P1, S)* — `retireValuationSec: 1800` pays 30 min
  of MRR instantly while `launchDraft` is free, so MRR can be repeatedly cashed into lump sums. Drop
  to ~300–600s (a real "cash now vs keep earning" call) or scale the payout down by how recently the
  product launched. Pure data (`balance/products.ts:137`).
- **R4.3 · Re-couple the triangle — give Compute & Data late-game sinks** *(P1, M)* — pick from
  three pure levers (model in the R0.2 sim first):
  - **Compute Reservoir** upgrade that raises the banked-Compute ceiling (today pinned at ~one run's
    cost by auto-train) → Compute becomes a resource you stockpile for big research/version pushes.
  - **Data freshness decay** above a threshold → Data becomes a flow you keep using, not a pile you
    bank; the scraper/market become live decisions (re-introduces F4 tension). Stays 3 resources —
    it's a property of one, not a 4th.
  - **Infrastructure maintenance** — a Money drain proportional to total compute capacity (the
    datacenter costs money to *run*) → the missing late-game Money sink, pairs with power/heat.
- **R4.4 · Make the Data Market matter** *(P2, M, owner sign-off)* — it's self-admittedly optional
  because runs out-supply research's Data needs. Rebalance a few mid/late research nodes (`rlhf`,
  `moe`, `synthetic_data`) to be genuinely Data-bottlenecked so the market becomes the intended
  accelerator. LEARNINGS flags this as an owner design call — don't ship silently; re-sim after.
- **R4.5 · Restore payroll tension at scale** *(P2, M)* — flat per-hire payroll is rounding error
  against a $1.5M/min economy. Scale payroll more aggressively with seniority, or tie a slice to
  company scale (% of MRR), so the wage bill stays a felt constraint. Validate with focused unit
  tests (staff isn't in the lab sim).
- **R4.6 · Lift hardcoded balance constants into `balance/`** *(P2, S)* — several tuning knobs are
  baked in logic (the 25% hire-discount floor `derive.ts:141`; product-mod floors
  `employees.ts:146`; the post-raid `heat×0.4` `actions.ts:263`; min run duration). Move them to
  named `balance.*` constants so a balance pass can reach them. (Data-driven-rule compliance.)
- **R4.7 · Cap stacked *temporary* multipliers** *(P3, S)* — daily boost + world-event buffs can
  multiply to ×6 briefly with no global cap, letting a player time a ship inside a buff window. Add
  an optional `balance.modifiers.maxStack` per lane. Low priority (it's transient).

---

## R5 — Depth systems *(the build-defining choices the genre lives on)*
*Goal: add meaningful decisions, not more numbers. Each respects the 3-resource rule and the
hard-gate discipline. Ordered by depth-per-complexity.*

- **R5.1 · Activate `alignment` (the dead dial)** *(P1, S)* ⭐ — `state.alignment` is set by faction
  events and **read nowhere in `derive`**. Wire it as a real fork: doomer → less Heat-generation +
  more Reputation gain; accelerationist → more compute/frontier-keep-up + more Heat. Tiny code,
  closes a whole vestigial axis, and makes every faction choice finally pay off. **Best
  depth-per-effort fix in the audit.**
- **R5.2 · Contracts / quests board** *(P1, M)* — only passive threshold milestones exist; there's
  no accept-and-fulfill loop. Add a rotating `contracts[]` in balance ("Deliver 1M MAU in 10 min →
  Money + Reputation"), a pure fold in `tick`, persisted like achievements. Adds directed goals,
  pacing, and a Reputation/Money sink with no 4th resource. Reuses the milestone UI.
- **R5.3 · Research auto-buyer** *(P1, M)* — 121 research nodes are 100% manual-click; the
  genre-standard automation layer is missing. Add a Reputation-perk-gated auto-buyer (buys the
  cheapest affordable available node). Pure, deterministic, huge QoL, on-theme for the meta-layer.
- **R5.4 · Spendable Legacy / prestige skill tree** *(P2, L)* — Legacy auto-converts to one flat
  multiplier; players never *spend* it on choices. Add a small branching tree (compute-lean vs
  money-lean vs product-lean starts) so prestige becomes a build decision — the genre's signature
  depth move. Reuses the reputation-perk buy/fold code. Pairs with R4.1.
- **R5.5 · Cross-system interactions** *(P2, M)* — a few terms in `derive`/the product sim that make
  existing systems ripple: **Heat → staff** (high regulatory pressure dents morale / raises hire
  cost); **alignment → products** (doomer lowers product Heat-gen, accel raises acquisition);
  **Reputation → product slot / research discount** (cross-system perks instead of flat +x%).
  Emergent depth from near-zero new content.
- **R5.6 · Deepen Reputation into a real build tree** *(P2, M)* — the 9 perks are a flat shopping
  list of +x% mults. Replace with cross-system, sometimes mutually-exclusive choices (research
  discount vs +1 product slot vs automation unlock) so the meta-tree defines a *build*.

---

## R6 — Replayability & meta *(make runs feel different, not just faster)*
*Goal: the meta-loop is numerically satisfying but experientially identical every run. Add
variety and a cross-reset chase.*

- **R6.1 · Lab Charters (per-run modifiers)** *(P2, L)* — at prestige, pick one of 2–3 rotating
  charters ("Open-Source Crusade: +data −money"; "Move Fast: +speed, events hit harder"; "Stealth
  Mode: no events, +compute"). Each run plays differently; pairs with alignment (R5.1). The core
  replayability lever.
- **R6.2 · Faction-branched content** *(P2, M)* — once alignment matters (R5.1), let doomer vs
  accelerationist unlock divergent event pools and a cosmetic hall tint, so a "safety run" and a
  "send-it run" genuinely diverge.
- **R6.3 · Earnable cosmetic collection** *(P2, M)* — only 5 hall themes (Settings-only), no rack
  skins despite GDD §7. Unlock hall themes + rack skins via achievements/ascensions, shown as a
  persistent collection grid — a durable cross-reset chase that respects cosmetic-only monetization.
- **R6.4 · Named live competitors** *(P3, L)* — competition is a single scalar `frontier` that
  drifts up. Add 3–5 named rivals (each a capability + a TAM share your products contend for) so the
  product sim feels alive and events have something concrete to reference. Highest payoff for
  product-sim aliveness but highest complexity — scope tightly, do it last.
- **R6.5 · Codex / lore collection** *(P3, S)* — achievements are the only collection; event flavor
  is one-shot. A cheap unlockable codex (events seen, products retired, eras reached) deepens the
  satirical voice with near-zero engine risk.

---

## R7 — Content & satire waves *(continuous; do opportunistically alongside the above)*
- **R7.1 · Tiered upgrade/research flavor** *(P3, S)* — each upgrade has one static desc across all
  levels. Add level-breakpoint flavor escalation ("rack #500 — the landlord has questions"). High
  personality-per-byte.
- **R7.2 · Event chains & callbacks** *(P3, M)* — events are independent rolls with no continuity.
  Add a few multi-part chains (the intern, the founder's tweets) that reference prior choices —
  memorable across a run.
- **R7.3 · Milestone teaser strip** *(P3, S)* — only prestige shows a "next unlock" bar. Add a
  persistent "next era / next badge / next rack tier — X% there" strip + achievement progress
  visibility. Feeds the GDD §6 "almost-there" engine.
- **R7.4 · Rotating ship/era celebration copy** *(P3, S)* — the "Model Shipped" headline is one
  fixed string and auto-dismisses in 3.6s. Rotate satirical headlines; let the player linger on the
  tentpole moment.

---

## R8 — Platform & LiveOps *(only if R1–R6 earn it; GDD Phase 4)*
- **R8.1 · Opt-in, privacy-safe local analytics** *(P3, M)* — time-to-first-prestige, wall points,
  tab usage. No PII, no backend for v1. Turns R4 tuning from vibes into data.
- **R8.2 · Cloud save (opt-in)** *(P3, L)* — the one place a backend is justified; keep it optional.
- **R8.3 · Android build** *(P3, M)* — Capacitor already targets it.
- **R8.4 · Steam/desktop port eval** *(P3, XL)* — the pure engine makes it feasible (GDD §10).

---

## 3. If you only do five things
A tight critical path that delivers "more balanced, friendly, interactive, fun" with the least risk:

1. **R0.1 + R0.2** — fix the 10Hz re-render and extend the sim. *The floor and the instrument.*
2. **R1.1 + R1.2** — wire the advisor banner and add buy-max. *Biggest friendliness ROI; mostly
   already-built logic.*
3. **R2.1 + R2.2 + R2.5** — tappable racks, manifestation fixes, rack-buy juice. *Make the pillar
   earn its screen space.*
4. **R4.1 + R4.2 + R4.3** — tame the legacy snowball, close the retire exploit, re-couple the
   triangle. *Make the endgame a real game (do after R0.2).*
5. **R5.1 + R5.2** — activate alignment, add the contracts board. *The highest depth-per-effort
   bets.*

---

## 4. Risks & how this roadmap counters them
- **Scope drift** (the project's #1 documented risk) → this roadmap is phased and each item is the
  smallest change that proves the next thing. R0 first means we don't build on sand.
- **Breaking the tuned curve** → every economy item (R4) is gated behind R0.2's long-haul sim and
  the hard-gate discipline; re-sim is mandatory and called out per item.
- **Feature bloat eroding legibility** → no 4th resource anywhere; depth (R5/R6) is *choices*, not
  more counters; the GDD "reveal in waves" rule governs unlock pacing.
- **Battery/perf regressions on older phones** → R0.1/R0.3 precede the content push specifically so
  added panels don't multiply the 10Hz cost.

---

*Next step after sign-off: turn the chosen first slice (suggest the "five things" path) into
`TASK.md` work items and start with R0.1. Update the CLAUDE.md phase line to "Phase 4 — Post-launch
growth" when this roadmap is adopted.*
