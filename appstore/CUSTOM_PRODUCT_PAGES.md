# Custom Product Pages and screenshot A/B tests

*Two free App Store Connect tools that move downloads more than a rename would. The App
Store name stays **"Singularity Inc.: Idle Tycoon"**; see METADATA.md for why.*

## 1. Custom Product Pages for organic search

Since mid-2025, a custom product page (CPP) can be assigned keywords. A search for those
keywords then shows that page instead of the default one. Apple allows up to 70 pages
per app.

Two rules shape the plan:

- **Assigning keywords adds no new ranking terms.** It routes searches you already rank
  for to a page that speaks to them, so the keywords below come from the keyword field
  you already have.
- **Each keyword maps to exactly one page.**

Where: App Store Connect → your app → **Custom Product Pages** → **+**. Give it a
reference name, promotional text, and screenshots in the order given. Then, under
**Keywords**, assign the listed terms.

### Page A: "AI Lab Tycoon" (people looking for an AI or tech tycoon)

- **Assign keywords:** `startup`, `gpu`, `sci-fi`
- **Promotional text (146/170):** Build an AI lab from one humming GPU to a
  planet-sized cluster. Train models, ship products, out-scheme rival labs — and press
  the Big Red Button.
- **Screenshot order:**
  1. `01-hero.png`
  2. `03-research.png`
  3. `05-market.png`
  4. `04-ship.png`
  5. `02-expand.png`
  6. `06-honest.png`

### Page B: "Idle and Incremental" (people looking for idle or clicker games)

- **Assign keywords:** `incremental`, `clicker`, `automation`, `prestige`
- **Promotional text (135/170):** Your lab earns while you're away. Automate
  everything, then Ship the Model to prestige and go again — faster. No ads, no energy
  timers.
- **Screenshot order:**
  1. `01-hero.png`
  2. `04-ship.png`
  3. `06-honest.png`
  4. `02-expand.png`
  5. `03-research.png`
  6. `05-market.png`

### Page C: "Business Sim" (people looking for management or tycoon sims)

- **Assign keywords:** `management`, `simulation`, `magnate`, `capitalist`
- **Promotional text (139/170):** Hire a team, launch AI products, set prices and climb
  the market past rival labs. A satirical business sim with real depth — no pay-to-win.
- **Screenshot order:**
  1. `05-market.png`
  2. `01-hero.png`
  3. `02-expand.png`
  4. `03-research.png`
  5. `04-ship.png`
  6. `06-honest.png`

All screenshots live in `appstore/screenshots/`, with iPad sizes in
`appstore/screenshots/ipad/`. After about two weeks, compare each page's conversion rate
in App Store Connect → Analytics → **Sources** (filter by product page). Then move a
keyword to whichever page converts it better.

## 2. Product Page Optimization (A/B test the default page)

Apple's Product Page Optimization tests up to three treatments of the default page
(icon, screenshots, preview video) against the current page. It splits a share of
traffic you choose, and reports conversion with a confidence level. A test can run up
to 90 days.

**First test: the first screenshot.** It matters most, because the first three
screenshots appear right in search results.

- **Control:** the current `01-hero.png`, the 2D hall.
- **Treatment A:** a 3D-lab hero.
  - The 3D lab is still an opt-in beta, so only run this once 3D is the default on
    capable devices (WORLD_3D_PLAN.md, after the TestFlight benchmarks). The store
    shouldn't lead with a view most new players won't see first.
  - When it's time, `scripts/event-art.mjs` already renders the 3D lab cleanly. Use it
    as the backdrop for a new hero frame.
- **Treatment B (can run now):** a hero whose caption leads with the new verbs, for
  example "Press the Big Red Button", using a 2D-hall capture of the button and its
  result card.
- **Traffic:** 50% to treatments. Run until Apple reports a confident result, which is
  typically 2 to 4 weeks at the current volume.
- **Then:** apply the winner to the default page, and reuse it on the CPPs above.

**Second test: the icon.** It needs the alternate icons compiled into a build first, so
plan it for a release.

## 3. In-App Events

These are listed separately, ready to paste, in `appstore/in-app-events/EVENTS.md`. The
media is in `appstore/in-app-events/art/`. Regenerate the listings with
`npm run store:events`. The schedule names each week's real sponsor, taken from the
game's code.
