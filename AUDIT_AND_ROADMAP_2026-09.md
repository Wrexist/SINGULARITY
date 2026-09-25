# Audit & Roadmap — 2026-09

Owner brief: "it looks boring and not complete — make it incredible, audit everything,
keep going with the best next move."

Method, in this order:
1. **Played it as a new player.** A scripted first session at 390×844 (the real build,
   no seeded save), screenshotting every 30s for five minutes.
2. **Two parallel audits.** One on engine/store correctness (every finding reproduced
   with a script, plus a ~200k-action fuzzer), one on UI at device width with a
   late-game save (measured rects, not impressions).
3. **Mid-game walk.** A greedy auto-player produced real 10 / 25 / 45-minute saves, and
   every tab was walked on each. The seeded late-game save only shows the endgame, so this
   was the first check of the screens a player spends the first hour on.

Every fix below shipped with `tsc` and `vitest` green, both smoke runs (fresh and
seeded) at zero console errors, and a byte-identical `npm run sim` where the engine
was touched.

---

## Part 1 — The first screen (what "looks boring / not complete" was)

| Defect | What the player saw | Fix |
|---|---|---|
| Brand header invisible | The top ~60px of **every tab** was blank. The pinned resource bar's opaque overscroll slab reached 120px above the bar and sat on the logo, name and rotating tagline at rest. | The slab only reaches that high once the page has scrolled past the header (`data-scrolled` on `<html>`). |
| The one button hidden | "Start training run", the only thing to do on the first screen, sat **under the bottom nav**. | The dock renders before the FIRST STEPS checklist. |
| Price tags on an empty room | "$7.0K" / "$5.0K" expansion strips were painted on the empty closet floor at $0. | Strips appear once the floor is half full, or once the room has already grown. |
| Wrong item name | The checklist said "Buy a Small Rack", but the card is "Consumer GPU Rack". | Renamed. |
| Wipe button everywhere | "reset save" was a footer link on every tab. | Moved into Settings → Back up & restore, behind the same confirm. |
| Dropped CSS rule | A stray `*/` ended a comment early, and esbuild dropped the meta-row progress-fill rule after it. | Fixed. The build is warning-free again. |

## Part 2 — Engine correctness (all reproduced, all now tested)

| # | Bug | Impact |
|---|---|---|
| 1 | **Grand Challenges and Megaproject cycles could get permanently stuck.** Big keeps about 15 significant digits, so paying in instalments could leave a lane slightly under its cost while `cost.sub(funded)` had already rounded to 0. The next payment was then 0, and the Fund button did nothing. | 36/99 realistic instalment patterns stuck a challenge, and 300/300 random partial fundings stuck megaproject cycle 1. A lane now counts as met within one part per billion, a closing payment snaps the lane to exactly its cost, and a save that is already stuck completes on its next tap or reload. |
| 2 | Institute Fellowship chairs were zeroed on every ship, and their Grants were silently refunded. | Chairs now persist, like the wings that house them. |
| 3 | The Research Director perk bought the cheaper arm of every either/or fork, permanently locking out the other arm. | Forks stay manual. |
| 4 | Hand-claimed runs never counted toward all-time earnings. | The Seed Round contract and lifetime-$ achievements stalled in the opening until auto-claim arrived. |
| 5 | The Archive showed every generation past 512 as "Gen 512" after a reload. | Capped at the same ceiling as `prestige.ships`. |
| 6 | Selling the flagship product kept its brand bonus until reload. | Cleared on sale. |
| 7 | Product version cost could overflow to Infinity at extreme Data/sec, which blocked every product upgrade. | Falls back to the base cost. |
| — | An exception during offline catch-up at launch fell into the corrupt-save path, which starts a fresh game. | The save now loads without the catch-up. |

Checked and clean: no `Date.now()`/`Math.random()` in engine code; the fuzzer
(fresh, mid, and 1e320-resource states; every store action; save round-trips) never
threw and never produced NaN, Infinity or a negative resource.

## Part 3 — UI at device width

Hall canvas sized mid-animation (a light strip on every cold boot) · resource-bar
rates were passive-only (Money read $156M/s while climbing ~20T/s; Data had no rate)
· "+X" pop flickering over the labels on every auto-claim · news ticker cut 59 of 60
headlines before the joke (now two lines) · the Ship button jumped ~30px about once a
second · Product Milestones and product-detail grids overflowed to the screen edge ·
the "Long game" tab wrapped · haloed-white progress labels on a pale track · the
in-app Reduce Motion toggle didn't reach portalled sheets · modals and the celebration
didn't clear the Dynamic Island or home indicator · "MAX" shown in alert orange ·
lamps showing through the hall name pill · the "+data" floater used compute blue ·
toasts landed on top of the resource values.

## Part 4 — Mid-game legibility (from the 10/25/45-minute saves)

- **Research** — by 25 minutes, finished categories put about four screens of spent
  nodes above the first node you could buy. A finished category now folds to a single
  tappable row.
- **Ship gate** — "Research 9/25 — build the Inference API to ship" wrapped and was
  clipped inside a 24px bar. It now sits as a label above a slim bar.
- **Floor full** — a red "found a wing" alarm appeared while bigger racks could still
  replace smaller ones, which is the normal next step. It now says so, in the neutral
  tone.

---

## Part 5 — Open items, ranked

1. **Dark mode (owner decision + one device test).** This is the single biggest visual
   upgrade left. The hall, the store screenshots and the brand are all dark, while the
   UI is light-only, so a dark-mode iPhone gets a white screen at night. The CSS is
   ready for it: roughly 1,000 `var(--…)` uses, plus about 110 literals to tokenise.
   **Blocker:** `capacitor.config.ts` sets `ios.contentInset: "always"` with a fixed
   light `backgroundColor`, so the status-bar strip would stay light above a dark app.
   The fix is native: `@capacitor/status-bar`, or `contentInset: "never"` with CSS
   safe-area padding. Both need one TestFlight check that can't be done from the web
   build.
2. ~~**Sponsor completions past 400 lose Reputation on reload.**~~ ✅ **done.** Earned
   Rep is recomputed from the kept `sponsor_<day>` ids, so the 400 cap took 6 Rep per
   trimmed id on every load. The cap is now 3650 (ten years of dailies). It stays a
   hard bound against crafted saves, and needs no save migration. Pinned by
   `sponsor.test.ts`.
3. ~~**Resume-path offline time.**~~ ✅ **mitigated.** `useGameLoop` measured a resume
   with `performance.now()`, which on iOS can stop while the device sleeps, so time
   away with the screen locked could be credited as seconds. The loop now uses the
   wall-clock delta when it clearly exceeds the monotonic one. It is never less
   generous than before, and the offline cap still bounds it. *Owner check:* lock a
   TestFlight build for 30 minutes with the app foregrounded, then confirm the recap.
4. ~~**HQ fold styles.**~~ ✅ **done.** Lab Stats, Recent activity and Field Notes now
   render the same 8px fold row as `Collapsible`.
5. ~~**Legacy Investment rows.**~~ ✅ **done.** They moved below the ship decision and
   fold, opening by themselves whenever a row is affordable.
6. ~~**Pop-ups can still stack.**~~ ✅ **done for uninvited moments.** `<Portal>` now
   counts mounted overlays (`usePortalOpen`). World events and era crossings, the two
   moments passive progress can trigger, wait while any sheet is open, including ones
   opened inside a component.
7. **Store screenshots.** All six iPhone and iPad shots are regenerated from this build
   (01–03 were stale: "$" label, no Data rate). The script had stopped reaching the Ship
   and Data Market scenes after the Lab split. *Owner action:* upload
   `appstore/screenshots/` in App Store Connect; this doesn't need a new build. The
   "What's New" (`release_notes.txt`) is rewritten for this update in all 50 locales
   (`npm run validate:store` passes). en-US is the full version; the other 49 are
   direct translations of a compact five-point version, written without the native
   editor review the launch copy had. *Owner action:* have a native speaker spot-check
   before submitting, at least for the Indic locales.

## Part 5b — Round 2: pacing, performance, retention

Two more audits. One on pacing: vite-node probes drove the real engine with human-like
players (1–1.5s reaction time, shop checks every 3–30s). The other on performance: 4×
CPU throttle on a late-game save, measured on the built app. Everything below shipped
with `npm run sim` byte-identical.

| Finding | Evidence | Fix |
|---|---|---|
| The goal strip's "next goal" for most of the first hour was **"Wardrobe: unlock 6 hall themes, 67%"**, and the first Ship was never a goal | `goals.ts` picks the highest progress, and 4 free themes out of 6 = 67% from second one | "Ship your first model", measured along the capability node's prerequisite path (`shipPath`). Cosmetic collection counters are no longer goals |
| The ship gate counted the whole tree ("Research 9/25"), so it read 36–48% at the moment shipping unlocked | probe | It now counts the Ship's own path (8 nodes) |
| **A 23-minute dead zone** for players who never touch the intensity slider, since auto-train drains the bank before it reaches mid-tree nodes | first ship at 43m30s without the slider vs 13m03s with it | **"Save for this"**: tap a walled node and intensity eases just enough, the node is bought when affordable, and the slider is restored |
| The first-Ship nudge fired at ~2 weights (next run ×1.03), talking players into a pointless reset | probe | The nudge now waits until the next run starts at ≥ ×1.25. Until then the strip shows "Grow your first Ship". Ship modes show "Legacy boost ×A → ×B" |
| HQ showed "5K weights (×91)", but the real value is ×17.39 | the display used linear 1 + 1.8% × w, while derive() uses w^0.8 on uninvested weights | One `legacyMultiplier` helper now feeds both |
| **~18 dismiss-only world-event cards an hour** ("Let's gooo") | 18.5% of the neutral pool has a choice | Only decisions get a card. The rest run as a BREAKING line on the newswire, and the full story goes to Recent activity |
| The auto-claim hand-off (after 57–107 manual taps) passed silently | probe | A one-time burst from the training bar, plus a static loop mark afterwards |
| First-days players had no daily objective (sponsors only after all 32 ladder rungs) | `contracts.ts` | Sponsors also run alongside the ladder from the first Ship, only on lanes the player has started |
| The hall drew ~1,400 canvas calls/frame while scrolled off-screen | 4× throttle: 790 ms/s main thread, ~79 long tasks per 10s | IntersectionObserver pause, giving **388 ms/s and 0 long tasks** |
| recommendedUpgrade re-derived the economy 13–16× per 10Hz render | ~20% of all React render work | Memoised: tick **~12–14 → 9.7 ms** |
| Rolling counters ran rAF loops forever, even when settled | battery | They stop when settled and wake on change. Static components are memo'd |

Rejected: a WeakMap cache on `derive()`. Test fixtures mutate a state in place after
deriving it, and a stale `Derived` in a live game isn't worth the ~1 ms saved.

Still open from these audits:
- **Rack sprite caching.** Draw each rack's static body once into a cache and draw only
  the LEDs live. This would cut the visible-hall cost, but it's a visual change that
  needs a device check.
- **Offline Compute reserve.** An 8h absence at 100% intensity can come back with a
  near-empty Compute bank (it lands wherever the run cycle was), while 1h comes back
  full.
- **Expiry rings on stacked objective boosts.** When two boosts end together, Compute/s
  drops 81% with no warning.

## Part 5c — Round 3: generations 2–20, accessibility, a live-game freeze

A third audit played generations 2–20 on real engine saves. Its finding: past the first
few ships the game stops **offering choices**. Legacy runs away, runs last seconds, and
three whole systems (Doctrine, the Rep sinks, the charters) sit unreachable or settle
into a habit. Everything below shipped with `npm run sim` byte-identical.

| Finding | Fix |
|---|---|
| **Doctrine was unreachable.** Committing needed two same-side faction choices inside one run, but alignment resets every ship and late runs last seconds | **Declare a Stance** (ship 4+): Safety / Center / Acceleration in the Lab Charter card. It sets alignment to exactly the commit threshold and locks with the charter. Claims wait for the lock, so one run can't claim both sides |
| **Rep dried up** after the achievements (+1 per ship), so Paradigms and Wings sat out of reach | **Personal records**: +2 Rep for each power of ten your career-peak Compute/s crosses above 1K/s, capped at 60 records. Computed from a stat already saved. A ring on the HQ Rep strip fills toward the next record |
| **Veterans never see a real run** (Legacy ×1e3+ turns a generation into seconds) | **Unplugged Trials** (ship 10 / 20): Legacy off for one generation. Pays +1 product slot, then +30 Rep |
| **All seven charters on screen every run**, so one habit took over by ship 3 | **Charter draft**: each ship deals 3. Last run's charter is always kept, so conviction streaks survive, and from ship 6 there's one rule-changer wild card: Research Sprint, Product Company or True Believers |
| Conviction label read "↻ +%" on saves migrated with a streak of 0 | The card reads the engine's `charterConvictionMult` |
| **Critical: permanent freeze.** `tick()` compared seconds but recursed in ms. About 2% of buff expiries re-split forever and overflowed the stack. That poisoned the save and also broke the offline catch-up | Compare in the recursive unit, and expire float dust under 1e-9 s. The new test fails on the old code |
| Accessibility: dialogs trapped no focus, the core loop said nothing to VoiceOver, and hit areas were 13–30pt | `useDialog` (focus in/out, Tab cycle, Escape) on 13 overlays. The training bar is a progressbar with a polite live region. Hit areas grow to 44pt where neighbours allow |
| Text contrast: rates and accents at 3–4:1 | Ink tokens for text (`--compute-ink` …), and accent fills darkened behind white text, with the same palette |

The exhaustive bug-hunt workflow (six area finders, three independent verifiers per
finding) returned 38 round-1 candidates. The freeze above was fixed first. The other
35 went to seven isolated fix batches, and each was reproduced by a failing test
before it was changed. All 35 were fixed or folded into a duplicate, the sim stayed
byte-identical after every commit, and the suite grew from 866 to 992 tests. The
fixes that change what live players see:

- **Runs are priced at the intensity they were started at** (save v37, `run.focus`).
  Moving the slider mid-run used to reprice a run already paid for: ×3.3 as an
  exploit, or −70% when easing it as the advisor (and "Save for this") advised.
- **Honest Compute walls and ETAs.** A wall is reported only when auto-train really
  caps the bank, countdowns follow the real run cadence, and a held lab shows passive
  income only.
- **Rig Bay parts return to inventory** when an in-place rack upgrade empties their tier.
- **×10 / Max hall expansion** stops at the level that fills the floor.
- **No reload deletes progress.** Modifiers keep 48 (was 20), and megaproject cycles
  and hires stop at the 512 the loader keeps. Export keeps the player's own
  intensity, not the "Save for this" one.
- **Products across a Ship.** An in-flight version upgrade is dropped, and a
  loss-making campaign is cut back, so neither stalls the fresh lab. Sales are valued
  on the settled subscriber count, which ends the price-dial pump. A met sponsor is
  never lost: the autopilot claims it and the rollover banks it.
- **Staff.** Mentor morale is capped at +30%, closing a ×13 stacking exploit. Recruit
  cards show real salaries. A hand-benched specialist stays benched under HR
  Autopilot (save v38). "Run N products" and "Employ N specialists" objectives count
  what you have now.
- **Meta.**
  - The Research Director leaves the Charter/Stance window open for a 60-second grace.
  - The Ship panel predicts ascension per ship mode.
  - The regulator truce survives a ship and no longer draws as a burning rack.
  - The first megaproject cycle quotes its real reward.
- **Shell.**
  - FIRST STEPS stays retired.
  - Contract goals land on Goals › Now, where the board renders.
  - One-time unlock toasts stay one-time.
  - Confetti rolls once per burst.
  - A second away-window folds into an open recap.
  - The achievements badge re-anchors after a reset or import.

**Round 2** ran on the fixed code. Six area agents each had to prove a bug with a
failing test before fixing it, in an isolated worktree. They landed 29 fixes and 2
test suites, and the suite grew to 1111 tests. The sim stayed byte-identical.
Highlights:

- **Trials are queue-only** (save v39, `queuedTrial`). A Trial could start any time
  before the run was shippable. A player could play a whole run unconstrained, stop
  one node short, Attempt, buy that node and bank the reward after zero seconds of
  the handicap. Even starting at zero research let a player bank a Legacy-on
  stockpile first. Now you only queue ("Next run" → "Queued ✓"), and the Ship
  starts the Trial on the untouched fresh lab. That also covers Research Director
  owners, who could never start one before.
- **The stance holds.**
  - Buying the Director mid-run no longer reopens a closed charter/stance window.
  - Research bought by hand closes the window even inside the Director's grace.
  - A declared stance survives float drift at the 0.4 line.
  - The card shows the lab's real tilt.
  - A bare Safety declaration no longer pays the +3-Rep safety-ship bonus.
- **Offline and resume.**
  - Offline and long windows keep compute-bound run income.
  - "Save for this" survives an app switch and a buff lapsing mid-window.
  - The cold launch writes the caught-up save before it stamps lastSeen.
- **Hostile saves.** These can no longer freeze launch or wipe products:
  - a flood of unknown feature ids;
  - `__proto__` product ids;
  - an unreadable frontier;
  - zero or negative buff factors.
  Restore accepts only a real save. The round-trip fuzzer walks 30–55 real
  generations, and fixtures from 11 shipped save versions (v11 to v37) load cleanly.
- **Hall and shell.**
  - Rack taps hit the box you see.
  - The Generation Report describes the run that was shipped.
  - An AGI ascension gets its own headline.
  - The recap waits for an open sheet.

**Round 3** used new slices: products and rivals, staff and automation, goal systems, a
property-based multi-generation invariant fuzzer (now a permanent test), UI panels, and
deep meta. It landed 32 fixes, and I added 4 on top. The suite is at 1199 tests and the
sim is still byte-identical. The ones players will feel:

- **Payroll is charged per second, not per frame.** Today's soft-lock fix capped each
  tick at half its receipts, so live play between run payouts paid 2–5% of the wage
  bill while offline paid it all. It now charges min(bill, half the income rate), the
  same for a frame, a resume or an offline step.
- **Revenue ladders read settled revenue.** A one-frame price-dial flick can no longer
  clear $/s milestones, revenue contracts, objectives or achievements.
- **"Earn $X lifetime" objectives count all-time earnings.** They reset every Ship, so
  the $10B and $1T rungs blocked the board for good.
- **Offline product growth compounds.** Users grew linearly while marketing was billed in
  full.
- **Heat nets against cooling before the floor.** A resume no longer spikes Heat into a
  regulator fine.
- **HQ, Research and the Team stay open after a Ship.** They used to vanish until the
  run's first research.
- **Every Money figure uses the rate the tick really pays**, including each product's
  buffs and the payroll actually taken:
  - the top bar and money ETAs;
  - version countdowns;
  - Pro price;
  - salaries.
- **Other fixes:**
  - The Launch Autopilot picks the strongest shipped model.
  - A ladder's next Trial rung can be queued while the current one runs.
  - A deep-endgame daily sponsor no longer rolls "∞ / ∞".

**Round 4** switched method. Agents played the built app in a browser for a new player's
first generation, generations 3–8, and a deep endgame. They also checked
number formatting at the extremes, and built a guard-parity table that checks about
60 controls across 16 panels against the store actions they fire; the table is now a
permanent test. The round landed 28 fixes plus 3 of mine. The suite is at 1333 tests
and the sim is still identical. Highlights:

- **Overlapping Objective boosts multiplied.** A claim burst inflated Legacy Weights
  about 8000×. Boosts on a lane now refresh: the stronger factor and the longer time.
- **Claimed Daily and Objective boosts carry through a Ship** instead of being wiped.
- **On a device, Premium could be granted by the web stub.** If StoreKit's bridge landed
  after launch, Buy took the web path and Restore never asked StoreKit. The app now
  waits for the bridge and never caches a failure.
- **Uninvited UI waits for a sheet or moment to close.** This covers the first-Ship
  explainer, unlock lines and toasts.
- **The advisor's contract chip opens the fold it points into.**
- **Ships stop announcing a model** they gave away or can't launch.
- **Numbers read true.**
  - A small stance tilt reads its real percent.
  - Multipliers show two decimals.
  - Counters never round up onto their target.
  - Deep Mandate summaries stay short.
  - Lab Stats Data/sec matches the bar.
- **Recruits offer only roles that can act yet.** Product-team roles appear only after
  the first Ship.

Also for the owner:
- **Legacy and timed boosts.** A timed boost taken while you linger at a ship-ready lab
  still lifts that Ship's Legacy about 100×. That comes from the end-of-run economy
  compounding, and fixing it means pricing Legacy on boost-free income or capping
  run-over-run gain. Both change what every live player earns.
- **Endowment Directives.** An earned Directive pick has no signal outside the
  Reputation sheet.

Also left for the owner:
- Megaproject cycles now end at 512. Raising that to about 890 is a balance call.
- A Reasoning Engine priced under about 0.53× Pro loses money even with marketing
  at 0.
- Staff lane multipliers still grow steeply with very large trained crews.
- The first-ship explainer can open over an open sheet. It is visible and
  dismissable, and gating it needs a latch, because its own Portal counts as a sheet.

Deferred, owner's call:
- **Ship-mode rebalance.** Hard's product penalty is wiped out by the next version push,
  so Hard always wins. The fix is curve-safe, but it weakens a strategy live players use
  today.
- **Legacy softcap above ×10.** Also curve-safe (the sim peaks at ×2.9), but it
  weakens saves already at ×1e6+. Unplugged Trials give veterans a real run without
  touching it.

## Part 6 — App Store: "free to download"

The listing copy already says "free" (`appstore/metadata/en-US/description.txt`:
"The full game is free and generous"). Premium is one optional $6.99 non-consumable
IAP (`com.wrexist.singularityinc.premium`). **The app's own price is set only in App
Store Connect, which this repo cannot reach.** To make the app free to download:

App Store Connect → Apps → Singularity Inc. → **Pricing and Availability** → Price
Schedule → **Add Pricing** → base country → **Free ($0.00)** → Confirm. The change
applies to every storefront unless you've set per-country overrides. It needs no new
build or app review, but can take a few hours to show up on the store.

**Premium price shown in-app is now localized.** The card hardcoded "$6.99", so
players outside the US saw a price StoreKit wouldn't charge them. It now shows
StoreKit's localized string (`product.pricing.price`), with "$6.99" kept only as the
web/dev fallback. *Owner check:* open Settings on a TestFlight build with a non-US
sandbox account.

Paid Apps Agreement: keep it active. The Premium IAP needs it even when the app
itself is free.
