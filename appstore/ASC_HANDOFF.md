# App Store Connect handoff: audit, fix and optimize

**For:** a Claude session running on the owner's own computer, with a browser signed in
to App Store Connect (Claude in Chrome, the built-in browser, or computer use).

**App:** Singularity Inc. (bundle prefix `com.wrexist.singularityinc`), live on the App
Store.

**Repo:** `Wrexist/SINGULARITY`, branch `claude/quirky-cray-ym85q8`. Pull it first. Every
value you'll paste lives in the files named below, so never retype copy from memory.

---

## 0. Ground rules (read before touching anything)

This is a live app with paying players, and App Store Connect actions are public and
often irreversible.

**Do freely:**
- Read every page.
- Fill in and save drafts.
- Create items that stay unpublished until the owner says go: In-App Event drafts, custom
  product page drafts, Game Center leaderboard and achievement records.
- Edit the promotional text. It goes live without review, but only edit it to match the
  repo file.

**Stop and ask the owner first:**
- Any price change: the app's price, subscriptions, or IAPs.
- Submitting anything for review, or releasing a version.
- Publishing an In-App Event or custom product page.
- Starting a Product Page Optimization test.
- Replying publicly to a customer review.
- Changing the privacy "nutrition label", the age rating, the app name or subtitle, or
  the bundle/agreements/tax/banking pages.
- Deleting or removing anything.

**Never:**
- Change bank, tax or legal entity details.
- Accept new agreements on the owner's behalf.
- Share credentials.
- Turn on a Game Center toggle on an app *version* (the native plugin isn't in a build
  yet; see §8).

**Keep a log:** write `appstore/ASC_REPORT.md` as you go, recording what you found, what
you changed (old → new), what's waiting on the owner, and screenshots of anything
surprising. End the session by committing the report on the same branch.

**When a page doesn't match this doc:** App Store Connect's UI moves. Describe what you
see in the report and ask, rather than guessing.

---

## 1. Read the numbers first (read-only)

Go to App Store Connect → Analytics (last 30 and last 90 days). Record in the report:

- **Retention:** Day 1, Day 7 and Day 28.
- **Engagement:** sessions per active device, and active devices.
- **Acquisition:**
  - Impressions, product page views, downloads, and the conversion rate (views →
    downloads).
  - The split by Sources: App Store Search, Browse, Web Referrer, App Referrer.
- **Search Terms:** the top 25 terms, with impressions and downloads for each.
- **Ratings:** the average rating, the count, and the 10 most recent reviews (text plus
  stars).
- **Crashes:** the count per version, from Analytics or TestFlight → Crashes.
- **Sales:** proceeds from Pro Yearly, Weekly and Lifetime, plus the trial-to-paid
  conversion if it's shown.

**Then answer the title question with data**
(`appstore/METADATA.md` §12):

- Do players find the app through "ai tycoon" or "ai" terms, or "idle tycoon" or
  "idle" terms?
- If "AI tycoon"-type terms clearly win, *recommend* (don't apply) the test title
  `Singularity Inc.: AI Tycoon` with the subtitle `Idle Data-Center Empire Sim`.
- Otherwise, keep the current name.

---

## 2. Pricing and availability (verify, don't change)

- **The app's price should be Free ($0.00).** See `AUDIT_AND_ROADMAP_2026-09.md`
  Part 6. If it isn't free, report it and ask; the owner decided this, but a price change
  waits for their go.
- **Availability:** note which storefronts the app is in. The metadata exists for 50
  locales, so flag big markets that are missing.
- **Paid Apps Agreement** (Business → Agreements): it must be **Active**, because the IAPs
  need it. Report its status, and **do not** accept anything.

---

## 3. In-app purchases and subscriptions (verify against `appstore/PRO_SETUP.md`)

| Plan | Product ID | Expected price | Notes |
|---|---|---|---|
| Pro Yearly | `com.wrexist.singularityinc.pro.yearly` | $24.99 | 7-day free trial; group level 1 |
| Pro Weekly | `com.wrexist.singularityinc.pro.weekly` | $4.99 | no trial; group level 2 |
| Lifetime | `com.wrexist.singularityinc.premium` | $39.99 | non-consumable (was $6.99) |

For each product, record:
- its status ("Approved", "Ready to Submit" or "Missing Metadata");
- its price;
- whether every field it needs is filled: localized display name and description, review
  screenshot, review notes;
- for Pro Yearly, whether the trial is set.

**Fix and save:** missing localization or review fields, using the wording in
`PRO_SETUP.md`.

**Ask first:** any price or trial that doesn't match the table.

---

## 4. Product page metadata (sync to the repo)

The source of truth is `appstore/metadata/<locale>/`. The files there are `name.txt`,
`subtitle.txt`, `keywords.txt`, `promotional_text.txt`, `description.txt` and
`release_notes.txt`. They cover 50 locales, all passing `npm run validate:store`.

- **For each locale in App Store Connect, compare** the name, subtitle, keywords,
  description and promotional text with the repo files.
  - Record mismatches and missing locales in the report.
  - Fixing the keywords, description or promotional text to match the repo is allowed,
    since it's the owner's approved copy.
  - The name or subtitle only ever changes with an explicit go.
- **Promotional text (en-US) for this release.** It goes live without review. Propose
  this in the report, but don't apply it without a go, because it describes features
  that aren't in an approved build yet:
  > New: press the Big Red Button, start a Cold War with rival labs, and clear weekly
  > Sponsor Weeks to climb the Sponsor Tiers. Still no ads. Still no pay-to-win.

  Check it's ≤170 characters before saving.
- **URLs:** support is `https://wrexist.github.io/singularity/support` and the privacy
  policy is `https://wrexist.github.io/singularity/privacy`. Open both and confirm they
  load; report a 404.
- **Category:** the primary category should be Games → Simulation
  (`METADATA.md` §2). Report it if it differs.
- **Screenshots and preview:**
  - Confirm the iPhone 6.7"/6.9" and iPad 13" sets are present, from
    `appstore/screenshots/` and `appstore/screenshots/ipad/`.
  - Confirm the app preview (`appstore/preview.mp4`) is attached.
  - Report anything missing; don't upload new screenshots without a go.

---

## 5. In-App Events (create as drafts)

The source is **`appstore/in-app-events/EVENTS.md`**, with the media in
**`appstore/in-app-events/art/`**.

- **Regenerate first** so the dates are current: run `npm install` then
  `npm run store:events`.
- **Create the drafts.** In App Store Connect → your app → In-App Events → **+**:
  - **The Major Update event** ("The Big Red Button"): media `update-card.jpg` (16:9) and
    `update-details.jpg` (9:16).
  - **The next two Sponsor Weeks**: media `sponsor-card.jpg` and
    `sponsor-details.jpg`.
- Paste each field exactly as given (badge, purpose, name, short and long description,
  start and end), and use the owner's time zone.
- **Do not publish** any of them. The Major Update event must wait until the build with
  these features is live. Sponsor Weeks can be published up to 14 days ahead, but that
  waits for the owner's go too, and only once that build is live, since older builds
  don't have Sponsor Weeks.

---

## 6. Custom product pages (create as drafts)

The source is **`appstore/CUSTOM_PRODUCT_PAGES.md`**. It defines three pages: AI Lab
Tycoon, Idle and Incremental, and Business Sim.

For each page:
- Create the CPP with its reference name.
- Paste its promotional text.
- Upload the screenshots from `appstore/screenshots/` in the order listed.
- Assign exactly the keywords listed.

Two checks:
- Every assigned keyword must exist in the en-US keyword field
  (`appstore/metadata/en-US/keywords.txt`).
- No keyword may appear on two pages.

Save as drafts and **don't publish**. Record each page's URL in the report.

---

## 7. Product Page Optimization (plan only)

Read §2 of `CUSTOM_PRODUCT_PAGES.md`. Don't start a test. Report:
- whether a test is already running;
- whether the account has enough traffic. App Store Connect shows an estimate when you
  set up a test.

Treatment A (a 3D hero) is gated on 3D becoming the default. Treatment B needs a new
screenshot that doesn't exist yet. Note that in the report.

---

## 8. Game Center (records only; don't enable on a version)

The plugin is written (`native/game-connect`) but **not in any build yet**. See
`GAME_CENTER_SETUP.md`.

In App Store Connect → Features → Game Center, you may *create the records*, which is
harmless until a build uses them:

- Leaderboard `grp.singularity.ships`: "Models Shipped", integer, best = highest.
- Leaderboard `grp.singularity.ascensions`: "AGI Ascensions", integer, best = highest.
- Achievements `grp.singularity.ach.<id>` for a starter set. Take the in-game ids from
  `src/engine/achievements.ts`, e.g. `first_ship`. Each needs a title, descriptions and
  points, and a 512×512 or 1024×1024 image. If there are no images, create the
  leaderboards only and note it.

**Do not** toggle Game Center on the app version, and don't change the App ID capability.
Report whether Game Center is already enabled on the App ID (developer portal →
Identifiers).

---

## 9. App privacy, age rating, review info (verify, report)

- **App Privacy.** The app's own posture is "Data Not Collected":
  - its telemetry is on-device only;
  - Game Center is Apple's own service.

  Purchases go through RevenueCat (`appstore/PRO_SETUP.md`), and RevenueCat's own
  disclosure guidance may require "Purchases" data types. Compare what's declared with
  that guidance, and **report**; never change the label without the owner.
- **Age rating:**
  - Record the questionnaire answers and the resulting rating.
  - The game has satire, a "dark-web data bazaar" mechanic and simulated money, but no
    gambling with real money. Note that the "Big Red Button" is a gamble with in-game
    effects only: no purchase, no real currency.
  - Report if any answer looks wrong.
- **App Review Information:** the contact details are present, there are review notes,
  and no demo account is needed (the game has no login). Report gaps.

---

## 10. Ratings and reviews (draft, don't post)

For the 10 most recent reviews, draft a short, human reply in the game's tone (dry,
friendly, no corporate filler) in the report. Prioritize 1–3-star reviews that mention
bugs or prices. **Don't post** them; developer replies are public.

Note recurring themes, such as "too expensive", "weekly sub", "crash" or "battery", in a
"What players say" section. These feed the next round of work.

---

## 11. Next version prep (draft only)

When the owner uploads the build containing this branch's work, its version's "What's
New" (en-US) should be drafted from the commits on this branch. They cover:
- the Big Red Button;
- the Rival Cold War;
- weekly Sponsor Weeks and Sponsor Tiers;
- the App Store rating prompt (no need to mention it);
- the 3D Lab beta improvements: motion, interactions, the ops bot, crowds, storms.

Write the draft into the report, under 4000 characters, in the style of
`appstore/metadata/en-US/release_notes.txt`. Don't paste it into App Store Connect until
the build exists.

---

## 12. Finish

1. Complete `appstore/ASC_REPORT.md` with these sections:
   - Numbers (§1)
   - Changes made (old → new)
   - Waiting on the owner (a checklist)
   - What players say
   - Recommended next steps
2. Commit it on `claude/quirky-cray-ym85q8` and push.
3. Tell the owner, in plain words:
   - the three most important findings;
   - every item waiting on their go.
