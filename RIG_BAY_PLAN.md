# Rig Bay — rack components, store & inventory (plan)
*Owner ask (2026-07-02): "can I choose what components I want to put in the racks, like GPUs and
everything else? … make a store for it and an inventory … a complete plan." Research first, then
verdict, then the phased plan. Phase C1 ships with this plan.*

## Research summary (full sources in session log)
- **Per-unit component choice is the genre's documented failure mode** ("multiplicative
  micromanagement"): unit counts grow exponentially in idle games, so per-rack slots turn every new
  tier into an O(n) re-fit chore. NGU Idle / Melvor only survive deep gear because they're
  one-character games — and both still needed loadout-preset systems to stay playable.
- **Egg Inc is the mobile gold standard**: hundreds of collectible artifacts, but only ~4 active
  slots. Decision surface stays thumb-sized; collection depth lives elsewhere.
- **PC Building Simulator works because each part teaches one legible tradeoff** (thermals, watts)
  — and its #1 player complaint is parts you can see but can't change. Every slot must be freely
  re-fittable, every part one readable stat.
- **Software Inc / Startup Company model servers as capacity, not internals** — tycoon depth comes
  from what runs where, not from screwing in DIMMs.
- **Honest acquisition**: fixed, fully-visible catalog (no rotation, no odds), deterministic drops
  (specific named parts from specific milestones), rarity = magnitude + visual flair (a common is
  never dead weight). This is also exactly our no-dark-patterns rule.

## Verdict: YES — as per-TYPE loadouts, not per-rack
The fantasy the owner wants ("I choose the GPUs in my racks") is real and fits the design spine
(hall visibly manifests choices; three resources; legibility). The trap is per-rack management.
The shape that keeps the fantasy and dodges the trap:

> **Each rack TIER has a loadout (1–3 class-typed slots). A slotted component applies to ALL racks
> of that tier.** Buying one better GPU line and watching 40 racks improve is the idle dopamine —
> the choice multiplies with growth instead of costing more.

Hard rules carried over: components cost **Money only** (no 4th resource); the catalog is **fixed
and fully visible** (price/milestone-gated, never rotated or randomized); each part has **exactly
one stat**; slots are freely re-fittable; engine stays pure; all effects sim-verified.

## System design (C1 — shipped with this plan)
- **Slots by tier** — Consumer rack: `[accelerator]` · Server rack: `[accelerator, cooling]` ·
  TPU pod: `[accelerator, cooling, interconnect]`. Max 6 decisions ever; depth reveals in waves.
- **Classes / stats (one stat each)**
  - **Accelerator** → +X% Compute from racks of that tier.
  - **Cooling** → −X% power draw for that tier (more headroom before the throttle).
  - **Interconnect** → +flat Data/sec per rack of that tier (scales with the fleet).
- **Store + inventory in one surface ("Rig Bay" panel, Build section):** tap a slot → a chooser
  sheet lists every catalog part of that class — owned parts equip instantly, unowned show their
  price and buy-and-equip in one tap. Owned copies are physical: one copy fills one slot; buy a
  second to run the same part in another tier. Unequip/swap free, parts are never destroyed.
- **Reveal**: the Rig Bay appears at 3 racks owned (~2 minutes in — this is the new
  "more in the beginning" decision layer); deeper parts reveal by fleet size.
- **Rarity** = tier chip (standard / enterprise / prototype) — bigger number + shinier chip, no
  function gating.
- **Hall manifestation**: tiers with filled slots render subtly brighter/denser LEDs (parametric
  HSL nudge composed with the existing rack-skin tint — no image assets).
- **Sim**: the balance sim buys/equips components greedily like a player; curve re-tuned to hold
  the owner band (first prestige ≈ 59–65m) with the wall staying ≈ 1m.

## Phases
- **C1 — SHIPPED**: engine module + balance catalog, inventory/loadout state + save v17 migration,
  Rig Bay panel (slot-first chooser UX), derive/power wiring, hall accent, sim strategy step,
  tests, curve re-validation.
- **C2 — SHIPPED (trophy hardware)**: 4 named parts granted by specific milestones (first ship →
  Founders' Edition Card · 1M compute/s achievement → Binned Golden Sample · megacluster contract →
  Conference Swag Switch · first ascension → Cryo Loop Mk III). Locked trophies are VISIBLE in the
  chooser as deterministic "earn it" chase targets. Granted idempotently in tick from persistent
  sources; trophies SURVIVE prestige (carryEarnedComponents) — bought parts still reset. One-time
  toast per trophy via the data-driven transition-toast list.
- **C3 — SHIPPED (fusion)**: 3 free copies of a part fuse into one of the next rung up its class
  ladder (`fusesInto`, ladder-guard tested). Slotted copies are never consumed; trophies never
  fuse away. The fuse affordance lives inline in the chooser under the owned part. Catalog deepened
  11 → 15 purchasable (+ 4 trophies = 19 total), with late-game rungs (Dyson-Adjacent Cluster,
  Zero-Kelvin-ish Chamber, Orbital Laser Mesh) and a collection counter in the panel head.
  Curve after C2+C3 (sim buys parts AND fits trophies): **first prestige 60m59s / 62m17s ·
  wall 1m06s** (`upgradeCostMult` 4.2).
- **C4 — SHIPPED (matched rig)**: a tier whose every slot (2+) holds parts of ONE grade gets
  **−12% power draw** ("the parts hum in harmony") with a MATCHED pill on the tier head. Design
  note: the first cut (+6% compute) compounded through the income loop and moved first prestige
  ~10 MINUTES (sim-caught) — set bonuses in idle games must be efficiency/QoL, never income.
  Single-slot tiers can't match (one part isn't a set). Curve after C4: 57m59s/62m17s, wall 1m05s.

## Explicitly rejected
- Per-rack slots (micromanagement failure mode), rotating/limited store stock (time dark pattern),
  loot boxes/random drops (odds dark pattern + App Store risk), component durability/repair
  (chore, punishes idling), a new currency (breaks the 3-resource spine).
