// Prepare the native iOS project: scaffold it if missing, then raise its
// deployment target to iOS 15.
//
// RevenueCatUI (RevenueCat Paywalls + Customer Center, via
// @revenuecat/purchases-capacitor-ui) requires iOS 15, while Capacitor 7's
// template targets iOS 14 — CocoaPods refuses to resolve the pod until both
// the Podfile platform and the Xcode project agree. `cap add ios` normally
// runs its own sync + `pod install` straight away (whenever dist/ exists), which
// would fail before the target could be raised, so the scaffold runs with
// dist/ held aside. `ios/` is gitignored and regenerated in CI. Run this before
// `cap sync ios`. Idempotent; fails loudly if the template stops matching.
import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { execSync } from "node:child_process";

const MIN = "15.0";
const PODFILE = "ios/App/Podfile";
const PBXPROJ = "ios/App/App.xcodeproj/project.pbxproj";

if (!existsSync("ios")) {
  const held = existsSync("dist");
  if (held) renameSync("dist", "dist.hold");
  try {
    execSync("npx cap add ios", { stdio: "inherit" });
  } finally {
    if (held) renameSync("dist.hold", "dist");
  }
}

function patch(path, re, replacement) {
  if (!existsSync(path)) {
    console.error(`ios-prepare: ${path} not found.`);
    process.exit(1);
  }
  const before = readFileSync(path, "utf8");
  if (!re.test(before)) {
    console.error(`ios-prepare: no deployment target found in ${path}.`);
    process.exit(1);
  }
  re.lastIndex = 0;
  const after = before.replace(re, replacement);
  if (after !== before) writeFileSync(path, after);
  console.log(`ios-prepare: ${path} → iOS ${MIN}`);
}

patch(PODFILE, /platform :ios, '[\d.]+'/g, `platform :ios, '${MIN}'`);
patch(PBXPROJ, /IPHONEOS_DEPLOYMENT_TARGET = [\d.]+;/g, `IPHONEOS_DEPLOYMENT_TARGET = ${MIN};`);
