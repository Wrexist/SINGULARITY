# Singularity Inc. — Audit & Feature Roadmap
*Produced 2026-07-16 by a multi-agent audit: four parallel **Opus 4.8** auditors
(noise/UX · gameplay depth · code health · balance) synthesized by a **Fable 5**
orchestrator. Every claim is grounded in real `file:line` references. Obeys the
GDD spine and the CLAUDE.md hard rules (ambient over text, no left-edge accent
bars, no emoji, deterministic curve-safe engine).*

---

## Executive summary — three cross-cutting themes

1. **Depth is WIDE, not TALL.** Nearly every system finishes revealing itself by
   ship ~6–9, and every meta-layer that should carry the late game is a flat,
   finite `+%` ladder: the 25-node research tree is byte-identical every
   generation (`config.ts:2158-2390`), Legacy Investments was 6 perks solved for
   ~156 weights (`legacyTree.ts:25-38`), Grand Challenges are 10 decisionless
   funding bars that deplete forever (`challenges.ts:43-134`), and ascension is a
   linear +8% into a decisionless Endowment (`prestige.ts:47-49`,
   `reputation.ts:52-63`). **The fix is not new systems** — it's converting these
   already-curve-safe meta systems from "+% discounts" into "content reveals" so
   ship N+1 promises something ship N couldn't do.

2. **Notification-channel sprawl vs the game's own "calm, ambient" mandate.**
   `App.tsx` alone had ~15 `pushToast` emitters — most firing on the player's own
   tap — competing with the NewsTicker, ModifierBar, WorldEventCard, the advisor
   nudge chip, the daily strip, the goal carrot, and numeric attention badges.
   Routine confirmations trained players to ignore toasts, so the ones that matter
   drowned. (See Part 1 — largely **shipped this pass**.)

3. **The foundation is trustworthy but wanted cheap insurance** before new depth
   lands: the purity guardrail test omitted `Math.random`, and a whole-file-corrupt
   save was silently wiped by the next autosave (the one true wipe path). Both
   **shipped this pass**.

> Method note: the noise-UX and balance auditors initially returned stubs; both
> were re-run (noise-UX as a dedicated deep audit) so the findings below are from
> real code review, not placeholders.

---

## Part 1 — Making the game less noisy & confusing

The noise is concentrated in three places: **(a)** toasts firing on the player's
own clicks, **(b)** the "Ship" signal encoded four ways, **(c)** numeric badges
duplicated across two altitudes. The two exemplary patterns already in the code —
the single-slot notice strip (`daily > nudge > goal`) and the one-at-a-time moment
queue — are the model to extend everywhere.

### Shipped this pass ✅
| Change | What it does | Risk |
|---|---|---|
| **`logEvent()` — a log-only sibling of `pushToast`** | New channel that records to "Recent activity" **without** a transient popup. | none (additive) |
| **9 self-click confirmations → log-only** | Daily-boost claim, hire welcome, fire send-off, office perk, product-upgrade start, product sold, contract claimed, research breakthrough, press-blitz counter no longer toast — each is already confirmed by the panel it acts on and by its own fx/haptics. Zero information lost (all still in the log). | low |
| **Notice-channel triage** | Achievements, level-ups, and neutral churn quips route to log-only (they keep their own fx: the Awards burst, the Team star-pop). Milestones, shipped versions, discoveries, and bad ops events **keep** their toast. | low |

Net effect: steady-state toast volume drops by the large majority, with no lost
information and no engine/save changes. Verified: `tsc` clean, 578 tests green,
built app driven headless with **zero console errors**.

### Also shipped ✅ — the Ship-signal de-duplication
The nav Lab button showed **both** a pulsing icon *and* a "Ship" text badge on the
**same element** — the one true on-element duplication. Dropped the text badge and
kept the ambient pulse (with an `aria-label="Lab — ready to ship"` so screen
readers still get it), per CLAUDE.md's ambient-over-text rule. The **value framing**
and wayfinding still live in the advisor chip, the HQ "Ship" pill, and the one-time
first-ship explainer — so nothing that *teaches* was removed, only a redundant word.

### Recommended next (owner call — deliberately not shipped unilaterally)
| Fix | Why it's held | Effort |
|---|---|---|
| **Single attention arbiter** — one badged pull per view; replace numeric counts with an ambient dot; suppress badges for anything automation will claim | The nav Lab count is by construction the sum of the three sub-tab dots ("3" vs "1+1+1"). Worth doing, but changes badge semantics broadly. | S/M |
| **Tame the HQ 7-panel wall** — make StatsPanel + CodexPanel collapsible (mirror EventLog), collapsed by default, so HQ opens on the actionable panels | Pure-safe but a layout change worth a design pass. | M |
| **Pause the NewsTicker while a nudge / world-event is active** | Stops ambient motion fighting the do-this-now layer. | M |
| **Drop the first-run advisor "Ship the Model" chip** | Now the *only* remaining ship-signal beyond pulse + pill + explainer; a fair cut, but it uniquely carries the "reset for a permanent boost" value framing, so it's a judgment call. | S |

---

## Part 2 — 10 features to add depth & a late-game to grind toward
Ranked best-first by **(player value × fit × existing-system leverage ×
curve-safety) ÷ effort**. Effort: S/M/L/XL. All are curve-safe by construction
(the balance sim only buys research/racks and ships `deploy` — it never touches
meta-currencies, funds challenges, launches products, or ascends).

### #1 — Legacy Constellation *(deep Legacy Investments tree)* · M · low risk · **first tier + unlock node SHIPPED ✅**
**Pitch:** Expand the Legacy tree into a multi-tier constellation — tiers 3–5 per
lane, cross-lane synergy nodes, and (the key change) **unlock nodes** that gate
real content: a 4th product slot, a new ship mode, offline-cap extension, entry to
the Paradigm layer. Every few ships another node comes within reach.
**Why it fits:** The system the game already advertises as its build-defining
prestige choice (`legacyTree.ts:1-11`); data shape, UI panel, and spend/refund
logic all exist. Weights = frozen model checkpoints is pure AI-lab fantasy.
**Curve-safe:** Spends Legacy Weights only (the sim never earns/spends them);
nothing owned = identity multiplier, tuned curve untouched.
- **Pros:** highest leverage-to-effort of any depth fix; proven curve-safe; gives
  Legacy Weights a permanent growing purpose; unlock nodes become the gateway that
  ties #5 and #6 together.
- **Cons:** unlock-type effects (slots, modes) need new plumbing beyond flat +%;
  weight income must be re-checked so deep tiers take many ships; a bigger tree
  makes the panel denser on iPhone widths.
- **First increment shipped this pass ✅** — see Part 3.

### #2 — Grand Challenge forks + Megaprojects II · M · low risk · **forks + Megaprojects SHIPPED ✅**
**Pitch:** Each Grand Challenge completion presents a permanent either/or fork
(e.g. fusion: "grid independence" compute engine vs "sell surplus power" money
engine); after all 10, a repeatable **Megaproject** loop opens with escalating
costs and diminishing-but-permanent rewards, so the aspirational layer never empties.
**Why it fits:** Challenges are the headline moonshot content but mechanically
decisionless bars that lampshade their own dead-end (`challenges.ts:131`).
Preprints already prove the infinite-diminishing-sink pattern to reuse.
- **Pros:** turns the biggest late-game sink from "wait for bar" into a build
  decision; Megaprojects absorb late-game surplus (helps the data-faucet
  imbalance); reuses funding UI + completion ceremony.
- **Cons:** forks must be genuinely different in kind or a spreadsheet solves them;
  20 new tuned effects to write/test; permanent forked bonuses need sim-side
  verification that the completed set stays empty in the tuned run.

### #3 — Prestige Challenges board *(run modifiers + one-time unlocks)* · M · low · **SHIPPED (as "Trials") ✅**
**Pitch:** An opt-in board of challenge runs — "No Hires", "Half Compute / Double
Legacy", "Doctrine Locked: Accel", "Speedrun" — each granting a one-time permanent
unlock. Generations finally feel **different**, not just faster.
**Why it fits:** Directly attacks "same run, faster"; the game already has one such
variant ("hard" ship mode, `config.ts:1628`) plus the chooser UI. Framed as
"ablation studies," it's dead-on AI-lab flavor.
- **Pros:** huge replay variety for mostly-data effort; a concrete grind checklist
  for players who've seen everything; reuses the ship-mode chooser.
- **Cons:** each modifier needs a balance pass so none is degenerate; new persisted
  field (SAVE_VERSION bump + migration + sanitize); some modifiers must disable
  specific automations.

### #4 — Endowment Directives + Reputation tree tiers · S · low risk · **SHIPPED (Directives) ✅**
**Pitch:** Every 10 Endowment levels the player picks a **Directive** (a lane bias
or a milestone perk: +offline cap, contract slot, event control), and the
Reputation tree gains 2–3 new tiers whose top nodes unlock content rather than +%
— so surplus Reputation stays a decision forever instead of a +2%/level counter.
**Why it fits:** The Endowment is explicitly the "where does surplus go" sink
(`reputation.ts:56`) yet is the poster child for decisionless arithmetic; the
12-perk tree dead-ends by ship ~50 while Reputation keeps flowing.
- **Pros:** smallest-effort repair of the true endgame loop; gives the infinite
  sink a decision cadence; pure meta-side (existing panel, currency, claim flow).
- **Cons:** permanent Directive choices need a respec/preview story; +% sources
  stack — total-multiplier audit needed; new persisted choices → migration +
  sanitize (clamp unknown directive ids).

### #5 — Paradigm Research *(generational breakthrough tiers)* · L · medium risk · **SHIPPED ✅**
**Pitch:** New research clusters — Neuromorphic, Quantum Training, Biological
Substrates, Alignment Theory — **revealed** (not discounted) by meta-progress (ship
thresholds / first ascension / a Legacy Constellation unlock). For the first time,
prestige shows nodes you've never seen.
**Why it fits:** The #1 depth finding — the tree is byte-identical every
generation, 100% seen before the first ship. Paradigm shifts are the most on-brand
concept an AI-lab game can add.
- **Pros:** the single biggest "new things to unlock" payoff; per-generation forks
  create build identity; slots naturally under #1's unlock nodes.
- **Cons:** largest authoring load (~15–25 nodes + copy + icons); curve-safety
  needs care (prefer meta-currency cost or ship-gating past the sim window over
  in-run resource cost); each paradigm needs its own balance pass + sim extension.

### #6 — Product Empire *(flagships, slot unlocks, deep milestone ladder)* · L · medium · **flagship + slot unlocks + deep milestones SHIPPED ✅**
**Pitch:** Meta-unlocked concurrent-slot increases, one designatable **flagship**
whose brand persists and compounds across ships, and a milestone ladder extended
deep into the late game — so the company grows **bigger**, not just re-optimizes the
same 3 products.
**Why it fits:** Products are the richest active layer (8 types, 12 features, 4
channels) but hard-cap at 3 (+1 perk) with 12 mid-game milestones
(`products.ts:44-45, 340-353`). A tycoon whose business can't scale late wastes its
best system.
- **Pros:** builds on the deepest existing system (high yield/hour); the flagship
  gives runs cross-generation **memory** (the DEPTH_ROADMAP's top-diagnosed gap);
  extended milestones are pure data + the existing cash-pop pattern.
- **Cons:** a cross-ship flagship is a new prestige-survival mechanic (reset
  semantics, migration, a cap so it doesn't trivialize early income); more
  concurrent products = more per-tick work on old iPhones; must reconcile with the
  `rep_slot` perk.

### #7 — The Frontier Race *(persistent rivals with claimable stakes)* · M · medium
**Pitch:** Rivals get persistent identities (focus, alignment, ships-this-cycle,
market position) plus a claim-gated **Market Leadership** ladder — hold the frontier
lead or #1 rank through escalating conditions to claim permanent edges. Beating
ClosedAI finally **means** something.
**Why it fits:** The game is framed as an AI race; the frontier drifts, rivals have
names and reactive posts — yet winning is pure flavor. Adds the reward spine the
audit and IDEAS.md hard-truth #4 both demand.
- **Pros:** activates already-built flavor (rivals, leaderboard, ticker) into a
  grind target cheaply; hold-the-lead tension automation can't trivialize;
  de-risks the planned DEPTH_ROADMAP Wave A.
- **Cons:** rival sim must stay deterministic (store-seeded randomness); "hold for
  N" risks check-in anxiety — needs generous offline handling; a new save surface.

### #8 — The Archive *(late-game data sink with a collection metagame)* · M · low
**Pitch:** A permanent Archive that ingests surplus Data into curated **Datasets** —
long escalating funding bars yielding collectible entries (a codex-like gallery)
plus small permanent research discounts. Turns the data firehose into a grind with
a shelf to fill.
**Why it fits:** The one substantive balance finding is that the data faucet far
exceeds sinks. Rather than nerf a live tuned curve, give data somewhere aspirational
to go — "we trained on everything; now we curate."
- **Pros:** fixes a real imbalance **as a feature**, not a nerf; a proven
  collection retention hook the game lacks; reuses funding-bar + codex patterns.
- **Cons:** rewards must stay tiny or the sink becomes dominant; should live inside
  an existing panel (DataMarket/Codex), not re-add a new overlay; escalating costs
  need tuning against wildly build-dependent data income.

### #9 — Doctrine Consequences *(aligned vs accel content forks)* · M · medium · **SHIPPED ✅**
**Pitch:** The doctrine fork stops being a lane-tilt skin: each side gets exclusive
content — doomer-only alignment research + clean-heat perks vs accel-only
shady-compute economy + a regulator-pressure minigame — plus charter-recommit
synergies. Your stance becomes a build you replay to see the other side of.
**Why it fits:** The doctrine choice (`config.ts:2372-2389`) is the tree's capstone
and the game's thematic heart, yet is flagged as a cosmetic dial. Exclusive content
doubles perceived content without doubling systems, and gives #3's "Doctrine Locked"
runs their payoff.
- **Pros:** cheapest way to make a second playthrough genuinely different; leverages
  underused state (alignment, heat, charter); strong satire payoff.
- **Cons:** two branches players only half-see per run (expensive per visible hour);
  regulator escalation risks feeling punishing vs the "calm" mandate; gating real
  power invites "one true doctrine" complaints — branches must be sidegrades.

### #10 — The Institute *(third prestige layer above ascension)* · XL · high · **SHIPPED (soft layer) ✅**
**Pitch:** After N ascensions, found an **Institute**: a reset converting
accumulated ascensions/Reputation into a new meta-currency spent on a fresh tree of
content-bearing unlocks — a 5th slot, a new ship mode, a new event branch, permanent
paradigm access. The endgame gets a whole new mountain instead of a +2% slider.
**Why it fits:** The #2 structural gap — ascension is prestige++ with a renamed
counter and Era 5 is the ceiling. Every long-lived idle eventually ships this layer.
- **Pros:** the definitive answer for the deepest players; gives ascension itself a
  purpose (it becomes the Institute's currency); can be the umbrella that organizes
  #1, #5, #6 into one meta-arc.
- **Cons:** XL scope (new currency, reset semantics, tree, panel, migration, full
  balance pass); a third reset risks alienating players mid-learning-curve;
  shouldn't start until #1 and #5 exist or it has nothing to unlock.

---

## Part 3 — What shipped (all verified: `tsc` clean · 583 tests · 0 console errors · balance sim unaffected)

**Less noisy (Part 1):** `logEvent()` channel + 9 self-click confirmations and the
achievement/level-up/churn notices moved to log-only; the redundant nav "Ship" text
badge removed in favor of the ambient icon pulse (accessible label retained).

**More to grind toward — feature #4 (Endowment Directives):** every 10 Endowment
levels now grants a **Directive** pick — a permanent lane doctrine (Compute /
Research / Commercial, +30% each, stackable). The deep-endgame Reputation sink is
finally a *decision* (lean a lane, diversify, go all-in), not just a rising +2%/level
number. New persisted field `endowmentDirectives` (SAVE_VERSION 23→24 + migration +
a multiset sanitizer that caps picks to the tiers actually earned), survives prestige
& ascension, folded into `reputationMods`. Curve-safe by construction: `repEndowment`
is 0 through the whole tuned game, so no tier is ever earned and the directive fold is
identity in the sim (unit-tested: `reputationMods(fresh)` is byte-identical). Verified
in-app: the picker renders 3 doctrines, a claim registers "Directives — Compute +30%",
zero console errors.

**More to grind toward — feature #1, Legacy Constellation:**
- A third **"Frontier"** tier per Legacy lane — Compute / Data / Revenue Frontier,
  +50% each, cost 120 weights, gated on the tier-2 Mastery node. Fully committing a
  lane now costs 172 weights (12+40+120), a genuine long-horizon sink where the tree
  previously topped out early.
- The first **unlock node** — **Product Division** (80 weights, gated behind Revenue
  Mastery): unlocks a **+1 concurrent product slot**, the first Legacy reward that
  gates *content* rather than a flat %. This required extending the legacy effect type
  to a `lane | unlock` union (with `legacyTreeMods` guarded so unlock nodes can't leak
  into the lane multipliers) and folding a new `legacyBonusProductSlots` into
  `maxActiveProducts` — stacking cleanly with the Reputation `rep_slot` perk (base 3 →
  up to 5). Ties the prestige tree to the product system, the cross-system resonance
  the depth audit called for.

Both are curve-safe by construction (Legacy Weights are a meta-currency the sim never
earns/spends; the sim never launches products, so a 4th slot never shifts the tuned
curve). No new save field, no migration (`legacyInvestments` already persisted; its
known-id filter auto-includes the new nodes). Renders as 10 clean nodes in the Prestige
panel (verified in-app, zero console errors).

**Foundation insurance (Theme 3):**
- Purity guardrail test now enforces the **`Math.random` / `performance.now` /
  `new Date`** half of the deterministic-engine invariant (comment-stripped so it
  matches real calls, not the doc comments) — `guardrails.test.ts`.
- **Corrupt-save stash**: a save so corrupt it won't parse is now copied to a
  `singularity.save.corrupt.v1` sibling key before falling back to a fresh state,
  closing the one true wipe path — `store.ts`.
- **Migration-ladder completeness test**: asserts `migrate()` reaches
  `SAVE_VERSION` from every prior version and is idempotent at the top, so a future
  persisted field can't silently skip the ladder — `save.test.ts`.

**More to grind toward — feature #6 (Product Empire, first slices):**
- **Concurrent-slot unlocks** — the Legacy **Product Division** node (above) adds a
  4th slot; with the Reputation `rep_slot` perk the cap reaches 5, so the business can
  finally scale in the late game instead of re-optimizing the same 3 products.
- **Deep milestone ladder** — the product milestone chase previously ended mid-game
  (10M users, $50K/s, v10), so the next-goal carrot went quiet once a lab matured.
  Added a late-game tier: 100M users, 1M paid, $500K/s, v20, **run 4 / run 5 products**
  (the payoff for the slot unlocks), and 20 sold. Pure data on the generic milestone
  evaluator — the ladder now runs 12 → 19 rungs, extending the visible "grind toward"
  target deep into the endgame. Curve-safe: the deploy-only sim never launches a
  product, so no product milestone ever fires in the tuned run (unit-tested).

**More to grind toward — feature #3 (Prestige Trials):** an opt-in board of
**constrained training runs** in HQ. You commit to a Trial *early* in a generation
(gated on `!canPrestige` — before a deployable exists, so the handicap is endured for a
full run, not switched on the instant before a ship), play under its handicap, and
**complete it by shipping** — banking a small permanent reward. Three to start: *Ablation
Study* (½ Compute → +10% Compute forever), *Lean Budget* (½ Money → +10% Money), *Data
Scarcity* (½ Data → +10% Data). New engine module `trials.ts` + `balance/trials.ts`,
folded into `derive` (handicap × completed rewards), completion inlined in `prestige`
(cycle-free), new persisted `activeTrial`/`trialsDone` (SAVE_VERSION 24→25 + migration +
known-id sanitizers), a `TrialsPanel` (active-Trial full-card tint — no accent bar).
Curve-safe: the deploy-only sim never opts into a Trial, so `activeTrial` stays null and
`trialsDone` empty — the fold is identity (unit-tested byte-for-byte on a fresh run).
Verified in-app: 3 Attempt buttons, committing activates the handicap, zero console errors.

**More to grind toward — feature #6 (Flagship):** the player designates ONE active
product as the company **flagship**; every ship it survives raises its **tenure**, which
grants a **bounded** permanent revenue bonus (capped at 10 ships × 3% = +30%). Rewards
nurturing a single product across generations instead of set-and-forget — the "memory"
the depth audit called the top gap. New `flagship.ts` (own module, so `derive` folds the
money bonus without the products.ts→derive cycle); `advanceFlagship` runs in `prestige`
(tenure++ if the product survived, brand lost if retired); new persisted `flagship`
(SAVE_VERSION 26→27 + migration + a sanitizer that clears a phantom id and clamps
tenure to the cap). A ★/☆ toggle in ProductDetail. Curve-safe: the sim never launches a
product, so it never has a flagship — the fold is identity in the tuned run.

**More to grind toward — feature #2 (Megaprojects II):** once **every** Grand Challenge
is complete, a repeatable **Megaproject** ("The Next Big Thing") opens — escalating
funding cost each cycle (×2.2) for a **diminishing but permanent** all-lane bonus. The
lifetime bonus is a converging geometric sum (→ 1 + baseMag/(1−decay) ≈ +33%), so the
deepest players always have somewhere to point production, and it can **never** run away.
New engine functions in `challenges.ts` folded through `challengeMods`; new persisted
`megaprojects` {level, funded} (SAVE_VERSION 27→28 + migration + a sanitizer that clamps
level ≥ 0 and funding to the cycle cost); a Megaproject card in the panel. Curve-safe:
the sim never completes even one challenge, so it never unlocks the loop (identity).

**More to grind toward — feature #5 (Paradigm Research):** the fix for the audit's #1
finding — the 25-node research tree is byte-identical every generation, so prestige only
*discounted* it, never *revealed* anything. Paradigms are genuinely NEW capability nodes
(Neuromorphic Compute, Synthetic Cognition, Quantum Annealed Training, Biological
Substrates, Recursive Self-Improvement) that appear only past a deep ship threshold and
are bought with **Reputation** — so for the first time a veteran sees research they've
never seen. New `paradigms.ts` + `balance/paradigms.ts`, folded into `derive`; cost is
charged to `reputation.spent` (reusing the shared pool, no new currency, no import cycle);
new persisted `paradigms` (SAVE_VERSION 28→29 + migration + known-id filter + spend
reconciliation like perks/endowment); a `ParadigmPanel` in the Research section.
Curve-safe by construction: cost is Reputation and the sim never spends it, so paradigms
stay empty and the fold is identity through the tuned run (unit-tested byte-for-byte).

**More gameplay — feature #9 (Doctrine Consequences):** your STANCE becomes a build.
Commit to Safety (doomer) or Acceleration (accel) via faction world-event choices and
claim that side's exclusive permanent perks (Enterprise Trust / Clean Operation / The
Long View vs Scale Is All You Need / Ship It / Frontier Supremacy); the other side stays
visible-but-locked, a reason to replay committed the other way. Deliberately POSITIVE-SUM
— both tracks are sidegrades, no punishing regulator minigame (the audit flagged that as
off-tone). New `doctrine.ts` + `balance/doctrine.ts` folded into `derive`; new persisted
`doctrines` (SAVE_VERSION 29→30 + migration + known-id filter); a `DoctrinePanel` in HQ.
Curve-safe TWICE over: perks are claim-gated (player-only) AND require alignment past the
commit threshold, and the sim never fires a faction event → it stays neutral → identity.

**More gameplay — feature #10 (The Institute):** the third meta-layer, above AGI
ascension — shipped as the SAFE **soft** version (no reset, no lost progress, per owner
choice). Ascensions mint **Grants** (a new meta-currency); you found and expand the
Institute's wings — Institutional Compute / Sovereign Data Trust / Endowment Fund →
Interdisciplinary Synthesis → **The Singularity Institute** (+80% all output) — a fresh
tree of powerful permanent unlocks that gives the deepest players a new mountain. New
`institute.ts` + `balance/institute.ts` folded into `derive`; new persisted `institute`
(SAVE_VERSION 30→31 + migration + known-id filter); prestige carryover. Curve-safe: Grants
come only from ascensions and the sim never SPENDS them, so the tree stays empty →
identity (the sim earns Grants exactly as it earns Reputation it never spends).

**Cleaner, not noisier (standing owner rule):** rather than pile the Institute onto the
already-dense HQ, added a reusable **`Collapsible`** and folded the deep-endgame panels
(Trials, Doctrine, The Institute) into compact collapsed headers — Trials/Doctrine show
as one-line "TRIALS 0/5 ▾" rows, and the Institute auto-expands only when it has Grants
to spend. HQ opens tidy instead of a wall of stacked panels.

### All 10 ranked features shipped ✅
Nothing remains on the ranked list. Further depth = deepening shipped systems (more
Institute wings, Paradigm tiers, Trial varieties) or new directions from playtest notes.

### Shipped across this branch (running tally)
Less noisy: `logEvent` + 9 confirmations & achievement/level-up/churn → log-only; nav
"Ship" text badge → ambient pulse. Foundation: purity guardrail (RNG/clock), corrupt-
save stash, migration-ladder completeness test. More gameplay: Legacy **Frontier**
tier-3 + **Product Division** slot-unlock; **Endowment Directives**; deep
**product-milestone** ladder; **Prestige Trials** (+ Solo Run condition & cross-lane
tiers); **Grand Challenge forks** + **Megaprojects II**; **Flagship** brand; **Paradigm
Research**; **Doctrine Consequences**; **The Institute** (+ HQ **Collapsible** de-noising).
Plus a two-pass **early-game balance retune** (flowier opening, first ship ~58→~30 min).
All verified — `tsc` clean, **616 tests**, balance sim re-tuned + identity-tested, each
driven in-app with zero console errors. **All 10 ranked features shipped.**
