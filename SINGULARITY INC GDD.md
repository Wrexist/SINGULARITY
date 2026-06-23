# SINGULARITY INC. — Game Design & Production Bible
*Working title. An AI compute tycoon with a 2.5D data-center hall, a legible economy, a prestige loop, and a satirical voice.*

**Owner:** Isac (Wrexist) · **Engine reuse base:** Silicon Tech Tycoon (React 18 / TS / Vite / Zustand / Capacitor)
**Document status:** v0.1 — design spine locked, scope phased. This is a living doc; treat like CLAUDE.md/TASK.md handoff discipline.

---

## 0. The one-sentence pitch
You run an AI lab from a single rented server closet to a planet-scale compute cluster — buy and place GPU racks in a 2.5D hall that visibly fills and lights up as you scale, balance three resources (Compute, Data, Money), climb a research tree of increasingly absurd AI capabilities, and periodically "ship a model" to prestige-reset for permanent multipliers.

## 0.1 Design spine (the non-negotiable core — everything serves these five)
1. **A clean 2.5D data-center hall that grows visibly as you scale compute.** The world earns its screen space by being where upgrades *physically manifest*. (This is the Silicon lesson: parametric rendering is only worth it if the thing you render is the thing you buy.)
2. **A legible 3-resource economy:** Compute, Data, Money. Three, not seven. Legibility is the feature.
3. **An AI-research tech tree** as the spine of progression — the "lots to do" lives here, revealed slowly, not dumped at launch.
4. **A "ship a model / get acquired" prestige reset** — the load-bearing retention mechanic the genre data is unambiguous about.
5. **Satirical event-writing as the personality layer** — humor in the *writing*, clarity in the *systems*. This resolves the funny-vs-clean tension: they live in different layers.

> **Anti-goal:** "lots of things to do" interpreted as breadth. The retention research is clear — legible systems with paced unlocks beat broad systems that overwhelm. Depth reveals over time; the surface stays clean.

---

## 1. Why this design, grounded in genre evidence
- **Prestige is the retention engine, not upgrades.** Durable idle games (Cookie Clicker, AdVenture Capitalist, Idle Miner) are all built on a reset-for-permanent-bonus loop; players return for months because of it. Our reset is thematically clean: *ship/open-source/sell your model*, start a new lab generation with permanent research multipliers ("legacy weights").
- **Humor is a proven differentiator here.** AdVenture Communist kept simple idle mechanics and layered satire on top; players loved the mix. AI is target-rich for satire (hallucinations, AGI hype, GPU shortages, doomer/accelerationist factions, model-naming absurdity). Crucially, the humor sits in flavor/events, never in the core math.
- **The 3D world is a backdrop risk.** Top idle tycoons are gorgeous 2D UI, not 3D worlds; the camera tends to fight the spreadsheet. Our mitigation is strict: the 2.5D hall is *only* justified because every purchasable upgrade visibly appears in it. If an upgrade can't be shown in the world, it goes in a panel, and we don't pretend the world is doing work it isn't.
- **Legibility over breadth.** Cute/clean aesthetics and a tight loop out-retain mechanical complexity. We ship clean, we add depth in waves.

---

## 2. The core loop (moment-to-moment)
**Active loop (seconds):** tap/allocate to assign Compute to a training run → watch a progress bar → claim a Data/Money payout → spend on the next rack or research node → see it appear in the hall.

**Idle loop (minutes–hours):** racks generate Compute passively; training runs complete offline; you return to accumulated payouts and a "while you were away" summary (this screen is a dopamine beat — design it deliberately).

**Session loop (days):** push the research tree, hit a capability milestone, decide when to prestige.

**Meta loop (weeks):** prestige generations accumulate "legacy weights"; each run is faster and reaches further; cosmetic/structural unlocks persist.

### 2.1 The three resources
- **Compute (the heartbeat):** produced by GPU/TPU racks. Spent on training runs and consumed continuously by active research. The number that "goes up."
- **Data (the gate):** gathered by scrapers/data-deals; required to unlock and improve model capabilities. Prevents pure-Compute snowballing; forces a second optimization axis.
- **Money (the lubricant):** earned by deploying trained models as products (APIs, chatbots, "enterprise solutions"). Spent on hardware, power, staff, real estate. The constraint that makes choices matter early.

Tension by design: Compute without Data stalls capability; Data without Compute can't be processed; both without Money can't scale hardware. Three resources, a triangle, legible.

### 2.2 Secondary systems (introduced in waves, NOT at launch)
- **Power & heat** (Phase 2): racks draw power and emit heat; cooling is a cost and a visible animation (fans, coolant). A soft cap that the player engineers around. *This is where Silicon's systems-depth instinct goes — but gated behind early-game mastery.*
- **Staff** (Phase 2): researchers (boost research speed), engineers (reduce downtime/heat), ops (boost idle yield). Hireable, assignable, with a payroll cost.
- **Events** (Phase 1 lightweight, Phase 2 full): the satire layer — market crashes, breakthrough papers, a competitor's model launch, a regulator visit, a "data breach," an intern who deletes prod. Modifiers + jokes.

---

## 3. Progression: the AI research tree
The tree is the "lots to upgrade" the player asked for — but it unfolds, it doesn't dump.

**Eras (each is a visible visual/theme shift in the hall):**
1. **Server Closet** — rented box, scripts, "narrow ML." Linear regressions, spam filters. Tutorial era.
2. **Startup Garage** — first real racks, first hires, first product (a dumb chatbot). Introduces Data gating.
3. **The Lab** — GPU clusters, custom models, the power/heat system unlocks. First prestige available here.
4. **Frontier Lab** — TPU pods, multi-room hall, staff specializations, faction events (doomers vs accelerationists).
5. **Hyperscaler** — your own data centers, energy deals, satellite compute, lobbying.
6. **Post-Singularity** (endgame/satire payoff) — absurdist capabilities, the "AGI" milestone as a prestige-gated spectacle, not a literal claim.

**Node types:** capability unlocks (new model types = new income sources), multipliers (×Compute, ×Data yield), automation (auto-claim, auto-assign — the genre-critical "remove manual input" upgrades), and cosmetic/structural (new hall sections, lighting, themes).

**Pacing rule:** each era should contain ~1–2 hours of fresh decisions before the next unlocks; the first prestige should land around the end of Era 3 so the player learns the reset loop while still engaged.

---

## 4. The prestige system ("Ship the Model")
- **Trigger:** once you reach a capability threshold, you can *ship* your flagship model (deploy / open-source / sell to a hyperscaler — player-flavored choice with minor different bonuses).
- **Reset:** Compute, Data, Money, racks, and most research reset.
- **Persist:** **Legacy Weights** — a meta-currency that buys permanent global multipliers, faster early eras, and unlocks. Also persist: cosmetic unlocks, achievement progress, and "lab reputation" (a slow meta-track).
- **Why it works:** turns the inevitable mid-game wall into the *most exciting* moment. The genre lives or dies on this; it is Phase 1 scope, not a nice-to-have.

---

## 5. The 2.5D world — art & tech direction
- **Style:** clean isometric/2.5D hall, parametric where sensible (reuse Silicon's no-image-asset philosophy for racks/servers — they're boxes with lights, ideal for parametric rendering and tiny build size). Warm, readable palette; clarity over realism.
- **Full-screen, but UI-first:** the hall fills the screen; resource counters and the active-action dock are persistent overlays. Panels (research tree, staff, shop) slide over the world, they don't leave it.
- **The manifestation rule (critical):** every purchasable thing that *can* be physical appears in the hall — buy a rack, it slides into an empty slot and powers on; upgrade cooling, fans spin; hit an era, the room re-skins. Load-bearing dopamine: the player *sees* their money become a place.
- **Tech:** Phase 1 can be 2.5D with CSS/SVG/Canvas or a light WebGL layer (Pixi/Three) — decide based on how much Silicon's renderer ports. **Do not** build a heavyweight 3D engine before the loop is fun. Prototype the loop in flat UI first; add the hall once the numbers are proven.
- **Performance:** Capacitor/mobile target means draw-call discipline. Parametric boxes batch well. Cap simulated entities; represent "1000 GPUs" as one upgraded rack visual, not 1000 objects.

---

## 6. Dopamine & feedback design (the player's explicit ask, done responsibly)
The ask was "make users feel dopamine when reaching points." Done well this is good game feel; done badly it's a manipulative ad-machine. Build the *honest* version:
- **Milestone moments:** era transitions are full-screen events — the hall re-skins, music swells, a satirical "press release" pops. These are the tentpole rewards.
- **Micro-feedback:** every claim has a number-pop, a sound, a particle. Juice the small actions.
- **The "while you were away" screen:** a designed reward, not a dialog box. Show the stack of earnings building up.
- **Anticipation:** progress bars near completion, "next unlock in…" teasers. The genre runs on *almost-there*.
- **Restraint (mentor note):** no fake-urgency timers, no manipulative pop-ups begging you back, no dark-pattern energy systems that exist only to sell skips. The retention research shows *respecting the player's time* is itself a retention driver ("idle games that respect your time and battery"). Honest juice, not Skinner-box exploitation. This also keeps Apple review clean.

---

## 7. Monetization (matches your premium instinct from Silicon)
- **Primary: single premium unlock** (~$6.99–8.99, your established model). The base game is generous; premium removes any friction and grants a cosmetic/QoL bundle (extra hall themes, faster offline cap, an exclusive "founder" rack skin).
- **Optional cosmetic IAP** only — hall themes, rack skins, a custom lab name. Never gameplay power. (Cosmetic-only monetization is repeatedly cited as the player-respecting model with strong retention.)
- **No ads, no energy gates, no pay-to-win.** Cleaner App Store review, better word of mouth, matches your portfolio's premium positioning.
- **Explicitly NOT crypto.** No real-money-adjacent mechanics, no "earn" framing. This is why we left the crypto theme: the AI-compute theme is current, safe, and far less cloned.

---

## 8. App Store / positioning notes
- **Theme is current and defensible:** "AI compute tycoon" rides a real 2026 wave (everyone's building data centers) without the rejection risk of crypto/gambling-adjacent themes.
- **Differentiation vs the pile:** the genre is saturated (Idle Miner, AdVenture Capitalist, Bitcoin Billionaire, etc.). Our wedges are: (a) the *visible-manifestation* 2.5D hall, (b) the satirical AI voice, (c) premium/no-ads positioning. None of these alone is a moat; together they're a distinct product.
- **Asset reuse warning (from your own open threads):** you have an unresolved UK Apple Search Ads screenshot issue on Dynasty Manager. Don't repeat the pattern — design the store screenshots *as part of* the milestone-moment work (the era-transition screens ARE your best screenshots), so marketing assets fall out of the game naturally.

---

## 9. Production plan — PHASED FOR SHIPPING (read this twice)

> **Mentor framing, on the record:** you chose "full vision, however long it takes." I've written that as a *roadmap*, but Phase 1 is deliberately a complete, shippable game on its own. "However long it takes" with no shippable checkpoint is how the idle-RPG and basketball-manager studies stayed unconsolidated. The discipline that makes a new project actually ship is a Phase 1 small enough to finish before the next idea arrives. Treat Phase 1 as a release, not a milestone.

### Phase 0 — Loop prototype (flat UI, NO 3D yet) · ~1 week
Prove the game is fun as numbers before spending a cent on the hall.
- 3 resources, manual claim, ~10 upgrades, one research branch, offline calc, one prestige.
- Playtest: is the loop compelling in ugly flat UI? **If not, the 3D won't save it — fix the loop or kill the project here.** This gate protects you from the genre's #1 trap.

### Phase 1 — Shippable MVP · ~4–6 weeks (this is a real release)
- The 2.5D hall with visible rack placement + manifestation rule.
- Eras 1–3, full research tree for those eras, the "Ship the Model" prestige loop.
- Lightweight events (a dozen, written with the satirical voice).
- "While you were away" screen, milestone era-transition moments, core juice.
- Premium unlock IAP. Settings, save/load, Capacitor build.
- **Ship this. Get real retention data. Then decide Phase 2.**

### Phase 2 — Depth wave · post-launch, data-driven
- Power/heat system, staff hiring/assignment, full event engine + factions.
- Eras 4–5, multi-room hall.
- Cosmetic IAP store.

### Phase 3 — Endgame & spectacle
- Era 6 / Post-Singularity, the "AGI" prestige spectacle, deep meta-progression (lab reputation), achievements, leaderboards.

### Phase 4 — Platform expansion (only if Phases 1–3 earned it)
- Steam port (you have the Dynasty Manager STEAM_PORT.md playbook to reuse — Electron wrap, desktop input/layout). Note: this is explicitly gated behind the mobile game *succeeding*, not a parallel effort.

---

## 10. Reuse-from-Silicon audit (your "low cost" claim, tested)
Be precise about what actually ports, because "high reuse" was part of your justification:
- **Ports well:** React/TS/Vite/Zustand scaffold, Capacitor config, parametric box rendering for racks, premium-IAP plumbing, save/load patterns, your CLAUDE.md/TASK.md workflow.
- **Does NOT port (new work):** the entire idle/offline-progression engine, prestige math, research-tree data + UI, event system, economy balancing (the hardest and most time-consuming part — balancing an idle curve is a craft).
- **Honest read:** reuse meaningfully lowers the *scaffolding* cost but not the *design* cost. The economy/balance work is the real project and it's all new. "Reuse is high so cost is low" is ~40% true. Plan for the balancing work explicitly.

---

## 11. Open risks & how we counter them (mentor's running list)
1. **Scope drift** (your documented pattern) → Phase 1 is a hard release gate; the "full vision" is roadmap, not the build target.
2. **3D world becomes a money-pit backdrop** → manifestation rule + Phase 0 flat-UI gate; the hall only gets built after the loop is proven.
3. **Economy balancing eats months** → treat it as a first-class workstream with a spreadsheet model; don't hand-tune blind. Consider a Claude-in-artifact balance simulator.
4. **Genre saturation** → the three wedges (hall / voice / premium); accept none is a moat alone.
5. **The next idea displaces this in 8 weeks** → the only real defense is shipping Phase 1 fast. Speed is the strategy.

---

## 12. Immediate next actions (when you start)
1. Lock the title (Singularity Inc. is a placeholder — check App Store name availability before falling in love with it).
2. Build the Phase 0 flat-UI loop prototype. Nothing else until the loop is fun.
3. Build a tiny economy spreadsheet/sim alongside it.
4. Set a Phase 1 ship date. Write it down. A date is what separates a project from an exploration.
