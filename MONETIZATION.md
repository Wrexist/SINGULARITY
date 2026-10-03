# Monetization lifecycle: setup playbook

The app side is built: every paywall moment is a RevenueCat **placement**, lapsed
subscribers get a **win-back** paywall, never-paid players get one **exit offer**,
and subscribers manage their plan in **Customer Center**. Each piece **stays off
until it is configured** in App Store Connect / RevenueCat, so nothing below
needs an app update. Turn things on one at a time and watch the numbers.

## The lifecycle at a glance

| Moment | Who sees it | Placement | Where it is configured |
|---|---|---|---|
| First launch | Everyone, once | `onboarding` | RevenueCat → Targeting |
| After the first Ship | Non-Pro, once (24h throttle) | `post_ship` | RevenueCat → Targeting |
| Settings → See Pro plans | Anyone without Pro | `settings` | RevenueCat → Targeting |
| Paywall closed without buying | Players who **never paid**, **once per install** | `exit` | A distinct offering on the `exit` placement |
| Subscription lapsed | Former subscribers, **once per lapse** | `winback` | App Store Connect win-back offers |
| Wants to cancel | Active subscribers (Settings → Manage subscription) | n/a | RevenueCat → Customer Center |
| Card declined at renewal | Subscribers in billing retry | n/a | App Store Connect grace period, plus Apple's in-app message |

How the app decides is in `src/ui/paywallRules.ts`: it never shows anything while
Pro is active, shows at most one automatic paywall per 24h, and never shows the exit
offer to someone who has paid before.

## 1. App Store Connect

1. **Billing Grace Period.** Go to Subscriptions → Subscription Group "Pro" →
   Billing Grace Period. Turn it on for 16 days, for all renewals. Players keep Pro
   while Apple retries a failed card; RevenueCat keeps the entitlement active during
   grace, and the app reads only that. This recovers renewals that would otherwise
   be lost, at no cost to anyone.
2. **Win-back offers (iOS 18+).** For each subscription (yearly and weekly), go to
   Subscription Prices → Win-Back Offers → Create.
   - Eligibility: paid at least 1 month (yearly) or 2 weeks (weekly); lapsed at
     least 30 days; wait between offers 180 days.
   - Suggested start: Yearly at **50% off the first year**. Weekly at **1 week at
     $0.99**, or 3 weeks at 50%.
   - Apple also promotes these offers on the App Store. The app shows the eligible
     one on its "Welcome back" paywall (`placement: winback`) and buys with it. On
     older iOS versions players see the regular price.
3. **Exit-offer product.** Create a new auto-renewable subscription *in the same
   group*, e.g. `com.wrexist.singularityinc.pro.yearly.offer`, priced about
   **40% below** the regular yearly ($14.99 against $24.99). Give it the same 7-day
   free trial as an introductory offer. A separate product is needed because the
   intro offer on the regular yearly is already the free trial.
4. **Promotional offers for Customer Center.** On the yearly and weekly
   subscriptions → Promotional Offers, add e.g. "3 months at 50% off" (yearly) or
   "1 month at 50% off" (weekly). Customer Center offers it when a subscriber taps
   Cancel. Upload the In-App Purchase key to RevenueCat so it can sign the offer.

## 2. RevenueCat

1. **Products.** Import the new `…pro.yearly.offer` and attach it to the `pro`
   entitlement.
2. **Offerings.**
   - `default` (current): `$rc_annual` = yearly, `$rc_weekly` = weekly,
     `$rc_lifetime` = premium.
   - `exit_offer`: `$rc_annual` = `…pro.yearly.offer`. Only this one package, so the
     offer stays a single clear choice.
3. **Targeting → Placements.** Create `onboarding`, `post_ship`, `settings`,
   `winback` and `exit`.
   - `exit` → `exit_offer`. The app only shows an exit offer when this placement
     returns an offering *different from the current one*, so leaving it unset keeps
     it off.
   - The others → `default` to start. Later they are where per-moment tests go,
     e.g. a post-Ship paywall that leads with yearly against one that leads with
     lifetime.
4. **Customer Center.** Enable it, add a support email, and attach the promotional
   offers from step 1.4 to the "Too expensive" and "Not using it enough" cancel
   reasons. Add "Restore purchases" and "Request refund" paths.
5. **Paywall (optional).** To try RevenueCat's own paywall on a placement's offering,
   add offering metadata `{"paywall": "revenuecat"}`. If it can't be shown, the app
   falls back to the in-app paywall.

## 3. Experiments to run (one at a time, about 2 weeks each)

Run these as RevenueCat Experiments on the relevant placement. Judge by **revenue per
install over 30 days**, not by conversion alone.

1. **Exit offer on vs off.** Point the `exit` placement at `exit_offer` for half of
   new players.
2. **Yearly price:** $24.99 vs $29.99, with the trial unchanged.
3. **Trial length on yearly:** 7 days vs 3 days.
4. **Paywall colour:** the current coral button vs the brand purple. Via the
   RevenueCat paywall, or ask for a code switch.
5. **Lifetime price:** $39.99 vs $49.99. It anchors the yearly plan's value.

## 4. What to watch (RevenueCat → Charts)

- Initial conversion, and trial → paid conversion.
- Revenue per install (30 days): the deciding number.
- Active subscriptions and churn, split by product.
- Win-back: reactivations per month.
- Billing: refunds, and recoveries during grace.

## 5. Testing before release

- **Test Store** (no Apple account): `npm run cap:sync:dev`, then run from Xcode in
  Debug. Uses the `test_` key in `.env.development`.
- **Sandbox:** a TestFlight build with the `appl_` key. Sandbox renewals are
  accelerated (a yearly renews about hourly), so a lapse and its win-back paywall
  can be seen in an afternoon. Turn off auto-renew in sandbox settings and wait for
  the expiry.
- **Web/dev preview** of the win-back and exit screens: in the browser console, run
  `localStorage.setItem("singularity.dev.offers", "1")`. This shows placeholder
  offers in web builds only.
