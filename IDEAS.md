# IDEAS.md — Game-design & UX audit (senior designer pass, 2026-07-04)

*Scope: full codebase walk (engine, UI, renderer, state) + GDD/TASK/LEARNINGS/IMPROVEMENTS.
Everything below is read from the code as it exists on `main` (post-Rig-Bay-C4, 496 tests),
not from the docs' intentions. No code was changed; nothing was added to TASK.md.
Everything is ranked by impact/effort. Where the current design is weak, it says so.*

**The owner's framing for this pass:** the Rig Bay proved the pattern — a small, legible
decision layer with context (named parts, grades, trophies, fusion). The next step is
*integration*: those layers must live in the 2.5D world, not in panels beside it. The hall
should look empty without them. That thesis shapes the feature list below.

---

## Hard truths first (the weak points, stated plainly)

1. **The "defining pillar" is a 230px banner.** The GDD calls the 2.5D hall the game's
   screen-space-earning centerpiece (`GDD §0.1, §5`). In the shipped layout it is a fixed
   `height: 230px` strip (`styles.css:1041`) at the top of ONE of three Lab sections — it
   vanishes entirely while the player is in Research or HQ, which is where most mid-game
   interaction happens. The world the player is building is out of sight for most decisions.
2. **The newest decision layer is invisible.** Rig Bay components — the system the owner is
   most excited about — manifest in the hall as a `+0.3` ceiling on an LED pulse
   (`hallRenderer.ts:321`). A player who fits a $2.8M Prototype accelerator line sees a room
   that is byte-for-byte almost identical. This is the largest manifestation-rule violation
   in the game, on the system that most deserves the rule.
3. **Haptics do not work on the platform you ship to.** `haptics.ts` uses the web Vibration
   API only; iOS Safari/WKWebView silently ignores it (the file's own comment says so,
   `haptics.ts:2-4`). The game has a designed 4-tier haptic vocabulary, a settings toggle,
   AND a light/full intensity setting — and none of it fires on a TestFlight device. Two
   settings rows currently control nothing.
4. **The most alive system has no teeth.** Rivals have names, personalities, reactive blog
   posts, and a counterplay mechanic — and the leaderboard is a pure sidecar
   (`market.ts`): rank changes nothing, press blitz caps at 3 strikes and resets on
   prestige. It's the game's best satire delivery vehicle and it's cosmetic.
5. **Day-7 content exhausts on every axis at once.** Research (~20 ownable nodes, then inert
   for the rest of the run), capped upgrades (25/12 max levels), the contract ladder (30
   rungs, ends *permanently* at `serial_ascender`), the legacy tree (5 nodes), codex (26),
   achievements (~45). A week-two player's session is: re-climb the same tree, nudge product
   dials, ship. The prestige loop is strong, but it is carrying the entire late game alone.
6. **Chen is behind a door most players never open.** The regulator/suspicion/negotiation
   stack — arguably the richest narrative system — only activates via dark-web buys, and the
   sim proved the data market is *optional* (LEARNINGS: research is never data-bottlenecked).
   An honest player can finish the content without ever meeting the game's antagonist.

---

# 1 · FRICTION AUDIT — the player journey

Severity: 🔴 hurts retention/comprehension · 🟠 noticeable friction · 🟡 polish gap.

## First launch (minute 0–10)

- 🔴 **F1 — iOS haptics are a no-op** (`haptics.ts:16`). Every tap, claim, buy, ship, and
  warning in the first session is silent to the hand on the shipped platform. The seam for
  `@capacitor/haptics` is already designed in — it was just never wired. See Quick Win #1.
- 🟠 **F2 — The welcome modal promises UI that doesn't exist yet.** Onboarding points the
  player at "badges on the tab bar" (`Onboarding.tsx:34-37`), but at gen 0 the nav is
  Lab + Awards + More — Products and Team don't exist until later reveals (`App.tsx:769-780`).
  A new player told to watch badges has one watchable tab. Fifteen-minute copy fix.
- 🟠 **F3 — The cooling fans never spin.** They're drawn frozen inside the static-layer
  cache (`hallRenderer.ts:235-236`, the comment admits it). Fans are the room's one promised
  "machine in motion"; a still fan reads as a rendering bug once noticed. See Quick Win #2.
- 🟡 **F4 — The first minutes of the hall are static.** Motes and the data-flow packets are
  gated to era ≥ 1 / active states, so between the first rack popping in and automation
  (~4 min) the world is a still image with one blinking LED. The opening retune fixed the
  *economic* boredom; the *visual* opening is still flat.
- 🟡 **F5 — Canvas reduced-motion isn't seeded from the OS.** `settings.reducedMotion`
  defaults to false and never reads `prefers-reduced-motion` (`settings.ts:8`); meanwhile the
  CSS confetti in Celebration/EraTransition ignores the setting entirely
  (`Celebration.tsx:66-79`, `EraTransition.tsx:23-36`) — the two most intense moments are the
  two that don't respect it.

## First session (hour 1)

- 🔴 **F6 — Fitted components are invisible** (hard truth #2). The Rig Bay reveals at 3 racks
  as a *panel*; the hall never confirms the purchase. The single strongest lever this audit
  found — see Feature #1.
- 🟠 **F7 — The claim loop stalls off-Build.** Pre-auto-claim, a ready run's only signal on
  the Research/HQ sections is a badge number — the advisor deliberately never nudges claims
  ("the Claim button IS the nudge", `App.tsx:81-83`), but the Claim button is off-screen
  there. A first-session player parked on the research tree is silently earning nothing.
- 🟠 **F8 — The training-intensity slider teaches nothing.** It's the opening's one genuinely
  strategic dial (letting the Compute bank climb toward research costs — the auto-train
  starvation problem in LEARNINGS), it appears without ceremony when auto-train comes online
  (`TrainingDock.tsx:79-101`), and nothing ever explains *why* you'd lower it. Players who
  never touch it hit the "mountains of Data, stuck Compute" wall the mechanic exists to solve.
- 🟡 **F9 — Badge semantics are inconsistent.** Products/Team/Lab badges = "things needing
  attention"; the Awards badge = lifetime total achievements (`App.tsx:783`) — a permanently
  large number in the same visual slot. It trains players that badges are ignorable, which
  poisons the useful ones.
- 🟡 **F10 — "Recommended next" exists for Upgrades and Research but not Rig Bay,
  Reputation, or Products** — the three panels where a new player is most likely to not know
  what's good. Inconsistent application of the game's own best pattern.

## First prestige (day 1–2)

- 🔴 **F11 — The open-source ship mode quietly discards the main reward.** `open_source` has
  `keepsDraft: false`; the only warning is a small "✗ No product — you gave the model away"
  tag in the mode chooser (`PrestigePanel.tsx:142-143`). A player picks the thematically
  coolest option on the scariest button in the game and lands in an empty lab with no draft
  and no product path. This is a dead-end *feeling*, if not a literal one. See Quick Win #3.
- 🟠 **F12 — A draft with full slots is a stranded reward.** The Products panel shows
  "Slots full" (`ProductsPanel.tsx:102`) with no in-panel route to free a slot — selling
  lives two taps deep inside ProductDetail. The reward the prestige just paid out sits
  blocked with no visible unblock affordance.
- 🟠 **F13 — Prestige silently strips the Rig Bay.** Bought parts reset (only trophies
  persist, `components.ts` carryEarnedComponents). Economically defensible — but the ship
  confirm/explainer never says so, so the first prestige "steals" a system the player just
  invested in, and every gen-2+ opening replays the identical part-shopping sequence with no
  new decisions. The reset is fine; the surprise and the repetition are not.
- 🟡 **F14 — Prestige leaves no trace in the world.** Era palettes shift, but nothing in the
  room ever says "this is my 5th lab." Legacy is a number in a panel; generations have no
  physical memory. (See Feature #6.)

## Day 7 (retention horizon)

- 🔴 **F15 — All progression ladders exhaust** (hard truth #5). Worst offender: the contract
  board ends *forever* — `ContractsPanel` shows "The board's empty — for now"
  (`ContractsPanel.tsx:24-25`), a message that is currently a lie. The Reputation faucet
  permanently dries with it.
- 🔴 **F16 — No notifications, no return hook.** Known gap (blocked on the Capacitor-6
  plugin batch, TASK #17). Until it lands, the only return hooks are the daily boost and the
  player's own memory. For an idle game this is the single largest day-7 lever and it's
  correctly already on the roadmap — flagged here for priority, not novelty.
- 🟠 **F17 — The market has no consequences** (hard truth #4). Rank #1 grants nothing, costs
  nothing to lose, and rivals never *do* anything to you unless an event happens to fire.
- 🟠 **F18 — Power is a tax, not a decision.** Capacity upgrades are Infinity-max; the
  correct play is always "buy more capacity when throttled." The one interesting wrinkle
  (the C4 matched-set −12% draw) is invisible in the room where power visibly matters
  (thermal shimmer). A soft-cap with no trade-offs is bookkeeping.
- 🟠 **F19 — The antagonist is optional content** (hard truth #6). Heat/suspicion/Chen/the
  negotiation — the game's best-written consequence stack — activates only through the
  Bazaar, which the curve never requires. Most players will never see tier-2 scrutiny.
- 🟡 **F20 — The hall is fully invisible to assistive tech** (`aria-hidden`,
  `HallCanvas.tsx:256`). Deliberate and data-duplicated, but as the hall gains interactivity
  (expansions are *only* buyable by tapping the canvas) this tradeoff is drifting toward a
  real exclusion: a VoiceOver player cannot expand their hall at all.

---

# 2 · FEATURE IDEAS — max 10, ranked by impact/effort

*Constraint honored: every idea changes player behavior or decisions, not just numbers.
Effort: S ≈ hours, M ≈ 1–3 days, L ≈ a week+ / owner design call. Curve⚠ = needs `npm run sim`.*

### #1 · Bare Metal — components manifest, and racks look empty without them ⭐ (E: M)
**Pitch:** Once the Rig Bay unlocks, racks render as open frames with visibly *empty
component bays*; each fitted slot class adds real geometry — accelerator = glowing heatsink
fins (color by grade), cooling = coolant lines + actually-spinning per-rack fan, interconnect
= a cable trunk running data pulses to the floor tray.
**Why it changes behavior:** the hall itself nags you to gear up — an unfitted fleet looks
unfinished, so the existing ~6-decision Rig Bay loop becomes self-advertising, and fleet
state becomes readable at a glance (walk into the room, see which tier is under-equipped).
This is the manifestation rule applied to the system that most deserves it, and directly the
owner's ask ("make the server look empty without").
**Builds on:** `tierLoadoutFill`/`componentFill` (already computed per-tier and cached,
`HallCanvas.tsx:138-141`) + `drawRack`'s existing tier/density parameterization. Pure
renderer work; zero engine/curve risk. Grades already carry names/flair to echo visually.

### #2 · Inspector Chen walks the floor (E: S)
**Pitch:** At suspicion tier 2+, a distinct suited figure with a clipboard patrols the hall;
tapping her shows her current scrutiny line (and opens the negotiation when one is live).
**Why it changes behavior:** dark-web buys gain a *standing, visible* cost — she doesn't
leave when the toast does. Players lobby/negotiate to make the person in their lab go away,
which activates the game's best character for everyone who flirts with the Bazaar and makes
heat management a spatial fact instead of a buried meter.
**Builds on:** the staff floor-agent drawing path (`drawStaffAgents`) + `regulator.ts` tiers
+ the existing canvas hit-testing. One agent, one hit area, one line of copy per tier.

### #3 · The loading dock — purchases physically arrive (E: S/M)
**Pitch:** Buys manifest as deliveries: a component purchase wheels a crate to its rack with
an install flash; legit data-market buys stack branded pallets by the wall; dark-web buys
stack *unmarked black crates that linger while Heat is high* and fade as it cools.
**Why it changes behavior:** heat state becomes legible at a glance (a wall of black crates
= you're hot = the "cold trail" made visible), purchases feel physical, and the room's front
strip — currently dead space — becomes a status display the player learns to read. Pairs
with IMPROVEMENTS #10 (cooling parts reduce heat gain) to give cooling a visible story.
**Builds on:** the rack spawn-animation pattern (`hallRenderer.ts:303-306`), heat/suspicion
state already in the store, the open front-floor strip the staff agents already use.

### #4 · Rival skyline (E: M)
**Pitch:** The five rivals appear as datacenter silhouettes on the horizon band of the sky,
height ∝ leaderboard MAU; your own tower rises among them as you climb, and a press blitz
visibly dims the struck rival's lights for its duration.
**Why it changes behavior:** race position becomes ambient — you *see* Cortex-5 looming over
you every session, which drives leaderboard checks and gives the press blitz (currently a
number in a collapsed panel) a visible payoff worth spending on. The market sidecar finally
earns its screen time without touching the curve.
**Builds on:** `market.ts` standings (pure sidecar) + the static sky layer (cache key gains
a coarse "standings signature" so it repaints only on rank/tier changes, not per tick).

### #5 · Incident theater — events manifest as tappable world states (E: M)
**Pitch:** While a world event/product op is active, it exists physically: an outage = one
smoking, flickering rack; a viral moment = a crowd of extra figures pressed against the
front edge; an audit = Chen at the door; a GPU shortage = empty pallet racks. Tapping the
manifestation reopens its card; for timed debuffs, tapping "works the problem" and shaves a
few % off the remaining duration.
**Why it changes behavior:** events stop being modal interruptions you dismiss and become
room states you *notice and touch* — the player scans the hall on every return, and the
shave mechanic gives active players a micro-decision (worth tapping? worth waiting?) without
breaking idle balance (cap the shave, honest and bounded).
**Builds on:** the modifier system (timed mods already in state), `rackHitAreas`, the moment
queue. The shave needs one small engine hook (curve⚠ trivially — cap it at ~10%).

### #6 · The Legacy Wall (E: M)
**Pitch:** Every generation adds a small plinth/hologram of the shipped model along the back
wall — labeled with that run's ship headline, gilded on ascension gens (display caps at the
last ~8; a counter carries the rest).
**Why it changes behavior:** prestige accrues *visible permanence* — the reset stops feeling
purely destructive (F14) and "one more generation" gains a collector's pull. It also makes
the ship-mode choice matter aesthetically (open-source plinths could look distinct), softens
F11, and gives the share card a natural in-world photo subject.
**Builds on:** `stats.ships` + `shipHeadline()` (already pure and history-aware); needs a
tiny persisted per-gen record (headline + mode + era), rendered in the static layer.

### #7 · Staff are people — spatial identity for the roster (E: M)
**Pitch:** Floor agents map 1:1 to actual employees: role-tinted, legendaries sparkle,
tapping one opens their card, and product-assigned staff cluster at the base of that
product's uplink beam.
**Why it changes behavior:** assignment becomes visible org design — drag someone to a
product and watch them *walk over* — which makes the assign/bench decision (currently an
abstract ×2 bonus in a panel) something players do partly to reshape the room. Hiring gets
an extra reward beat: a new person walks in the door.
**Builds on:** `drawStaffAgents` (cap of 14 stays; overflow stays generic), the employees
roster, existing beam positions, canvas hit-testing.

### #8 · Charter set-dressing (E: S)
**Pitch:** The chosen charter hangs as a banner on the back wall (Open-Source Crusade flag,
Cash Machine ticker, Moonshot mission patch…); a conviction streak adds trim per consecutive
run.
**Why it changes behavior:** modest but real — charters gain identity, so the per-run pick
(and the +15% conviction re-pick) becomes an expressive choice players commit to rather than
a stat checkbox. Direct feeder for the IMPROVEMENTS #7 "dynasty" arc if that ships later.
**Builds on:** `charter.ts` (already persisted + locked per run) + one static-layer prop per
charter id. Cheapest idea on this list per unit of world-aliveness.

### #9 · Rotating sponsor contracts — the board never dies (E: M, curve-safe)
**Pitch:** When the 30-rung ladder is exhausted, the board offers one deterministic,
date-seeded "sponsor contract" per day — a metric target scaled off the player's current
stats (e.g. "Peak Compute +40% over your best"), paying escalating Reputation.
**Why it changes behavior:** day-7+ players get a fresh, *finite, daily* objective — a
reason to open the app that isn't a streak, a timer, or a punishment (GDD §6 honest-retention
compliant: miss a day, nothing is lost). Fixes F15's worst case (the permanently-dry Rep
faucet) and gives the goal strip late-game fuel.
**Builds on:** `contracts.ts` board derivation (derived-from-completed[] pattern extends
cleanly), `daily.ts` date-keying, Reputation-only payout (no curve risk by construction).

### #10 · Frontier preprints — research never goes inert (E: L, curve⚠, owner design call)
**Pitch:** Past tree completion, the Frontier category offers repeatable "preprint" nodes —
escalating-cost, small *bounded* per-run multipliers with rotating satirical titles — so the
research panel always holds one more decision.
**Why it changes behavior:** the end-of-run dead zone (research inert after ~20 nodes, F15)
gains a real spend-vs-ship decision: keep buying preprints or bank the run and prestige.
This is the owner's already-flagged "research-tree deepening" call given a concrete,
retune-light shape — repeatables with a hard per-run cap move the curve far less than new
permanent nodes would, but it still needs a full sim pass.
**Builds on:** the research panel/wave-reveal UI, `flavor.ts`-style rotating titles,
`balance.difficulty` knobs for the escalator.

*Deliberately not proposed: anything per-rack (the genre's documented micromanagement
failure, RIG_BAY_PLAN), streaks/FOMO timers (GDD §6), a fourth resource, or new panels —
every idea above pushes existing systems into the world rather than adding surface area.*

---

# 3 · QUICK WINS — top 3 under 2 hours each, by UX impact

### QW1 · Wire real iOS haptics through the existing seam (~1h code)
`haptics.ts` was explicitly built as the swap point for `@capacitor/haptics` and the swap
never happened — so the entire designed haptic layer (tap/success/celebrate/warn, plus TWO
settings rows) does nothing on the platform the game ships to. Add the plugin, branch to it
when native, keep the vibrate fallback for Android web. This is the highest
feedback-per-line change available in the codebase. (Device verification rides the next
TestFlight build, as with every native change.)

### QW2 · Un-freeze the cooling fans (~1h)
Move fan-blade drawing from the cached static layer into `drawHallDynamic` (housings stay
static; blades redraw per frame, reduced-motion keeps them still). The room's one promised
piece of machine motion currently renders as a still image with a code comment apologizing
for it (`hallRenderer.ts:235`). Cheap, and it makes cooling purchases visibly *do* something
— a down payment on Feature #1.

### QW3 · Make the open-source ship mode confess before it fires (~1h)
Route `open_source` through the existing `ConfirmSheet` with one explicit line — "You're
giving the model away: you will start the next generation with **no product draft**. You
gain +30% Legacy, +5 Reputation, and launch momentum." — and, post-ship, point the
Celebration's onDone at the Lab (not Products) for draftless modes. The scariest button in
the game currently lets its most thematically attractive option quietly discard the main
post-ship reward behind a 4-word tag (F11). One sheet, zero engine change.

*Runners-up (each <1h, batch as a copy/consistency sweep): fix the onboarding "tab badges"
promise (F2); make the Awards badge count unseen unlocks instead of lifetime total (F9);
gate the Celebration/EraTransition CSS confetti on reducedMotion and seed the setting's
default from `prefers-reduced-motion` (F5).*

---

## Suggested sequencing (impact/effort, cross-referencing the existing backlog)

1. **Quick wins QW1–QW3** + the runner-up copy sweep — one session, all verifiable in a
   browser drive except QW1's device check.
2. **Feature #1 (Bare Metal)** — the owner-directed centerpiece; renderer-only, curve-free.
3. **Features #2 + #3 + #8** — the small world-aliveness batch (Chen, deliveries, banners);
   each S/S-M and independently shippable.
4. **Feature #9 (sponsor contracts)** — the strongest pure day-7 lever that needs no plugin;
   pairs naturally with the already-planned local-notification work (TASK #17) when the
   Capacitor batch happens.
5. **Features #4–#7** as the second world wave, ordered by taste (skyline first — it
   activates an existing dormant system for free).
6. **Feature #10** last — it's the owner's standing research-deepening design call and the
   only L on the list; do it against real TestFlight telemetry (R8.1 read), with a full sim
   pass.
