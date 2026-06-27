# Singularity Inc. — Improvements & "What's Missing" Roadmap
*Grounded in the GDD + current code (as of the UI-revamp branch). Organized into phases → steps with priority (P0 = ship-blocker … P3 = nice-to-have) and rough effort (S ≤½ day · M ~1–2 days · L ~3+ days).*

> **Guardrails that constrain every item below (from CLAUDE.md / GDD — do not violate):**
> 1. Three in-run resources only (Compute/Data/Money). Legacy & Reputation are meta, not a 4th resource.
> 2. Engine stays pure/deterministic; tunables live in `src/engine/balance/`; add tests.
> 3. Every compounding term hard-gated so the tuned early/mid curve stays byte-identical (`npm run sim`).
> 4. Humor in writing, not math. No dark patterns. No image assets (parametric only). Cosmetic-only IAP.

---

## Snapshot — what already exists (so we don't re-build it)
Eras 0–6 + AGI ascension · research tree · "Ship the Model" prestige (Legacy Weights) · Lab Reputation perk tree · 37 achievements · lifetime stats · Products business (types, pricing tiers, marketing channels, per-product features, timed version upgrades, ops events) · individual employees (roles, traits, training, assignment, morale, office perks) · power/heat · data market · world events + alignment (doomer↔accelerationist) · offline/"while away" modal · onboarding · settings (sound/haptics/reduced-motion) · synthesized SFX · haptics · particle/floater juice · parametric 2.5D hall canvas · premium IAP scaffolding.

---

## Phase A — Ship readiness (P0/P1, do before the next TestFlight push)
*Goal: the things a first-time player will notice are missing or rough. Highest ROI.*

- **A1 · Ship-the-Model flavored choice** ✅ *(done)* — three ship modes at the prestige moment: **Deploy** (balanced default — full Legacy + product draft, byte-identical to the old behavior so the sim/curve are untouched), **Open-source** (×1.3 Legacy, no draft), **Sell** (×0.5 Legacy + a bounded cash kickstart into the next run, no draft). Data in `balance.prestige.shipModes`, pure fold in `prestige.ts`, `deploy` is the default arg so `npm run sim` stays 12m15s/1m05s. 3 new tests.
- **A2 · Audio: ambient bed + era stingers** ✅ *(done)* — synthesized ambient pad (warm drone of open fifths through a slow-breathing low-pass LFO; pure Web Audio, no assets, very low gain) that starts on first gesture and pauses while the tab is hidden; a swelling **era stinger** on every era transition. New **Music** setting (separate from SFX so each is opt-out), wired through `SettingsSheet`. All synthesis respects autoplay policy + the toggle.
- **A3 · First-session hook polish** ✅ *(done)* — the advisor now hand-holds the core loop before the first Ship (claim → start a run → research → ship tease), gated on `ships === 0` so it never nags a returning player; the 💡 nudge fires from the very first second. Onboarding ends with a concrete first goal ("Start a training run →"). Curve untouched (advisor is UI-only; sim still 12m15s). +2 tests.
- **A4 · "Manifestation rule" audit** ✅ *(done)* — audit: the hall already manifests racks (3 tiers), floor expansions, run activity, and era re-skins. **Gap found & filled:** power/cooling gear (PSU Bay · Liquid Cooling Loop · Substation) changed a number but not the room — now each purchase adds a wall-mounted cooling fan (capped at 3/wall so a huge facility still reads clean), exactly the GDD §5 "upgrade cooling, fans spin" example. Software multipliers (overclock/monetize/auto-*) are intentionally non-physical. *Remaining (optional, P3): manifest data scrapers (web_scraper/botnet) as props.* +1 test.
- **A5 · Settings: save export/import** ✅ *(done)* — a collapsible "Back up & restore" section in Settings: Export copies a base64 backup of the save to the clipboard (and shows it for manual copy); Restore accepts base64 *or* raw JSON, validates via `deserialize` (migrates + sanitizes), and reloads. Guarded by a confirm. Local-only, no backend. Reset already had a confirm.
- **A6 · Empty/locked-state clarity** *(P2, S)* — every tab before it unlocks should say *why* it's locked and what unlocks it (some already do; make it uniform). Reduces "is this broken?" confusion.

## Phase B — Content & replayability depth (P2, post-launch, data-driven)
*Goal: more reasons to keep playing and to start a new run. The GDD says expand in waves, not dumps.*

- **B1 · More world events + faction arcs** 🟡 *(content done)* — +12 events (9 ambient good/bad + 3 new faction choices: defense contract, EU AI Act, capability-eval publish) in the satire voice; pure data, curve-safe (events are RNG-fired in the store, not the sim — still 12m15s). *Remaining (optional): an alignment-threshold arc with milestone payoffs/penalties.*
- **B2 · Research-tree breadth for late eras** ✅ *(done)* — +6 late nodes (Synthetic Data, Flash Attention, 4-bit Quantization, Multi-Datacenter, World Model, Recursive Self-Improvement) chained **behind Scaling Laws**, so they're only reachable deep in a run. Reuses existing effect kinds (no new mechanics — kept simple). Early/mid curve untouched: **sim byte-identical (12m15s / Gen2 1m03s / Gen3 0m59s)**.
- **B3 · More product types & per-product features** ✅ *(done)* — +2 product types gated by ship count for replayability (**AI Companion**, consumer/viral, unlock @2; **Science Co-Pilot**, premium/sticky/Heat, unlock @5) and +4 features (Fine-Tuning Studio·arpu, On-Device Mode·serveCost, Community Forum·churn, Localization·acq). Pure data; sim byte-identical (12m15s).
- **B4 · Employee depth: synergies & rare hires** 🟡 *(rare hires done)* — ~12% of recruits roll **Legendary**: already trained (higher start level) with a guaranteed elite trait (10×/Workaholic/Mentor), same signing bonus — a satisfying re-roll chase. Gold-bordered card + ✦ badge + level pips. Recruiting is opt-in and doesn't touch the lab curve (sim 12m15s). *Remaining (optional): cross-role team synergies.*
- **B5 · Prestige challenge** ✅ *(done, simple)* — kept it clean: instead of a separate challenge system/screen, an optional **"⚔️ Hard ship"** card in the *existing* Ship chooser — rivals leap the frontier (your carried products start behind) for **+50% Legacy**. Unlocks at 3 ships, so new players never see clutter. Default deploy path unchanged → sim byte-identical (12m15s). +1 test (249).
- **B6 · Daily honest re-engagement** ✅ *(done)* — a once-a-day **Daily Boost**: claim a short global +50%/3-min output buff (via the normal temporary-modifier system, so it never inflates the permanent curve). Honest per GDD §6 — no countdown, no penalty for missing; just available again next day. Day tracked in a UI-only localStorage key (no save migration). Banner on the stage; +1 test (248).

## Phase C — Spectacle & game-feel (P2/P3)
*Goal: the tentpole "wow" moments and overall smoothness.*

- **C1 · Era-transition & AGI set-pieces** *(P2, M)* — make each era change a bigger full-screen beat (hall reskin reveal + press-release card + stinger). These double as App Store screenshots (GDD §8).
- **C2 · Hall visual richness** *(P2, L)* — more parametric variety per era (lighting, props, density), subtle idle animation, "1000 GPUs = one upgraded visual" scaling. Draw-call disciplined.
- **C3 · Number-pop & milestone juice pass 2** *(P3, S)* — round out any actions still lacking a pop/sound/particle; celebrate achievement unlocks and big round-number milestones more.
- **C4 · Reduced-motion parity** *(P3, S)* — ensure every new effect has a calm fallback (accessibility + battery).

## Phase D — Monetization & store (P1/P2, before/with launch)
- **D1 · Cosmetic hall themes** ✅ *(done)* — 5 parametric hall themes (Classic, Neon, Sunset, Blueprint, Founder Gold) as CSS filters on the hall canvas — no assets, no gameplay effect. Picker in Settings; choice stored in the settings localStorage (no save migration). **Founder Gold is gated behind Premium** (delivers part of D2). Cosmetic-only, never power (GDD §7).
- **D2 · Premium unlock content bundle** *(P1, S)* — make sure the premium entitlement actually grants its promised QoL/cosmetic bundle (faster offline cap, founder skin, themes) so the IAP delivers.
- **D3 · Store screenshot kit** *(P2, S)* — capture the era-transition beats as marketing screenshots (falls out of C1).

## Phase E — Balance & telemetry (P2, ongoing)
- **E1 · Late-game pacing sim** *(P2, M)* — extend `npm run sim` past first prestige to model mid/late curve (it currently validates early). Catch endgame stalls/runaways.
- **E2 · Local, privacy-safe analytics hooks** *(P3, M)* — optional opt-in counters (time-to-first-prestige, wall points) to tune balance from real play. No PII, no backend required for v1.
- **E3 · Difficulty/QoL tuning from retention data** *(P2, ongoing)* — adjust early walls and offline cap once real numbers arrive.

## Phase F — Platform & LiveOps (P3, only if Phases A–D earn it; GDD Phase 4)
- **F1 · Cloud save (opt-in)** *(P3, L)* — the one place a backend is justified; keep it optional.
- **F2 · Android build** *(P3, M)* — Capacitor already targets it; second platform after iOS proves out.
- **F3 · Steam/desktop port eval** *(P3, L)* — the pure engine makes this feasible later (GDD §10 reuse thesis).

---

## Cross-cutting polish backlog (small, do opportunistically)
- Uniform modal sheet style (some modals still use the old glass `.modal`; align to the new light-sheet system for full consistency).
- Transient popups (offline, era, world-event, onboarding) → same solid-sheet treatment as the redesign.
- Drag-and-drop affordance copy on Employees (make "drop here" zones even clearer).
- Tab-switch transition smoothing; consistent active-state across all nav levels.
- Copy pass for any remaining jargon (keep it plain for new players).

---

## Suggested order (if you want a single thread)
**A1 → A2 → A3 → A4 → A5** (ship-readiness) → **D2 → D1** (monetization delivers) → **C1** (spectacle + screenshots) → ship a TestFlight build → gather data → **E1/E3**, then **B-series** content waves → **F-series** only if retention justifies it.
