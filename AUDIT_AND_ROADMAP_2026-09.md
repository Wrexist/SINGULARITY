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
7. **Store screenshots.** They were regenerated from this build (01–03 were stale:
   "$" label, no Data rate). 04 had been captured with the first-ship explainer over
   it, so the script now seeds `shipExplained`. *Owner action:* upload
   `appstore/screenshots/` in App Store Connect; this doesn't need a new build.

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
