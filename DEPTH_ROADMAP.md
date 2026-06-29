# Singularity Inc. — Depth & Context-Richness Roadmap
*Synthesized 2026-06-29 from four parallel system audits (economy/progression · products/staff ·
narrative/satire · hall/UI/feel). Owner-requested: "where can we add depth & make the game more
context-rich." Source of truth for WHAT the game is: the GDD. Every item below obeys the spine:
3 in-run resources, pure deterministic engine, data-in-`balance/`, hard-gated compounding (sim
stays 12m15s), humor in writing, no image assets, no dark patterns, meta-currencies ≠ 4th resource.*

---

## The one-line diagnosis
The game is mechanically deep and well-tuned, but it is **strong on the moment, weak on memory, and
siloed across systems.** The highest-leverage depth gap is not *more systems* — it's **connective
tissue**: a world that *remembers*, systems that *ripple* into each other, and decisions that *show
up in the room*. All four audits converged on this independently.

## Four convergent themes (each flagged by ≥2 audits)
| # | Theme | What's missing | Audits |
|---|-------|----------------|--------|
| **T1** | **Living world / persistence** | Rivals are static scalars; events are one-shot rolls with no memory; flavor never reflects the player's actual history. No NPCs, no callbacks, no "the market knows you." | Narrative #1, Business #1 |
| **T2** | **Cross-system resonance** | Staff ↔ products, alignment ↔ prestige ↔ charter, reputation → mechanics are all siloed. Choices don't compound or echo. | Economy #1, Business #3–4 |
| **T3** | **Late-game stakes & build identity** | Heat goes trivial; alignment/charter are flat lane-tilts, not strategy; "set-and-forget" products; runs are mechanically identical. | Economy, Business |
| **T4** | **Manifestation & legibility** | Staff, products, power/heat, alignment produce NO change in the hall; the hall plateaus after Era 3; new depth isn't surfaced in the UI. | Hall/UI (all) |

---

## The waves (sequenced by leverage × risk)

### Wave A — "The Living Market" *(T1 · pure engine · curve-safe · highest context-richness · no on-device need)*
The connective tissue every audit asked for. Mostly data + pure folds + tests — zero renderer risk.
- **A1 · Persistent, reactive rivals.** Today rivals (`market.ts`) are a static weighted pool. Give each
  a persisted identity: a **focus** (compute/safety/money), an **alignment**, a **ships-this-cycle**
  count, and a live **market position**. Rivals "ship" on frontier drift; their event flavor reads from
  their *current* state ("ClosedAI is unstoppable — 5 ships this run" vs "Anthropos is losing ground to
  you"). Curve-safe: rivals only touch the leaderboard sidecar, never the 3 resources, and don't exist
  pre-first-ship. *(M)*
- **A2 · Event memory / "hot topics" chaining.** A rolling `recentEventIds` window biases the next
  world-event roll toward *related* events for a short window, so crises cluster and feel causal instead
  of random. No new resource, no persistence beyond a small ring. *(S)*
- **A3 · History-aware headlines.** Expand the Ship-celebration + era-transition copy from a few static
  strings to a pool *selected by what the player actually did* (peak compute, rivals beaten, alignment,
  era, ships). Same dopamine beat, personalized. *(S)*
- **A4 · Codex that evolves with tenure + alignment.** Re-read select entries by ship count / alignment
  so the lore matures with the player (doomer vs accel see different text; "The Closet Years" re-reads
  on your 5th ship). Pure conditional strings. *(S)*
- **A5 · A "this run's story" recap** on the Generation Report (auto-generated 3-line narrative from run
  stats). *(S)*

### Wave B — "Resonance" *(T2/T3 · engine · curve-safe via hard-gating)*
Turn flat dials into compounding strategy. Each item is identity at neutral/first-run → sim 12m15s.
- **B1 · Alignment & charter become strategy, not flavor.** Alignment-gated research/prestige (doomer
  ships cheaper on Legacy, accel sell-to-hyperscaler cheaper; alignment-locked nodes); charter→prestige
  payoffs (commit to a charter twice → bonus weights; charter×ship-mode synergies). *(M)*
- **B2 · Staff morale meter + burnout + role-gated unlocks.** A visible 0–100 morale resource (decays;
  Mentor/perks restore); under/over-staffing consequences tied to product workload; specific roles
  *unlock* mechanics (PR&Legal→Enterprise, Recruiter→talent pools, Growth→a marketing channel). *(M)*
- **B3 · Heat escalation & a regulator with memory.** A persisted "suspicion" score + named regulator;
  repeated shady buys escalate to forced choices at high heat in accel runs; doomer stays clean. Makes
  Heat a real late-game pressure instead of a trivial number. *(M)*
- **B4 · Staff ↔ product synergy + anti-degenerate floors.** Role×product-type output matrix; a churn
  floor / lifecycle decay so "set-and-forget" isn't dominant; product cannibalization vs cross-segment
  TAM expansion. *(M)*

### Wave C — "Manifestation & legibility" *(T4 · renderer + UI · the hall/UI audit · some needs on-device)*
Make the new depth *visible*. Split into cheap legibility wins (ship now) and richer renderer work.
- **C1 · Cheap legibility wins (no renderer risk):** alignment **spectrum bar** in the header; a
  **prestige-ready** pulsing badge; a hall/dock **status ticker** (active research ETA, modifiers,
  contract deadlines); **portfolio-health** sort in the Products tab; charter/contract reminder chips.
  *(S each)*
- **C2 · Manifestation (renderer; on-device verify):** **staff as floor agents**; **product uplink
  beams**; **power/heat shimmer + uncapped cooling**; **alignment tint**; **per-era structural growth**
  (multi-room → campus → Post-Singularity transformation) so the hall keeps evolving late-game. *(M–L)*

---

## If you only do three things (the critical path)
1. **Wave A core (A1 + A2 + A3)** — persistent reactive rivals + event memory + history-aware headlines.
   *The connective tissue every audit ranked #1; pure, testable, maximal context-richness, zero curve/render risk.*
2. **Wave B core (B1 + B2)** — alignment/charter as real strategy + the staff morale meter.
   *Turns the game's flattest "flavor" dials into compounding decisions.*
3. **Wave C1** — the cheap legibility wins (alignment bar, prestige badge, status ticker, portfolio health).
   *Surface all the new depth without touching the renderer.*

Then Wave C2 (hall manifestation) as a dedicated pass with on-device verification before a TestFlight push.

## Guardrails recap (per-item, non-negotiable)
- No 4th resource (morale/suspicion/reputation are meters/meta, not spendable in-run resources).
- Engine pure & deterministic; rivals/NPC/event-memory state lives in `GameState` behind save migrations.
- Every compounding term hard-gated → `npm run sim` stays **12m15s** (re-run after any economy item).
- Rivals/products are post-first-ship, so the tuned first-prestige run never sees them.
- Renderer work (C2) is additive, reduced-motion-aware, identity-by-default, and on-device-verified.
