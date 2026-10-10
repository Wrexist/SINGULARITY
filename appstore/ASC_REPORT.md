# App Store Connect report

Session: 2026-10-10/11, working from `appstore/ASC_HANDOFF.md` with the repo at `cac2ca4`
(main). All App Store Connect data was read from the signed-in ASC web app (its own
read-only data endpoints), so the numbers are exact as of 2026-10-09 UTC.

App: **Singularity Inc. Idle Tycoon**, Apple ID `6783938767`, SKU `singularity-inc`.
The live version is **1.1** (Ready for Distribution). No newer version is in
preparation, so the description, keywords, locales and review notes can't be edited until
the next build is added.

**Nothing in App Store Connect was changed this session.** Everything below is a reading,
a draft, or a question for the owner.

---

## Numbers (§1)

Window: 30d = Sep 10 – Oct 9, 2026; 90d = Jul 12 – Oct 9, 2026.

| Metric | 30 days | 90 days |
|---|---|---|
| Impressions | 3,702 | 9,347 |
| Product page views | 440 | 918 |
| First-time downloads | 33 | 37 |
| Redownloads | 0 | 1 |
| Conversion rate (ASC) | 1.61% | 0.75% |
| Updates | 10 | 10 |
| Uninstalls | 5 | — |
| Sessions (opt-in only) | 20 | 31 |
| Crashes (opt-in only) | 0 (1.0 and 1.1) | 0 |
| Proceeds | $5 | $22 |
| In-app purchases | 1 | 2 |

- **Traffic is very small:** about 1 download a day, and about 8 unique product page
  views a day. Downloads are trending up through early October (most of the 90-day total
  landed in the last 30 days, with spikes after Oct 2).
- **Retention (D1/D7/D28) and active devices:** ASC shows "Not Enough Data" (opt-in
  only). No crash reports.
- **Download → paid** (Overview card): D1 2.94%, D7 6.67%, D35 20%. These are tiny
  samples.
- **Proceeds, 90 days:** $15 from the app purchase (the app used to be paid), $6 from
  Lifetime, and $0 from subscriptions. There were two refunds (−$3, −$2). 1 active plan,
  with no paid plans yet. Trial-to-paid: Not Enough Data. Analytics also lists a
  "Pro Monthly" product with $0; it no longer exists in the subscription group.

### Sources (30 days)

| Source | Impressions | Page views | Downloads |
|---|---|---|---|
| App Store Search | 1,985 | 105 | 15 |
| App Store Browse | 1,704 | 322 | 18 |
| App Referrer | 11 | 11 | 0 |
| Web Referrer | 2 | 2 | 0 |

Search converts better per page view (15 from 105) than Browse (18 from 322).

### Top storefronts (90 days)

- **Impressions:** US 2,453 · Germany 648 · France 377 · Japan 346 · India 310 ·
  Czech Rep. 284 · Canada 255 · UK 252 · Indonesia 229 · Nigeria 221 · Netherlands 217 ·
  Brazil 201.
- **Downloads:** US 14 · Canada 3 · Germany 3 · France 2 · Hong Kong 2, then one each in
  CZ, GM, IN, ID, NL, NG, NO.

Six of the top 12 impression markets are non-English (Germany, France, Japan, Czech Rep.,
Indonesia, Brazil), and the listing is English-only (see §4).

### Search terms and the title question

The current ASC Analytics UI has **no search-term breakdown** (no search-term dimension
exists in its settings). Term-level data now only comes through the App Store Connect
Analytics Reports API ("App Store Discovery and Engagement" reports), which has to be
requested ahead of time and isn't in the web UI.

**Answer:** there is no term data showing "AI tycoon" beats "idle tycoon", so **keep the
current name.** At ~15 search downloads a month, a title test wouldn't reach significance
anyway.

### Ratings

There is **one written review:** ★★★★★, Hong Kong, 2026-10-08, title "添加中文" ("Add
Chinese"), body "添加中文语言" ("Add Chinese language"). It has no reply.

---

## Pricing, availability, agreements (§2)

| Check | Result |
|---|---|
| App price | Free ($0.00), base territory USA ✓ |
| Availability | 175 of 175 storefronts; "available in new territories" on ✓ |
| Paid Apps Agreement | **Active**, 6 Sep 2026 – 6 Sep 2027 ✓ |
| Free Apps Agreement | Active ✓ |

---

## In-app purchases and subscriptions (§3)

| Plan | Product ID | State | US price | Trial | Level | en-US loc | Review shot | Review note |
|---|---|---|---|---|---|---|---|---|
| Pro Yearly | `…pro.yearly` | Approved | $24.99 ✓ | 1 week free ✓ | 1 ✓ | "Pro Yearly" ✓ | ✓ | ✓ |
| Pro Weekly | `…pro.weekly` | Approved | $4.99 ✓ | **1 week free in all 175 territories ✗** | 2 ✓ | "Pro Weekly" ✓ | ✓ | ✓ |
| Lifetime | `…premium` | Approved | $39.99 ✓ | n/a | — | "Premium Unlock" | ✓ | empty |

- **Weekly trial mismatch:** `PRO_SETUP.md` says "Only the yearly plan gets the trial,
  so the trial also steers people to yearly." Weekly currently has the same 7-day trial,
  which removes that steer. A free trial that rolls into a weekly charge also tends to
  draw "scam" reviews. Commit `c201ab7` ("Show the weekly plan's free trial") suggests this
  may have been deliberate at one point, so I didn't touch it. **Owner decision.**
- Subscription group "Singularity Pro": en-US localization approved ✓.
- All three products have **en-US localizations only**.
- Lifetime's display name is still "Premium Unlock" and its description still says
  "24h offline cap, Founder status & themes". `PRO_SETUP.md` suggests optionally renaming
  it to "Pro Lifetime". I didn't change it, because editing an approved product sends it
  back to review.

---

## Product page metadata (§4)

| Field (en-US) | Live in ASC | Repo | Match |
|---|---|---|---|
| Name | `Singularity Inc. Idle Tycoon` | `Singularity Inc.: Idle Tycoon` | ✗ (colon only) |
| Subtitle | `AI Data-Center Empire Builder` | same | ✓ |
| Keywords | 99 chars | same | ✓ |
| Promotional text | "The biggest update yet: hire a team…" | same | ✓ |
| What's New (1.1) | — | `release_notes.txt` | ✓ |
| Description | 2,452 chars | 2,468 chars | ✗ see below |
| Privacy URL | `https://wrexist.github.io/SINGULARITY/privacy/` | — | ✓ 200 |
| Support URL | `https://wrexist.github.io/SINGULARITY/support/` | — | ✓ 200 |
| Marketing URL | `https://wrexist.github.io/SINGULARITY/features/` | — | ✓ |
| Category | Games → Simulation | Games → Simulation | ✓ |

- **Only 1 of 50 locales is live.** ASC has en-US only, while the repo has 50 validated
  locales. Locales can only be added along with a new version. This is the biggest
  discoverability lever found: most impressions come from non-English storefronts, and the
  only review asks for Chinese.
- **Description:** the live text has every em dash removed. Some became commas ("BUY YOUR
  DATA, LEGALLY, OR NOT"; "Plays offline, your lab keeps earning"), and others were just
  deleted, leaving broken sentences: "Time to build God or at least a profitable API",
  "as you scale no two labs look alike", "world events viral demos, GPU shortages, open
  letters, talent wars shake up every run", "do it all again faster", "the AI industry
  this one's for you". Fix it in the next version, either with the repo copy or with a
  deliberate no-em-dash rewrite (then update the repo to match).
- **Name:** ASC has no colon. The repo's `name.txt` has one. The name only changes with
  the owner's go; suggest making the repo match ASC instead.
- **Promotional text proposal (en-US), for when the next build is live** (not applied).
  The handoff's draft is 158 characters, which fits under the 170 limit:
  > New: press the Big Red Button, start a Cold War with rival labs, and clear weekly
  > Sponsor Weeks to climb the Sponsor Tiers. Still no ads. Still no pay-to-win.
- **Screenshots:** iPhone 6.5" ×6 and iPad 12.9" ×6 sets are present (the
  `01-hero`…`06-honest` files). There is no separate 6.9" set; 6.5" is accepted in its
  place. ASC is also announcing iPhone Duo screenshots, which will be required from
  April 2027 for apps built with the iOS 27.1 SDK.
- **App preview:** one iPhone 6.5" preview, `singularity-trailer-vertical.mp4`, delivered
  ✓. There is none for iPad.
- **Repo fix:** the repo docs had the URLs in lowercase (`/singularity/`), which 404 on
  GitHub Pages because paths there are case-sensitive. Fixed. ASC was already right.

---

## In-App Events, custom product pages, PPO (§5–§7)

- **In-App Events:** none exist. `EVENTS.md` was regenerated (12 Sponsor Weeks from
  Oct 12, plus the update event). No drafts have been created yet; see "Waiting on the
  owner".
- **Custom product pages:** none exist.
- **Product Page Optimization:** no test is running or has ever run. Traffic is far too
  low for a test. At ~8 unique page views a day, an A/B split wouldn't reach confidence in
  any reasonable window. Treatment A (3D hero) is gated on 3D becoming the default.
  Treatment B needs a screenshot that doesn't exist yet.

## Game Center (§8)

- Game Center isn't set up for the app at all: no Game Center detail, no leaderboards, no
  achievements, and nothing toggled on version 1.1. That matches the plan (the plugin
  isn't in a build).
- No records have been created yet; see "Waiting on the owner". The App ID capability in
  the developer portal hasn't been checked yet.

## App privacy, age rating, review info (§9)

- **App Privacy:** "Data Not Collected", published 2026-06-30. That was before
  RevenueCat was added (`693cc3a`, `659e19b`), and RevenueCat ships in the subscription
  build. RevenueCat's App Store privacy guidance says apps using it should declare
  **Purchases → Purchase History** (used for App Functionality, and Analytics if you use
  their charts). Check whether **Identifiers** also apply, based on whether a custom app
  user ID is set. As things stand, the label is probably **incomplete**. Owner decision:
  don't change it without a go.
- **Age rating:** 4+, with every questionnaire answer "None/No" (simulated gambling:
  None; mature themes: None; loot boxes: No; contests: None).
  - The live game's dark-web Data Bazaar is a risk/reward mechanic with random outcomes
    and no real money. The review notes explain this, and Review accepted it.
  - The Big Red Button (next build) is a press-your-luck gamble with in-game effects
    only. Under Apple's definition, "Simulated Gambling" means simulating casino-style
    gambling. This mechanic is closer to a random event than to casino play, so "None" is
    defensible. If Review pushes back, answering "Infrequent/Mild" raises the rating.
    Mention it in the review notes (draft below) rather than changing the rating.
- **App Review Information:** the contact name, phone and email are present ✓, no demo
  account is needed ✓, and there are notes ✓. **But the notes are stale:** they describe
  "one optional non-consumable, 'Premium' ($6.99), under Settings → Premium". They need
  updating with the next version (draft below).

---

## Drafts for the next version (§11)

### What's New (en-US), 625 chars

```
Three new ways to stir up trouble:

• The Big Red Button: press it for a surge of Compute, or a small fire. You never quite know which
• Rival Cold War: rival labs now answer back. Escalate, stand down, or out-ship them
• Sponsor Weeks: clear 5 of 7 daily sponsor goals each week to bank Reputation and climb the Sponsor Tiers
• 3D Lab (beta, Settings): the hall moves and reacts to your taps, with a roaming ops bot, crowds that come and go, and storms that roll over the roof
• Smoother, calmer and a little brighter everywhere, plus fixes

Still no ads. Still no pay-to-win. Thanks for playing. Tell us what to build next.
```

(The App Store rating prompt is left out on purpose.)

### App Review notes (replace the stale ones)

```
Singularity Inc. is a single-player, offline idle/tycoon game. No account or login is required.

Getting started: it plays immediately on launch. Your data center generates Compute over time; spend it on a Training Run to earn Data and Money, then buy hardware and research. Progress accrues while the app is closed.

In-app purchases (optional, never pay-to-win): Singularity Pro, a subscription group with Pro Yearly ($24.99, 7-day free trial) and Pro Weekly ($4.99), plus Pro Lifetime ($39.99, non-consumable). All three unlock the same perks: 2x offline earnings, a 24-hour offline cap, autopilots one Ship sooner, and Pro-only hall themes and rack skins. The paywall shows on first launch and from Settings > See Pro plans. Restore is on the paywall and in Settings.

Satire note: the game satirizes the AI industry. The "Data Bazaar / dark web" and the "Big Red Button" are fictional risk/reward mechanics with random in-game outcomes only. No real money is wagered, nothing can be cashed out, and neither can be bought with real money. Neither is gambling.
```

(Edit the weekly trial line if the owner removes that trial.)

---

## Changes made (old → new)

| Where | Old | New |
|---|---|---|
| `appstore/METADATA.md` URLs, `ASC_HANDOFF.md` §4 | `wrexist.github.io/singularity/...` (404) | `wrexist.github.io/SINGULARITY/...` |
| `appstore/in-app-events/EVENTS.md` | dates from the last run | regenerated (Sponsor Weeks from Oct 12) |
| App Store Connect | — | **no changes** |

---

## Waiting on the owner

- [ ] **Weekly free trial:** keep or remove the 7-day trial on Pro Weekly? The plan says
      yearly-only.
- [ ] **Privacy label:** add Purchases → Purchase History (and Identifiers if they apply)
      for RevenueCat?
- [ ] **Next version:** add the 49 missing locales, fix the en-US description (em dashes),
      replace the stale review notes, and paste the What's New draft.
- [ ] **Drafts to create in ASC:** In-App Event drafts (Big Red Button + Sponsor Weeks),
      3 custom product page drafts, and Game Center leaderboard records. They're ready to
      do, but are low-value until the next build ships (see "Recommended next steps").
- [ ] **After the next build is live:** apply the new promotional text, and publish the
      Big Red Button event and the upcoming Sponsor Weeks.

---

## What players say

There is only one written review, so there are no recurring themes yet. The one signal is
a 5★ from Hong Kong asking for Chinese.

Draft reply (not posted):
> 谢谢！中文版已经在路上了——下一个版本见。
> ("Thanks! Chinese is on its way. See you in the next version.")

Only post it once the localized build is actually live.

---

## Recommended next steps

1. **Ship the next build with all 50 locales.** Most impressions are non-English, and
   that is the cheapest growth available. Fix the description and review notes in the
   same submission.
2. **Fix the privacy label** before or with that submission, to avoid a rejection or
   takedown for undeclared purchase-data collection.
3. **Decide on the weekly trial** before any marketing push.
4. **Skip CPPs and PPO for now.** At ~8 unique page views a day, there isn't enough
   traffic to split. Put the effort into In-App Events, which add impressions on their own
   (event cards show in search and browse), once the build with Sponsor Weeks is live.
5. **Request the Analytics Reports API** "App Store Discovery and Engagement" reports
   now, so search-term data exists by the time a title test is worth running.
