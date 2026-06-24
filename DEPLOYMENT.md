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
| `ASC_KEY_P8` | The API key — store the **raw `.p8` contents** (`-----BEGIN PRIVATE KEY-----` block) |

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
