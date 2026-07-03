# Improvement backlog — UX & gameplay
*Everything I recommend to make the experience and gameplay better, ranked within each category by
impact-per-effort. Sources: this session's engine/UX audits, the genre research, sim work, and the
existing roadmap. E = effort (S/M/L), curve⚠ = needs `npm run sim` validation.*

## 1 · Play-feel & dopamine (biggest experience wins)
1. ~~**Moment queue**~~ ✅ SHIPPED (E:S) — one arbiter for the five full-screen overlays (Celebration, EraTransition,
   ProductLaunch, WorldEventCard, OfflineModal). Today only one collision pair is guarded; a queue
   ends the class. The single most professional-feeling small fix left.
2. ~~**Generation Report share card**~~ ✅ SHIPPED (E:M) — after Ship the Model, render the report (gen, headline,
   peaks, rivals beaten) to a canvas PNG + iOS share sheet. Free word-of-mouth; zero network.
3. ~~**Era-aware music layers**~~ ✅ SHIPPED (E:M) — sound.ts already has era/ship swells; add one ambient layer per
   era so the hall *sounds* like it grows. Big atmosphere for ~no bundle cost (all synthesized).
4. **Rack-tap micro-interactions** (E:S) — tapping a rack shows its info card today; add a tiny
   per-tap LED flicker + haptic so the hall feels physical even when there's nothing to decide.
5. **Milestone "chase ladder" visibility** (E:S) — ProductsPanel milestones are collapsed; surface
   the NEXT product milestone in the goal-strip candidate pool so mid-game carrots include products.

## 2 · Gameplay depth (curve⚠ — each needs a sim pass)
6. **Research tree deepening** (E:L, owner design call) — 23 nodes is the endgame ceiling; the
   `frontier` category is the natural place for post-first-ship exclusive picks. The one real
   content ceiling left.
7. **Charter-conviction arcs** (E:M) — charters already reward repeat picks (+15%); add a 3-run
   "dynasty" tier with a named title per charter. Build identity across prestiges.
8. ~~**Rival counterplay events**~~ ✅ SHIPPED as the press blitz (E:M) — when you overtake a rival on the leaderboard, queue a themed
   world event from THAT rival ("Anthropos ships a safety paper; your accel products take heat").
   Makes the market feel alive; pool-gated so neutral stays baseline.
9. **Regulator negotiation choice** (E:M) — at high suspicion, a one-time world-event choice:
   settle (pay, −suspicion), fight (risk fine ×2 / clear), or comply (permanent −heat rate, −money
   mult). Turns the regulator from a meter into a story.
10. **Power/heat coupling for the Rig Bay** (E:S) — cooling parts could also slightly reduce
    regulatory HEAT gain from darkweb buys ("cold racks, cold trail") — a second honest reason to
    care about cooling. Efficiency lane only (see C4 learning).

## 3 · Onboarding & clarity
11. ~~**Interactive first-run beats**~~ ✅ SHIPPED as the First Steps checklist (E:M) — replace the static welcome card with 3 in-place
    spotlights (Start run → Claim → first rack), each one tap. The ramp made the opening fast;
    spotlights would make it teach itself.
12. ~~**"What's a Ship?" pre-prestige explainer**~~ ✅ SHIPPED (E:S) — the first time `shipReady` fires, a one-time
    sheet explaining what resets, what persists (team/products/trophies/reputation), and what
    Legacy Weights buy. The scariest button in the game deserves one screen.
13. ~~**Heat/suspicion first-cross coach line**~~ ✅ SHIPPED (E:S) — one-time toast at first heat ≥25%: "Heat draws
    fines and raids — lobbying and cooling calm it." (The regulator currently explains itself only
    by punishing you.)
14. **Number-format setting** (E:S) — scientific vs suffix notation toggle for endgame players.

## 4 · Retention (honest, no dark patterns)
15. ~~**R8.2 backup UX → iCloud**~~ ✅ Stage A SHIPPED (share-sheet export, import preview, gentle nudge); iCloud Drive auto-backup remains (E:M→L, roadmap) — Share-sheet export, import preview using
    ConfirmSheet, then CloudKit behind a SaveSync interface. The single biggest churn-protector:
    a lost save is a lost player.
16. **Post-session recap in WIWA** (E:S) — the offline modal shows gains; add "while away: 2
    contracts completed, product X overtaken" — the *story* since last open, not just numbers.
17. **Notification opt-in for run completion** (E:M) — a single LOCAL notification "your training
    run finished" (user-enabled, no scheduling tricks). Honest re-engagement; Capacitor local
    notifications, zero server.
18. ~~**Game Center achievements mirror**~~ ✅ APP SIDE SHIPPED (bridge + Settings row + score submits; native plugin blocked on a Capacitor-6 release — see GAME_CENTER_SETUP.md) (E:M) — the 53 achievements already exist; mirroring to
    Game Center gets platform-level visibility for free.

## 5 · Polish & professionalism
19. **Panel memoization pass** (E:M) — the UI audit's B1: heavy panels re-render at 10Hz; the Lab
    sectioning cut most of it, but Products/Team would benefit from narrower selectors. Do after
    a real-device profile, not before.
20. **VoiceOver pass** (E:M) — labels exist on nav/modals; sliders, the hall canvas (summary label),
    and chip rows need names. One afternoon, App Store review goodwill.
21. ~~**Notice queue in the store**~~ ✅ SHIPPED (E:S) — the audit's A5: two same-tick notices drop one. A tiny
    FIFO in the store fixes level-up toasts lost behind version-ship toasts.
22. **iPad layout** (E:M) — max-width already exists; a two-column stage (hall left, panels right)
    would make the iPad build feel intended rather than stretched.
23. **Haptic intensity setting** (E:S) — some players find celebrate-tier haptics strong; a
    Light/Full toggle beside the existing switches.

## 6 · Platform & growth (roadmap, owner-gated)
24. **R8.3 Android** (E:M) — CI workflow mirroring iOS; renderer verification on Android WebView.
25. **Localization pass** (E:L) — the satire is the product; start with DE/JA/PT-BR only if
    downloads justify translation quality effort.
26. **R8.4 Steam memo** (E:S) — the engine purity makes a desktop port cheap to evaluate; write the
    memo after launch metrics exist.

## Standing decisions for the owner (unchanged flags)
- **Run-yield double multiplier** (derive.ts) — global mults hit run income twice; the tuned curve
  is built on it. Change = full retune. Decide once, deliberately.
- **Research deepening scope** (item 6) and **any monetization beyond the one premium unlock** —
  the current honest-premium stance is a genuine differentiator; I recommend keeping it.

## Suggested order of attack
~~Moment queue (1) → Ship explainer (12) → heat coach (13) → notice queue (21) → share card (2) →
R8.2 backup (15) → rival counterplay (8) → interactive onboarding (11) → music layers (3) →
Game Center (18)~~ — **all shipped** (Game Center's native half waits on a Capacitor-6 plugin,
see GAME_CENTER_SETUP.md). Next wave, in order:
milestone chase ladder (5) → rack-tap micro-interactions (4) → post-session recap (16) →
panel memoization (19) → number-format setting (14) → haptic intensity (23) — then the
curve-touching depth items (6, 7, 9, 10) by telemetry once a TestFlight build has real sessions.
