# PHASE2_PLAN.md — Singularity Inc. Depth Wave

*The detailed build plan for Phase 2. Built on `GAMEPLAN.md §5` and the GDD. Read
`CLAUDE.md` → `TASK.md` → `GAMEPLAN.md` → this before starting Phase 2 work.*

> **Gate (do not skip):** Phase 2 begins only once Phase 1 is **live on TestFlight
> and retention data is flowing** (GAMEPLAN §4 exit gate). Depth is added to a
> *proven* base, never breadth to an unproven one. Each system below ships behind
> a `balance.<system>.enabled` flag (default **false**) so it can be merged,
> tested, and dark-launched without destabilizing the live game, then turned on
> per-system once balanced.

The owner has flagged interest in **all four** systems. Recommended build order
(each is a milestone with a playable build, mirroring GAMEPLAN's M-ordering):

1. **Power & Heat** (P2-A) — the foundational systems-depth layer; a soft cap.
2. **Staff** (P2-B) — an assignment/payroll layer that interacts with power.
3. **Eras 4–5 + multi-room hall** (P2-C) — new content + the hall's next visual leap.
4. **Factions + full event engine** (P2-D) — the meta/narrative depth layer.

The hard rules still bind every system: **three resources only** (Compute / Data /
Money — power/heat are *derived constraints*, not a 4th currency), engine stays
pure & deterministic & tested, humor in writing not math, no dark patterns.

---

## P2-A — Power & Heat (the soft cap you engineer around) — ✅ DONE & LIVE

> Shipped: pure `power.ts` (draw/capacity/thermalFactor), wired into `derive()`,
> `balance.power.enabled = true`, three capacity upgrades (PSU Bay / Liquid
> Cooling Loop / On-Site Substation), a Power meter in the Hardware panel
> (revealed once the lab draws power, red "⚡ throttled −X%" warning), and a
> power-aware balance sim. Sim: first ship 12m48s, longest wall 1m05s, no wall.
> 6 power tests. Power-capacity upgrades currently raise a flat budget; future
> polish can tie cooling to the hall's animated cooling units.


**Design intent (GDD §2.2):** racks draw power and emit heat; you buy power +
cooling capacity to keep them running at full tilt. Over-subscribe and compute
*throttles* — a soft cap that rewards engineering, never a hard wall.

**Why it's NOT a 4th resource:** power/heat are *derived* from your hardware each
tick (like income), shown as meters, not stored/spent counters. Legibility intact.

### Engine (pure, tested)
- `src/engine/power.ts` (started this session, flagged off):
  - `powerStats(game) → { drawKw, capacityKw, thermalFactor }`.
  - `drawKw` = Σ rackCount(tier) × `drawPerRackKw[tier]`.
  - `capacityKw` = `baseCapacityKw` + Σ power/cooling upgrade levels × perLevel.
  - `thermalFactor` = `draw ≤ capacity ? 1 : max(throttleFloor, capacity/draw)`.
- `derive()`: when `balance.power.enabled`, multiply `computePerSec` by
  `thermalFactor`. (Already wired this session, dormant.)
- Balance data: `balance.power = { enabled, baseCapacityKw, drawPerRackKw[3],
  throttleFloor }` + new upgrades (PSU, cooling loop, substation) raising capacity.

### UI
- A **Power meter** under the hall (draw / capacity, color tiers like the heat bar),
  turning amber→red as you approach throttle. A "⚡ throttled −X%" chip when over.
- New "Power & Cooling" upgrade group (or a hall-side affordance like expansions).
- Hall manifestation: cooling units already exist in the renderer (era ≥ 1) — make
  their count/spin scale with cooling capacity; add a heat shimmer when throttling.

### Balance
- Tune so each rack tier's draw makes power upgrades a *recurring* decision, not a
  one-time buy. Sim target: power never causes a dead wall; throttle is a nudge to
  buy capacity, recoverable within ~1–2 purchases. Add a `--power` sim scenario.

### Tests
- `powerStats` math; `thermalFactor` clamping; derive applies it only when enabled;
  flag-off path is byte-identical to today (guard against regressions).

**Done when:** flag-on, a full era arc stays fun with power as a live constraint,
sim shows no wall, and the meter reads clean. ~1 milestone.

---

## P2-B — Staff (researchers / engineers / ops) — ✅ DONE & LIVE

> Shipped: `balance.staff` (Researcher +8% Data, Engineer +6% Compute, Ops Lead
> +8% Money; each with a hire-cost curve + Money/sec payroll). Counts live in the
> shared `upgrades` map (NO save migration); derive() folds multipliers into the
> existing lanes and sums payroll; tick() drains payroll from Money (floored at 0,
> never touches lifetimeMoney). `hireStaff`/`canHireStaff` actions + store wiring +
> a Staff & Payroll panel (revealed after first research; headline is live
> payroll). Prestige resets staff via createInitialState. Opt-in depth — sim still
> first-ships 12m48s (no wall). 5 staff tests (108 total).


**Design intent:** hireable specialists you assign to roles; payroll is an ongoing
Money sink that deepens the economy and interacts with the other systems.

### Engine
- `src/engine/staff.ts`: roles = `researcher` (×research speed / data yield),
  `engineer` (×compute or ×power efficiency — ties into P2-A), `ops` (×money /
  auto-claim quality). Each hire has a level/cost curve in balance.
- Payroll: a per-second Money cost folded into the tick (can push net income
  negative if over-hired → a real decision). Deterministic.
- `derive()`: staff multipliers fold into the existing mult lanes (no new lanes).
- Balance: `balance.staff = { enabled, roles[], hireCost curve, payrollPerLevel }`.

### UI
- A **Staff panel** (revealed in a wave, like research): hire buttons, assigned
  counts, live payroll, net-income readout. Clean: one number tells you if you're
  over-hired.
- Optional hall manifestation: tiny figures / desks as headcount grows (cheap
  parametric sprites — keep the draw-call budget; abstract at scale per LEARNINGS).

### Balance & tests
- Payroll must create a *tension* (hire for growth vs. bleed cash), never a trap
  you can't recover from. Sim `--staff` scenario; first hire affordable early.
- Tests: payroll deducts in tick; multipliers apply; net-income sign is correct.

**Done when:** hiring/assigning is a meaningful recurring decision, payroll tension
is real but fair (sim-verified), panel is legible. ~1 milestone.

---

## P2-C — Eras 4–5 + multi-room hall — ✅ DONE & LIVE

> Shipped: eras 4–5 — **Frontier Lab** (teal) + **Hyperscaler** (royal indigo) —
> as data + renderer palettes (`ERA_BG`/`ERA_FLOOR` indices 3–4) + satirical
> press-release blurbs. `currentEra` generalized: eras 3–4 gate on ship count
> (`frontierAtShips: 2`, `hyperscalerAtShips: 5`); eras 0–2 logic unchanged. The
> tentpole era-transition moment fires for them automatically. 1 new era test
> (109 total). Verified both reskins on screenshot.
>
> Multi-room hall ✅: a pure-renderer approach (no engine/capacity/save change).
> `hallRoomSplit`/`hallRooms` derive split lines at the floor midpoint once
> expanded; the renderer draws glowing glass partition walls there and leaves the
> split column/row as a lit walkway (skips those rack tiles) so the floor reads as
> 1 → 2 → 4 rooms. Room count shows in the hall tag ("N rooms"). Base floor is
> visually unchanged. 1 room test (115 total); both 2- and 4-room layouts verified
> on screenshot.


**Design intent (GDD §3):** Frontier Lab → Hyperscaler. The hall's next visual
leap: more than one room as you outgrow the floor.

### Engine
- Extend `balance.eras.list` to 5 + new thresholds; `eras.ts` gating already
  data-driven, so mostly data + a couple of gates.
- New research tier(s) unlocking eras 4–5 capabilities; reveal in waves.
- Multi-room: generalize `hallDims`/`hallModel` to N rooms (an array of floors),
  or a "wing" concept — racks overflow into a new room past a size threshold.

### Renderer
- `ERA_BG`/`ERA_FLOOR` palettes for eras 3–4 (index 3,4). New per-era props
  (bigger cooling plants, server aisles). Multi-room layout + camera framing that
  keeps it readable on a phone (the hard part — prototype framing first).
- New era-transition press releases (satirical voice) for eras 4–5.

### Balance & tests
- Extend the floor-capacity curve for the larger eras; ensure `maxDrawnRacks`
  scales or rooms share the cap sensibly. Sim runs to era 5 with no wall.
- Tests: era gating at the new thresholds; multi-room capacity math; hallModel
  tier mix across rooms.

**Done when:** reaching era 4–5 feels like a tentpole, the multi-room hall reads
cleanly on a phone, transitions land. ~1–2 milestones (renderer-heavy).

---

## P2-D — Factions + full event engine — ✅ DONE & LIVE

> Shipped: a persisted `alignment` scalar (−1 doomer … +1 accel; save v3→v4
> migration). World events extended with optional two-`choices` branches — the
> engine defers their effect until the player picks (`applyWorldEventChoice`),
> which applies that branch's effect AND shifts alignment (clamped). 5 faction
> events written in voice; WorldEventCard renders the two branches (and blocks
> backdrop-dismiss so a choice is required); alignment shown in Lab Stats. 4
> faction tests + a save-migration test (114 total). Sim unchanged. Future:
> gate some unlocks on alignment + more events (data-only).


**Design intent:** doomers vs accelerationists — a reputation axis that colors
events and unlocks; deepen the existing lightweight event engine.

### Engine
- `src/engine/factions.ts`: a single `alignment` scalar (−1 doomer … +1 accel)
  nudged by player choices in events. NOT a new resource — a stance meter.
- Extend the world-event system: events can present a **choice** (two buttons)
  with diverging effects + alignment shifts; some events/unlocks gate on alignment.
- Keep it data-driven so writing stays editable (the event list is already data).

### UI
- Event cards gain an optional **two-choice** layout (the engine already shows a
  card; add a B option). A subtle alignment indicator somewhere unobtrusive.
- ~20–30 more events in the satirical voice, some faction-flavored.

### Balance & tests
- Neither alignment extreme should dominate; both offer trade-offs. Choices are
  flavor + minor mechanical swings, not build-defining (legibility).
- Tests: choice application is deterministic (rolls passed in, per LEARNINGS);
  alignment clamps; gated content respects alignment.

**Done when:** events feel reactive and the satire layer has real personality;
choices matter a little, never overwhelm. ~1 milestone.

---

## Cross-cutting for Phase 2
- **Save migration:** every system adds state → bump the save version and add a
  migration (the pattern exists from day one; honor it). Default new fields so old
  saves load cleanly.
- **Feature flags:** ship each system behind `balance.<system>.enabled = false`;
  flip on per-system once balanced. Lets us merge continuously without risking the
  live build.
- **Balance sim:** add a scenario per system; never tune by hand (GAMEPLAN §9).
- **Cosmetic IAP store** (GAMEPLAN §5): themes / rack skins / lab name — *after*
  the systems land and only if retention justifies it. Never power.
- **Each addition needs a retention/engagement justification**, not "it'd be cool."

---

## Phase 3 / 4 (parked — for reference)
- **Phase 3:** Era 6 / Post-Singularity, the "AGI" prestige-gated spectacle, deep
  meta (lab reputation), achievements, leaderboards.
- **Phase 4:** Steam port via Electron wrap — gated behind mobile success.
