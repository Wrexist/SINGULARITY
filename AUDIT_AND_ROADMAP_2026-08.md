# Audit & Roadmap — 2026-08

Five parallel audits of the shipping build (noise/confusion, UI/navigation/design,
progression/late-game, engine correctness, first-session/retention), plus the fixes
applied in this pass and a ranked list of ten candidate features.

Every claim below was verified against code or reproduced by a test before being acted
on. Where an audit's recommendation was rejected, the reason is recorded.

---

## Part 1 — What was broken

### 1.1 Offline paid a fraction of online (severity: critical)

`applyOffline` is `tick(state, appliedMs)` — one call with the whole window, up to 8h
(24h premium). Most of the sim is dt-invariant so this held for the lab loop, but the
product business is not:

- `simulateProducts` advances the competitive frontier to its **end-of-window** value
  before pricing the window, so all 8 hours are priced at hour-8 staleness.
- MAU integrates with a single **forward-Euler** step while `paid` is closed-form, so
  the two desynchronise.

Reproduced in `src/engine/offlineParity.test.ts` on a lab with one marketed product,
8h window, versus the same window ticked in 1s steps:

| Measure | Offline / online |
|---|---|
| Users (MAU) | **0.097×** |
| Money earned | **−0.008×** (negative) |

The money ratio is negative because the marketing budget is charged for the full window
while the revenue it buys is not earned. **A player who closed the app came back poorer
than one who left it open** — the exact inverse of the genre's core promise.

**Fix.** Sub-step any window over 5 minutes inside `tick` itself (`MAX_STEP_MS`), which
covers offline catch-up, OS suspend/resume and frozen background tabs in one place.
Costs ~15ms on an 8h window, ~45ms on a premium 24h one, paid once on resume.

**Curve impact: none.** The balance sim drives the engine in small live steps and never
uses the offline path. Re-running `npm run sim` after the change gives an identical
curve — first prestige 29m35s, longest wall 0m38s, Gen 20 at 1m27s. This brings offline
*into line with* the tuned curve rather than shifting it.

### 1.2 A pasted save could permanently brick the install

`modifiers` was the only persisted collection with a length cap (added after a crafted
flood overflowed tick's window-split recursion). Everything else filtered entries
one-by-one but never bounded the count. Verified in `src/engine/saveLimits.test.ts`:
5000 products, employees, achievements, milestones and upgrade keys all survived
`deserialize` intact. Per-tick cost is linear in portfolio size, so a few thousand
well-formed products make each tick outrun the tick interval — and the next autosave
writes the bloat straight back, so every future launch is dead on arrival.

`importSave` accepts an arbitrary pasted base64 blob, so this is reachable by anyone who
tries a "free money save" from a forum.

**Fix.** Generous ceilings (`MAX_SAVED_PRODUCTS` 64, `MAX_SAVED_EMPLOYEES` 512,
`MAX_SAVED_IDS` 512, drafts to the existing `maxDrafts`), all far above any reachable
legit value.

### 1.3 `deserialize("null")` threw — the only true save-wipe path

`migrate` read `.version` off its argument immediately, so a top-level `null`, number,
string, array or boolean threw a TypeError. The store catches it, stashes the bytes and
starts fresh — which is a wipe, and "saves are hostile input: filter, don't wipe" is a
hard rule. Separately, a version matching no `if (s.version === N)` branch (`null`,
`"7"` as a string, `3.5`, `-5`) passed through the entire chain untouched and was then
stamped as current, silently skipping every migration.

**Fix.** Normalise both before the chain runs.

### 1.4 Reduce Motion didn't reach the particle layer (CLAUDE.md hard-rule violation)

`prefersReducedMotion()` only seeded the default for a fresh install. Once persisted,
a player who turned on iOS Reduce Motion afterwards still got every burst, floater and
scale-punch — the CSS side honoured both signals, the JS side only the stored setting.

**Fix.** `motionReduced()` ORs the in-app toggle with a **live** media-query listener;
React subscribes so the `.reduce-motion` class and `FxCanvas` follow it mid-session.

### 1.5 The offline recap almost never fires (found, not yet fixed — see Part 4)

`applyOffline` is reachable only from `init()`, which runs once on mount. On iOS the
normal return path is suspend → resume, not kill → cold launch. On resume the interval
fires with a large delta, the engine catches up correctly, and `OfflineModal` **never
renders**. The entire welcome-back payload — story lines, achievements, reputation, era
crossings — is skipped on the platform's most common return path.

---

## Part 2 — Noise and confusion

Measured surface area before this pass: **22 distinct interrupt surfaces** (only 6
serialised by the moment queue), **14 addressable panes**, **16 simultaneous attention
markers**, and **10 always-open panels stacked in HQ alone**.

Applied:

| Fix | Why |
|---|---|
| Removed 2 always-true advisor items (Reputation perk / Endowment affordable) | The Endowment is an infinite Reputation sink, so the second was true on essentially every mature save — between them they kept the Lab nav badge and HQ dot **permanently lit**, teaching players that badges mean nothing. Pinned by a test. |
| Folded Contracts, Automation and Grand Challenges into `Collapsible` | HQ went from 10 always-open panels to 4, each folded board still carrying a "N ready" count so no signal is lost. |
| Deleted the "You can Ship the Model!" toast | The same state change already opens the one-time explainer sheet and lights the HQ dot. One fact was being announced through seven channels. |
| Removed `ring-ready` | Affordable cards carried **two** out-of-phase infinite animations (`afford-breathe` 2.6s + `ring-ready` 1.9s) on the same element, times every affordable card on screen. The static halo keeps the affordance. |
| Cut the onboarding foot paragraph | It explained the FIRST STEPS checklist (which explains itself, in place) and pre-taught tabs and badges the player hadn't seen. |
| Dropped 3 duplicated StatsPanel rows | Compute/s, Data/s and Passive income are already in the always-visible ResourceBar. |
| Trimmed the prestige timing note to its actionable half | The generic "weights have diminishing returns" line restated the bar directly above it, on every ship. |
| World events no longer land on an open sheet | Reproduced in a seeded smoke run: a world event fired on its own Poisson timer **on top of** the open More sheet, compounding two dimmed backdrops. Every other full-screen moment is a consequence of something the player just did; this is the only uninvited one, so it is now the only one that waits. |

The three folded boards each needed a `bare` prop first: `ContractsPanel`, `AutomationPanel` and `GrandChallengesPanel` render their own `<section class="panel">` and heading, so wrapping them in `Collapsible` nested a panel inside a panel and showed each title twice. (Trials/Doctrine/Institute were already fragments, which is why they folded cleanly.)

**Rejected:** deleting `ship-choose-tip`. The audit called it redundant with the ship
explainer, but that explainer shows *once ever* (settings-persisted) while the mode
chooser appears on every ship — it is the only persistent statement of what a
destructive, irreversible reset destroys. That belongs where the button is.

---

## Part 3 — UI, navigation and symmetry

Token drift, measured across `styles.css`: **24 font sizes** (7 of them half-pixel
variants of a neighbour, accounting for 77 declarations), **25 border-radii**, **24
padding values** (every integer 1–16 in use), **70 distinct box-shadow strings** for
what should be 4 elevations, and **three different near-black bases** for hairlines
(`rgba(17,24,39)`, `rgba(16,24,40)`, `rgba(20,22,27)`) — which is why borders don't
quite match panel to panel. Twenty-six full-width row cards use **14 distinct padding
pairs and 6 radii** for the same visual object.

Applied this pass:

| Fix | Defect |
|---|---|
| One gutter | `.app` sets 16px; `.topbar` added 4 (=20), `.modbar` 18 (=34), `.firststeps` 12 (=28). **Four different left edges on one screen**, with the first-session coach card inset from the hall directly above it. |
| ResourceBar alignment | Compute always rendered a rate row; Data and Money only when non-zero — so three equal-height cards had their contents at different heights, permanently, at the top of every screen. |
| `Money` label | The trio read `COMPUTE / DATA / $`; a lone glyph in the third slot read as unfinished. |
| `.pd-pane-tip` defined | Applied in three places, **defined nowhere** — those paragraphs rendered at browser-default 16px with default margins. The loudest "unfinished" tell in the product. |
| `.btn-sm` width reset | `.btn` sets `width:100%` and `.btn-sm` set `flex:0 0 auto` without resetting it, so three siblings each wanted the full row and refused to shrink — the Settings backup row **silently clipped its third button** off the right edge. |
| Progress label contrast | `#fff` centred over a 6%-black (near-white) track ≈ **1.2:1** at any fill under ~50%. That is the Training Run readout. Now carries its own halo, legible at every percentage. |
| `.progress.charging` defined | The class was applied but never styled, so the first-run cold start looked identical to an active run. |
| Theme picker actually themes | **54 lines** of hardcoded `#7c5cff` / `rgba(124,92,255,…)` never recoloured. `--pd-purple` now derives from `--accent`, so the whole Product Detail sheet themes too. Picking "Mainframe Green" used to give a green nav bar and a violet Products tab. |
| Reclaimed the empty notice slot | It reserved 44px + a 16px gap during FIRST STEPS, when it is suppressed by design and nothing can ever appear in it. |

### Navigation: the structural finding

Seven separate goal/reward systems live in four places with four visual languages —
Objectives (Build), Contracts (HQ), Grand Challenges (HQ), Trials (HQ, folded),
Doctrine (HQ, folded), Product Milestones (Products, folded), Achievements (nav modal).
A player asking "what should I do next?" must check seven places.

**The advisor chip exists because the information architecture doesn't answer that
question.** It is a workaround for the structure, not a feature of it. The durable fix
is a single `GOALS` destination (Now / Long game / Collection) replacing the Awards
modal — one card component, one header, one truthful badge. Deferred: it is a large,
risky change to a live app and deserves its own pass.

---

## Part 4 — Recommended next, in order

1. **Fire the offline recap on resume** (§1.5). Highest player-visible value left. Needs
   care: the away window must be ticked exactly once, so the resume path must be the
   sole authority and the live loop must not also catch up. Raise the show-threshold
   from 1s to a few minutes while there.
2. **`Math.pow` → `Big.pow` in `derive.ts`.** Latent, not live: today every
   `computeMult` upgrade is capped. The moment anyone adds an uncapped multiplicative
   upgrade, `Math.pow(1.08, 1e7)` → `Infinity` → `Big.mul(Infinity)` → **silently 0**,
   and the whole economy dies and persists that way. `break_infinity` absorbs
   non-finite input to zero rather than throwing, so the failure is silent.
3. ~~**The GOALS destination**~~ ✅ **done (visual-polish pass, 2026-08).** All seven
   goal systems now live in one destination grouped by horizon (Now / Long game /
   Collection); the boards moved rather than being copied, so HQ is down to
   Automation + the Institute, Build loses Objectives, and the Awards modal is
   gone. One scan (`src/ui/goalsCount.ts`) feeds the nav badge, the horizon dots
   and the fold counts, and counts only what is genuinely claimable — pinned by
   `src/ui/goalsCount.test.ts`. Advisor wayfinding moved with the boards.
4. ~~**Design-token pass**~~ ✅ **done (visual-polish pass, 2026-08).** Type scale is
   8 tokens (`--fs-micro`…`--fs-2xl`) + four display one-offs; radii are
   `--radius/-sm/-xs/-2xs` + pill/circle; neutral shadows are `--shadow-xs/sm/md/lg`
   + `--shadow-knob` (colored glows stay semantic); hairlines share one base hue
   (16,24,40); the row-card family uses three padding tokens
   (`--pad-row/-card/-card-lg`). The "one card component" refactor remains open —
   it's a TSX structural change, not a token sweep.
5. ~~**Feedback proportionality**~~ ✅ **done (same pass).** Routine buys cap at
   26 @ 1.35 (flavor-tier milestone buys 32 @ 1.5), below the achievement burst
   (now 28 @ 1.45). Research plays a discovery arpeggio (`sound.research`), a hire
   plays a warm welcome (`sound.hire`) — neither reuses the rack purchase chime.
6. ~~**`sound.era()` muted unless Music is on**~~ ✅ **done (same pass).** The era
   stinger plays when either Sound or Music is enabled.

---

## Part 5 — Ten features, ranked

Ranked by (player value × fit) ÷ cost. Every entry states why it cannot move the tuned
curve.

### The curve-safety envelope

The balance sim buys upgrades, research and non-shady data offers, prestiges with the
default `deploy` mode, launches drafts as `general`, pushes versions and sets marketing.
It **never** hires or assigns staff, picks a non-default ship mode, sets a charter,
starts a trial, buys Reputation perks / Endowment / Legacy / Paradigms, claims Doctrine,
buys Institute wings, funds Challenges or Megaprojects, claims Objectives, Contracts or
Sponsors, toggles Automation, publishes Preprints, buys shady data, or makes a
world-event choice.

So a reward is curve-safe if it is **(1)** claim-gated on a player-only verb, **(2)**
priced in a meta-currency the sim earns but never spends, **(3)** temporary, or **(4)**
gated on state the sim structurally cannot reach (`alignment ≠ 0`, `heat > 0`,
`employees.length > 0`, a non-`deploy` ship mode).

**Not safe:** new rows in `balance.research`, `balance.upgrades`, non-shady
`dataMarket`, or the Rig Bay catalog — the sim buys all of those greedily. A +6%
component set bonus once moved first prestige by ~10 minutes.

---

**1. Institute Fellowships** — *cost: S* ✅ **implemented this pass**

The Institute is the last panel a player ever unlocks and it caps out at 9 Grants — one
per ascension, so it is exhausted 9 ships after it opens, and the game's deepest layer
ends on its weakest note. Once all 5 wings are founded, Grants now buy repeatable
Fellowships: escalating cost, a small permanent all-lane boost each, and a named Fellow.

- **Pros.** Converts a terminal layer into an infinite one for the least work of
  anything here; gives every late ship a purpose forever; near-exact copy of the proven
  Endowment pattern; provably curve-safe by the precedent already documented in
  `balance/institute.ts` — the sim earns Grants and never spends them.
- **Cons.** Another "number goes up" sink rather than a new verb; competes with the
  Endowment for the same late-game attention; needs a `SAVE_VERSION` bump.

**2. Megaproject Charters** — *cost: M* ✅ **implemented (visual-polish pass, 2026-08), shipped as Megaproject MANDATES** — renamed to avoid colliding with the existing Lab Charter system. The bounded multiplier is unchanged; each completed cycle now mints one permanent pick (lane +12% / all +5%), stacking, so cycle 30 is worth what cycle 5 was. Save v34 + migration; curve-safety re-proved with a byte-identical `npm run sim`.

The endgame is arithmetically dead. `megaprojectMult` sums a geometric series with
`baseMag 0.05, decay 0.85`, converging to **1 + 0.05/0.15 = ×1.333** — while each cycle
costs ×2.2 more. Level 10 already delivers ~26% of that ceiling; after ~15 cycles the
player is paying exponentially escalating costs for the fourth decimal place. Keep the
bounded multiplier as a baseline and make each completed cycle mint a **Directive-style
pick** (Compute / Data / Revenue / a free Endowment level / a second charter slot).

- **Pros.** Fixes the single most broken piece of endgame math; turns a spreadsheet into
  a decision; reuses the Directive UI; the sim never calls `fundMegaproject`.
- **Cons.** Only reachable after all 9 Grand Challenges (~ship 52), so it helps very few
  players; needs new persisted state and a migration.

**3. Research Epochs** — *cost: L* ✅ **implemented (visual-polish pass, 2026-08).** Epoch nodes live in their OWN array (`balance/researchEpochs.ts`), never in `balance.research` — the sim iterates that array, so the separation is structural rather than a gate someone could later loosen. Gated on paradigm ownership only (never ships/era). Three branches: Neuromorphic, Synthetic, Recursive (the last with a mutually-exclusive fork). `npm run sim` byte-identical; the base-only scans (Preprints unlock, achievement threshold, prestige meter, the sim) documented and pinned in `engine/researchTree.ts`.

The deepest structural gap: prestige clears research, so **every generation replays the
identical 21-node script in the identical order**. Add `requiresParadigm` to research
defs and ship 2–3 small epoch trees that only appear once the matching Paradigm is
owned. The player finally sees unseen nodes in the Research panel.

- **Pros.** Attacks the #1 reason the mid-game feels repetitive; makes Paradigms feel
  transformative rather than statistical; scales content by adding data rows.
- **Cons.** The only idea here that touches `balance.research`, which the sim consumes
  greedily. Safe **only** because it gates on `state.paradigms` (never spent by the sim,
  so always empty) — must be gated on paradigm ownership, never on ships, and verified
  with `npm run sim`. Highest risk and highest cost on the list.

**4. Trial Ladders** — *cost: S/M*

Five one-shot Trials that end at ship 11. Add tiers: re-run any trial at a harsher
handicap for an escalating, decaying reward. `trialsDone` becomes a tier map.

- **Pros.** Infinite skill expression from content that already exists; a veteran always
  has a "run this generation hard" option; `canStartTrial` is player-only, so the sim
  never enters one and `trialMods` stays identity.
- **Cons.** Appeals mainly to optimisers; risks making the "correct" play a slog; needs
  a migration for the changed shape.

**5. Sponsor Campaigns** — *cost: S/M*

The daily Sponsor is the only infinite goal and pays a flat 6 Reputation with no memory.
Make it a 7-day themed campaign: complete 5 of 7 days to bank a reward, with a visible
Sponsor Tier rising across campaigns.

- **Pros.** The game's weakest return-hook becomes its strongest — today's Daily Boost
  (+50% for 3 min) is *weaker than a routine objective claim* (×2.0–3.8); stays honest
  (missing a day costs one tick, no streak punishment); pure data rows.
- **Cons.** Nudges toward daily-obligation design the project has deliberately avoided;
  the daily rollover is UTC-keyed, so this should be moved to local midnight first.

**6. Doctrine Schisms** — *cost: S*

Doctrine is 6 perks, both sides claimable, finished by ship 6 — so the two most
flavourful dials in the game are also the flattest. Add third-tier perks gated on
*sustained* commitment (`safetyShips`, already tracked) plus a Schism capstone for
holding one side across 5 consecutive ships.

- **Pros.** Cheapest way to make alignment a real build choice; gives repeat generations
  an identity; the strongest curve-safety proof on the list — the sim never makes a
  world-event choice, so `alignment` is exactly 0 and every gate is false forever.
- **Cons.** Invisible to players who never engage with alignment; punishes switching
  sides, which may feel restrictive.

**7. Refound the Lab (Founder Archetypes)** — *cost: L*

The only reset is prestige; ascension is a soft flag with no tree of its own. Add a
fourth layer: at ~12 ascensions, wipe Legacy/Reputation/Paradigms for Founder Points and
a permanent Archetype that **rewrites the rules** (Academic: cheaper tree, Preprints from
turn 0; Operator: extra product slots; Scaler: double rack Compute, half Data).

- **Pros.** The only idea that answers "what am I still playing for on day 14" with a
  genuinely new mountain rather than a bigger number; archetypes make replays *play*
  differently; the sim never refounds, so every fold is identity.
- **Cons.** The most expensive and highest-risk item here — a new reset layer touches
  save, derive and the whole meta; asking players to give up permanent progress needs
  very careful framing; easy to get wrong in a live game.

**8. The Rival Cold War** — *cost: M*

The market leaderboard is an explicit "sidecar" with static rivals. Give each a
persisted posture and a board of Money-only Operations (poach a researcher, publish a
takedown, sign a compute pact), with deterministic retaliation.

- **Pros.** Adds a genuine second verb to a stretch where the only verb is *buy*;
  `state.rivalOps` and `doCounterRival` already exist, so this extends live plumbing;
  every effect is a temporary modifier behind a player tap.
- **Cons.** Risks becoming another chore board; rivals are currently pure flavour, so
  giving them mechanics raises the bar on their writing.

**9. Facility Wings** — *cost: M (engine) / L (with renderer)*

`maxDrawnRacks` hard-caps at 120, so the room stops growing while the numbers climb —
the loudest broken promise in the game ("every owned rack is one visible box"). Sell
Wings for Legacy Weights: an Orbital Annex, a Fusion Substation, a Cryo Vault, each a
visible structure that raises the cap.

- **Pros.** Restores the game's best ambient reward — *seeing* the lab grow; the
  `LegacyEffect` union is already a discriminated type built for this; spends a
  meta-currency the sim never spends.
- **Cons.** The renderer is ~1500 lines and needs on-device verification; the payoff is
  aesthetic rather than mechanical; largest art cost on the list.

**10. The Archive** — *cost: S/M*

The Codex is 31 entries and terminates. Turn it into an infinite archive: auto-written
Generation Reports per ship (the data already exists in `shipLog` / `lastShipReport`),
rival dossiers, and a dated in-fiction press archive drawn from the ~110 world events.

- **Pros.** Infinite collection with **zero** economy surface — the safest thing on this
  list; makes the run story persistent instead of a 4.2s screen that auto-dismisses;
  pure text from existing stats.
- **Cons.** Passive content — it rewards reading, not playing; does nothing for players
  who skip lore; needs `shipLogCap` raised or paged.

### If only three are built

**1 → 2 → 3.** Fellowships and Megaproject Charters convert the game's two *terminal*
endgame layers into infinite ones for S/M effort each, using patterns already proven in
`reputation.ts`. Research Epochs is the expensive one, but it is the only entry that
fixes the mid-game rather than the end-game, and the mid-game is where players actually
are.
