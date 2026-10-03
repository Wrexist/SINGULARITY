# DEPLOYMENT.md — iOS / TestFlight
*Singularity Inc. Capacitor → iOS → TestFlight. Current as of June 2026 — re-verify Apple's requirements before each release cycle; they change.*

> **Phase note:** This is Phase 1 work. Do NOT set up deployment during Phase 0 — the flat-UI prototype doesn't ship. This doc exists so it's ready when the loop passes its fun-gate.

---

## 0. Hard requirements (2026)
- **Paid Apple Developer Program membership** (free Apple IDs cannot distribute via TestFlight).
- **Xcode 26 + iOS 26 SDK is mandatory** for all App Store Connect uploads since April 28, 2026. Build target SDK = iOS 26.2 (or latest). Deployment target may be lower (iOS 16/17) to keep older-OS users.
- **macOS machine** (archiving requires Xcode, which is macOS-only).
- **App record created in App Store Connect** with a unique bundle ID.
- **App Store Connect role:** "App Manager" or "Admin" to update build info/testers (the "Developer" role can upload but not manage testers).

## 1. One-time setup
1. Enroll / confirm Apple Developer Program is active.
2. In App Store Connect: create the app record, set bundle ID (e.g. `com.wrexist.singularityinc`), primary language, SKU.
3. Reuse existing **Fastlane Match** repo for signing (already set up across the owner's apps). Add this app's bundle ID to Match; pull the distribution cert + provisioning profile. Do NOT hand-generate new certs.
4. Create an **App Store Connect API key** (Users and Access → Integrations → App Store Connect API). Store the key ID, issuer ID, and `.p8` securely. JWT-based auth is cleaner than app-password auth and sidesteps 2FA in CI.
5. Add `PrivacyInfo.xcprivacy` to the iOS target; declare required-reason APIs (UserDefaults for saves, any file-timestamp/disk APIs). A local-only game is light here, but don't skip it — it's a common rejection.

## 2. Build pipeline (Capacitor → IPA)
```bash
# 1. Build the web app
npm run build

# 2. Sync web assets into the native iOS project
npx cap sync ios

# 3. Open in Xcode (for manual archive) OR drive via Fastlane (below)
npx cap open ios
```
Before archiving in Xcode:
- Set build config to **Release**.
- Bump **version** and **build number** (build number must increase every upload).
- Select **Any iOS Device (arm64)** as the destination.
- **Product → Archive**, then in Organizer: **Validate App** first (catches most issues pre-review), then **Distribute App → App Store Connect**.

## 3. Automated upload (recommended — Fastlane)
A `Fastfile` lane keeps this one command and removes human signing error:
```ruby
platform :ios do
  desc "Build and upload to TestFlight"
  lane :beta do
    # match(type: "appstore")  # reuse existing Match setup
    build_app(
      scheme: "App",                 # Capacitor's default iOS scheme
      export_method: "app-store",
      configuration: "Release"
    )
    upload_to_testflight(
      api_key_path: "./fastlane/asc_api_key.json",  # App Store Connect API key (JWT)
      skip_waiting_for_build_processing: true,
      # itc_provider: "YOUR_PROVIDER_ID",  # REQUIRED on multi-provider accounts w/ Xcode 26
      changelog: "Phase 1 beta — core loop, hall, prestige."
    )
  end
end
```
Run: `bundle exec fastlane beta`

> **Xcode 26 multi-provider gotcha:** the owner has multiple apps, so the account is likely associated with multiple providers. If using username/app-password auth, `upload_to_testflight` needs `itc_provider` / `--provider-public-id` or the upload fails. Using the **API key (JWT)** path above avoids this entirely — prefer it.

## 4. TestFlight distribution
1. After upload, the build processes in Apple's system (email when done; usually <30 min, sometimes longer).
2. Complete **export compliance** (Cryptography / US export). A game with no custom encryption → typically the simple "no" path, but answer honestly; HTTPS-only standard usage is usually exempt.
3. **Internal testing:** add internal testers (up to 100, must be in your team). Instant, no review. Use this first.
4. **External testing:** create a group, add testers by email or **public link** (up to 10,000). External builds need a **Beta App Review** (lighter than full App Review, usually fast).
5. Provide **test info**: what to test, beta description, feedback email. Testers install the **TestFlight app**, redeem invite/link, and can submit feedback + screenshots in-app.
6. A build is testable for **90 days** from upload.

## 5. Pre-submission checklist
- [ ] Built with Xcode 26 / iOS 26 SDK
- [ ] Build number incremented
- [ ] `PrivacyInfo.xcprivacy` present and accurate
- [ ] Age-rating questionnaire completed (Apple updated this in 2026 — re-answer it)
- [ ] Validate App passed in Organizer
- [ ] Export compliance answered
- [ ] Premium IAP configured in App Store Connect (if testing purchases) + sandbox tester ready
- [ ] Screenshots: reuse the in-game era-transition "milestone moments" as source assets (per GDD §8 — don't repeat the Dynasty Manager UK-ASA screenshot thread that's still open; bake marketing assets out of the game)

## 5b. In-app purchase (premium unlock) — StoreKit setup

> **RevenueCat (from 1.1):** when the build carries a RevenueCat public iOS SDK key,
> purchases and restores go through RevenueCat (`src/ui/iapRevenueCat.ts`); without
> one the app keeps the direct StoreKit path below. Put the app's App Store key
> (`appl_…`, RevenueCat → API keys) in the GitHub secret **`RC_IOS_KEY`**. The
> TestFlight log prints which backend the build uses.
>
> **RevenueCat project setup** ("Singularity Inc. Idle Tycoon" → App Store app
> `com.wrexist.singularityinc`, with the In-App Purchase Key .p8 uploaded):
>
> | Product (App Store Connect) | Type | Package in offering `default` |
> |---|---|---|
> | `com.wrexist.singularityinc.pro.yearly` — Pro Yearly | auto-renewable (group "Pro") | `$rc_annual` |
> | `com.wrexist.singularityinc.pro.weekly` — Pro | auto-renewable (group "Pro") | `$rc_weekly` |
> | `com.wrexist.singularityinc.premium` — Pro Lifetime | non-consumable | `$rc_lifetime` |
>
> 1. **Products:** import all three (Product catalog → Products).
> 2. **Entitlement `pro`:** attach all three products. The app checks only `pro`
>    (`RC_ENTITLEMENT_ID`); the lifetime product id also counts on its own, so a
>    purchase grants even before it is attached.
> 3. **Offering `default`**, marked *current*, with the three packages above. The
>    app reads packages by type (Annual / Weekly / Lifetime), so their order and the
>    offering's identifier don't matter — whichever offering is current is sold.
> 4. **Paywall (optional, remote switch):** design one in RevenueCat → Paywalls for
>    the current offering, then add offering **metadata** `{"paywall": "revenuecat"}`.
>    The app then presents RevenueCat's paywall (`RevenueCatUI.presentPaywall`)
>    instead of its own `ProPaywall`; remove the key to switch back. No app update
>    either way. Without the key the in-app paywall stays (it follows this app's
>    design rules, and works on the direct-StoreKit and web builds too).
> 5. **Customer Center:** RevenueCat → Customer Center (the defaults work; add a
>    support email and the cancel/refund paths you want). Pro subscribers open it from
>    Settings → *Manage subscription* (RevenueCat builds only).
>
> **Testing with the Test Store** (simulated purchases — no App Store account, no
> money): `.env.development` carries the project's Test Store key (`test_…`).
> `npm run cap:sync:dev`, then run from Xcode with the **Debug** configuration. A
> production bundle ignores `test_` keys and CI fails if `RC_IOS_KEY` holds one: the
> native SDK deliberately crashes a Release build configured with a Test Store key.
>
> **Native project:** the Paywall / Customer Center pod (RevenueCatUI) needs **iOS
> 15+**. `scripts/ios-prepare.mjs` scaffolds `ios/` when missing and raises the
> deployment target (Capacitor 7's template targets 14); `cap:sync`,
> `cap:sync:dev` and CI run it before `cap sync ios`.

The premium unlock uses **`cordova-plugin-purchase` (CdvPurchase v13)** — a
self-contained, on-device StoreKit integration (no third-party billing backend).
Code lives in `src/ui/iap.ts` behind a stable interface; the entitlement flag is
in `src/state/premium.ts`. On web/dev the purchase is a local stub (so the UI is
testable); on a device it calls real StoreKit.

**Product:** non-consumable, id `com.wrexist.singularityinc.premium`, ~$6.99.

**One-time setup (do this once the app record exists):**
1. App Store Connect → your app → **In-App Purchases** → **+** → **Non-Consumable**.
   - Product ID: `com.wrexist.singularityinc.premium` (must match `PREMIUM_PRODUCT_ID`).
   - Set price tier (~$6.99), display name, description, and a review screenshot.
   - Submit it (a non-consumable can be reviewed alongside the first app build).
2. Fill in the **Paid Apps agreement** + banking/tax in ASC, or IAPs won't load.
3. The CI workflow already runs `cap sync`, which picks up the plugin's native
   side from `package.json` — **no manual Xcode step** needed for the plugin.

**Testing (device required — IAPs do NOT work in the simulator):**
1. ASC → **Users and Access → Sandbox → Testers**: create a sandbox Apple ID.
2. On the device, install the TestFlight build, open **Settings → App Store →
   Sandbox Account** and sign in with the sandbox tester.
3. In-app: Settings → **Unlock $6.99** → should show the real StoreKit sheet;
   complete it → "Founder" status. Test **Restore** on a fresh install too.

> ⚠️ The native path is written against the documented CdvPurchase v13 API but
> can only be verified on a real device with the product live in ASC. Verify the
> purchase + restore flow on device before the public release. The web stub is
> what the automated tests/QA exercise.

## 6. Common failure modes (and the fix)
- **Rejected at upload, SDK error** → not built with iOS 26 SDK. Open in Xcode 26, clean build.
- **Code-signing failures** → refresh Match (`fastlane match appstore`), confirm the right team/profile in Xcode, confirm the bundle ID matches App Store Connect.
- **Build never appears** → wait for the processing email; check the Activity tab in App Store Connect for errors.
- **Third-party SDK breaks on iOS 26 SDK** → update packages (`File > Packages > Update`). A local-only idle game should have minimal deps, which is an advantage — keep it that way.
- **External testers can't install** → build still in Beta App Review, or export compliance not completed.

---

## 7. Building WITHOUT a Mac — the cheap CI path (what we're using)
No Mac, so the archive→sign→upload runs on GitHub's **macOS runners**. We mirror
the **Silicon Tech Tycoon** pipeline (proven on the owner's other app) and improve
it. Implemented in `.github/workflows/ios-testflight.yml`. **No Fastlane, no Match,
no cert repo** — the cheapest, simplest signing path:

- **Xcode automatic (cloud-managed) signing** driven by the App Store Connect API
  key (`xcodebuild -allowProvisioningUpdates -authenticationKey*`). Apple creates
  and manages the distribution cert + profile for you — nothing to store or rotate.
- Upload to TestFlight via `xcrun altool --upload-app` with the same API key.

**Flow:** `npm ci` → `npm run build` → `cap add/sync ios` (the `ios/` project is
generated fresh each run; gitignored) → set `ITSAppUsesNonExemptEncryption=false`
+ build number from the run number → `xcodebuild archive` → `exportArchive` → upload.

**Trigger:** Actions tab → "iOS TestFlight" → *Run workflow*, OR push a tag
`ios-v*` (`git tag ios-v0.1.0 && git push --tags`).

### Secrets — you already have everything needed

| Secret | Used for |
|---|---|
| `APPLE_TEAM_ID` | `DEVELOPMENT_TEAM` for signing |
| `ASC_KEY_ID`, `ASC_ISSUER_ID` | App Store Connect API key id + issuer |
| `ASC_KEY_P8` | The API key. **Preferred: base64** — `base64 -i AuthKey_XXXX.p8 \| pbcopy`, then paste that (sidesteps the newline-mangling that causes CryptoKit `invalidPEMDocument` at archive time). The raw `-----BEGIN PRIVATE KEY-----` block is also accepted — the workflow auto-detects which form you pasted. |

**No extra secrets required.** `MATCH_PASSWORD` (and the MATCH_GIT_* ones I'd
previously asked for) are **not used** by this path — you can delete `MATCH_PASSWORD`
if you like, or leave it.

### One-time prerequisites (Apple side — only you can do these)
1. **Apple Developer Program** active (paid, $99/yr — the only unavoidable cost).
2. **App record in App Store Connect** with bundle ID **`com.wrexist.singularityinc`**
   (must equal `capacitor.config.ts`). The upload fails without it.
3. The ASC API key role must be **Admin** or **App Manager** so cloud signing can
   create the distribution cert/profile.

### Cheapest-cost notes
- macOS Actions minutes bill at 10× private-repo rate. Builds are infrequent (a
  few per release, ~10–15 min each), so this fits a small budget. If you want it
  **completely free**, make the repo public → unlimited Actions minutes.
- No Match repo means one less private repo and zero cert maintenance.

### Honest status
**Scaffolded, not yet verified** — there's no Mac here to run it. The first CI run
will likely need a tweak (runner Xcode version, the export `method` string, or the
app record). Create the app record, run the workflow, and paste me the log — I'll
iterate from the real errors. **TestFlight isn't "ready" until that first green run.**

## 8. Dark appearance and the iOS status bar

Settings → Appearance (Light / Dark / Match device, default Light) is pure web: it
sets `data-theme` on `<html>` and the stylesheet swaps its colour tokens. The iOS
shell is set up so the status bar follows it:

- **Edge to edge.** `capacitor.config.ts` has `ios.contentInset: "never"`, so
  WKWebView runs under the status bar and the page paints that strip itself — light
  in Light, dark in Dark. (It used to be `"always"`: the web view sat below a native
  strip painted from `ios.backgroundColor`, which stayed light in Dark.)
- **Safe areas in CSS.** The header, the sticky resource bar (and its opaque slab),
  the pinned iPad hall column, toasts, modals, the celebration card and the bottom
  nav all pad with `env(safe-area-inset-*)`, read through overridable custom
  properties: `var(--sat, env(safe-area-inset-top, 0px))` (and `--sab`, `--sal`,
  `--sar`). Nothing in the app sets `--sat`; a browser layout check sets it on
  `<html>` to fake a notch, since `env()` can't be faked outside a device.
- **Status text colour.** `@capacitor/status-bar` (6.x, matching `@capacitor/core` 6)
  is called from `src/ui/appearance.ts` at startup and on every theme change, on
  device only: Light → `Style.Light` (dark text), Dark → `Style.Dark` (light text).
  Without it iOS picks the text colour from the SYSTEM appearance, i.e. white text
  over the Light app on a phone in dark mode. The CI Info.plist step pins
  `UIViewControllerBasedStatusBarAppearance` to YES, which the plugin needs.
- **Native background.** `ios.backgroundColor` stays `#eef1f8` (the Light surface
  and the launch splash). It only shows before the page's first paint and wherever
  WKWebView shows its own background, e.g. a rubber-band bounce the page doesn't
  cover. The page sets `overscroll-behavior-y: none` and the pinned bar overdraws
  120px above itself, so a Dark player should not see it; the checklist confirms.

### TestFlight check list (before shipping this build)

On one notch iPhone (e.g. 13/14) and one Dynamic Island iPhone (14 Pro or later), and
once on a home-button iPhone (SE) if you have one:

1. **Status text, system in light mode:** app in Light → dark text; switch to Dark
   → light text; Match device → dark text.
2. **Status text, system in dark mode:** app in Light → dark text (this is the case
   that used to show white text on the light app); Dark → light text; Match device →
   light text.
3. **Live flip:** with Match device on, open Control Center and toggle Dark Mode with
   the app open — the page and the status text flip together.
4. **Notch / Dynamic Island:** at rest the brand sits fully below the island; scroll
   the Lab — the resource bar pins just below it, and nothing (cards, the hall)
   shows through the strip behind the clock and battery, in both themes.
5. **Overlays:** open Settings, a product detail, the offline recap (background the
   app for a few minutes) and ship a model — no card, close button or title under the
   island or the home indicator.
6. **Landscape:** rotate — nothing under the island on the side, the bottom nav
   clears the home indicator. On a Pro Max (split layout) the brand and the resource
   bar clear the island, with no seam beside the bar.
7. **Overscroll bounce colour:** pull down hard at the top and push up at the bottom
   in both themes — the bounce shows the page colour, never a light band in Dark.
8. **Launch:** cold start in Dark — note whether a light flash shows between the
   splash and the first frame (that's `ios.backgroundColor`; acceptable if brief).
