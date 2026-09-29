# Pro subscription — store setup checklist

The game code for Pro (paywall, perks, RevenueCat) is in the repo. These store-side steps
have to be done by the account owner. Do them in order; about 25 min total.

## Recommended prices (why)

| Plan | Product ID | Price (USD) | Trial |
|---|---|---|---|
| **Yearly** (preselected, "Best value") | `com.wrexist.singularityinc.pro.yearly` | **$24.99** | **7 days free** |
| Monthly | `com.wrexist.singularityinc.pro.monthly` | **$4.99** | none |
| Lifetime (existing Premium) | `com.wrexist.singularityinc.premium` | raise **$6.99 → $39.99** | n/a |

- Yearly at ~$2.08/month against a $4.99 monthly reads as a 58% saving. That price gap is what pushes most buyers to yearly.
- Only the yearly plan gets the trial, so the trial also steers people to yearly.
- Lifetime has to cost more than ~1.5 years of yearly, or it undercuts the subscription. At $6.99 almost everyone would pick it.
- Idle-game benchmarks: $19.99–$29.99/year and $2.99–$6.99/month. Try $19.99 vs $29.99 later with App Store price tests.

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
3. **Create subscription → Pro Monthly**
   - Product ID `com.wrexist.singularityinc.pro.monthly`, Duration **1 month**, price **$4.99**
   - Localization: `Pro Monthly` · `2x offline earnings, Pro themes, autopilots`
   - Same screenshot and note. No intro offer.
4. **Level order in the group:** Yearly = level 1, Monthly = level 2.
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
   `$rc_annual` → pro.yearly · `$rc_monthly` → pro.monthly · `$rc_lifetime` → premium
5. **API keys** → copy the app's **public** iOS key (`appl_…`).

## 3. GitHub (2 min)

Repo → Settings → Secrets and variables → Actions → **New secret** `RC_IOS_KEY` = the `appl_…` key.
The TestFlight workflow bakes it in and prints "Purchases: RevenueCat" in its log. Without the
secret, the build falls back to direct StoreKit and offers only the Lifetime plan.

## 4. Build and test (15 min, needs your iPhone)

1. Run the **iOS TestFlight** workflow with marketing version `1.1.0` (becomes build 27+).
2. Install from TestFlight, sign in with a **sandbox** Apple ID (Settings → App Store → Sandbox Account).
3. The paywall should show on first launch. Buy Yearly: the sheet should say "1 week free".
   Check that Pro perks turn on, then kill and relaunch the app and **Restore**.
4. In App Store Connect, attach the new build to 1.1 and submit.
