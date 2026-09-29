# Pro subscription — store setup checklist

The game code for Pro (paywall, perks, RevenueCat) is in the repo. These store-side steps
have to be done by the account owner. Do them in order; about 25 min total.

## Recommended prices (why)

| Plan | Product ID | Price (USD) | Trial |
|---|---|---|---|
| **Yearly** (preselected, "Best value") | `com.wrexist.singularityinc.pro.yearly` | **$24.99** | **7 days free** |
| Weekly | `com.wrexist.singularityinc.pro.weekly` | **$4.99** | none |
| Lifetime (existing Premium) | `com.wrexist.singularityinc.premium` | raise **$6.99 → $39.99** | n/a |

- The paywall shows Yearly as ~$0.48/week next to Weekly at $4.99/week, a 90% saving. That contrast is what pushes most buyers to yearly, and weekly still earns well from people who want Pro for a short burst.
- Only the yearly plan gets the trial, so the trial also steers people to yearly.
- Lifetime has to cost more than ~1.5 years of yearly, or it undercuts the subscription. At $6.99 almost everyone would pick it.
- Weekly plans convert impulse buyers but churn fast and can draw "too expensive" reviews. Watch refunds and ratings for the first two weeks.
- Idle-game benchmarks: $19.99–$29.99/year and $2.99–$4.99/week. Try $19.99 vs $29.99 yearly later with App Store price tests.

## 1. App Store Connect → Subscriptions (10 min)

1. **Distribution → Monetization → Subscriptions → Create subscription group**
   - Reference name: `Singularity Pro`
   - Group display name (App Store localization): `Singularity Pro`
2. **Create subscription → Pro Yearly**
   - Reference name `Pro Yearly`, Product ID `com.wrexist.singularityinc.pro.yearly`, Duration **1 year**
   - Price: **$24.99** (US base, let Apple set the other countries)
   - Localization (en-US): Display name `Pro Yearly` · Description `2x offline earnings, Pro themes, autopilots`
   - **Introductory offer → Free → 1 week**, all countries, new subscribers
   - Review screenshot: the in-game paywall (Settings → See Pro plans). Review note: "Open Settings > Pro to see the paywall."
3. **Create subscription → Pro Weekly**
   - Product ID `com.wrexist.singularityinc.pro.weekly`, Duration **1 week**, price **$4.99**
   - Localization: `Pro Weekly` · `2x offline earnings, Pro themes, autopilots`
   - Same screenshot and note. No intro offer.
4. **Level order in the group:** Yearly = level 1, Weekly = level 2.
5. **In-App Purchases → Premium Unlock**: change price to **$39.99**. Optionally rename the display name to `Pro Lifetime`.
6. On the **1.1 version page → In-App Purchases and Subscriptions**, add both subscriptions. A brand-new subscription must be submitted together with an app version.
7. Check that the **Paid Apps agreement** is active (Business → Agreements). Subscriptions won't load without it.

## 2. RevenueCat (10 min) — project "Singularity Inc. Idle Tycoon" already exists

1. **Apps → App Store app** (form already filled: `com.wrexist.singularityinc`):
   **In-app purchase key → Add new key**: upload your In-App Purchase `.p8` (App Store Connect →
   Users and Access → Integrations → In-App Purchase), plus Key ID and Issuer ID. Save.
   Optional: also add the App Store Connect API key, so products can be imported automatically.
2. **Product catalog → Products → Import** (or add manually) the three product IDs above.
3. **Entitlements → New → identifier `pro`** → attach all three products.
4. **Offerings → `default`** (mark as current) → packages:
   `$rc_annual` → pro.yearly · `$rc_weekly` → pro.weekly · `$rc_lifetime` → premium
5. **API keys** → copy the app's **public** iOS key (`appl_…`).

## 3. GitHub (2 min)

Repo → Settings → Secrets and variables → Actions → **New secret** `RC_IOS_KEY` = the `appl_…` key.
The TestFlight workflow bakes it in and prints "Purchases: RevenueCat" in its log. Without the
secret, the build falls back to direct StoreKit and offers only the Lifetime plan.

## 4. Build and test (15 min, needs your iPhone)

1. Run the **iOS TestFlight** workflow with marketing version `1.1.0` (becomes build 27+).
2. Install from TestFlight, sign in with a **sandbox** Apple ID (Settings → App Store → Sandbox Account).
3. The paywall should show on first launch. Buy Yearly: the sheet should say "1 week free". Also try Weekly.
   Check that Pro perks turn on, then kill and relaunch the app and **Restore**.
4. In App Store Connect, attach the new build to 1.1 and submit.
