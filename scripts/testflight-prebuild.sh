#!/usr/bin/env bash
# Pre-build hook for the shared TestFlight pipeline (Wrexist/ios-certificates).
#
# Why this exists: the Capacitor iOS native project (ios/) is intentionally
# gitignored and regenerated in CI (see .gitignore — there's no Mac locally).
# The shared pipeline only runs `npx cap sync ios`, which requires the iOS
# platform to already exist. On a clean runner it doesn't, so add it here.
# The pipeline invokes this hook after `npm ci` and before its web build +
# `cap sync`.
#
# `cap add ios` runs an internal sync that copies the web assets from webDir
# (dist/), so the web bundle must exist before we add the platform — build it
# first when it's missing. The pipeline's own `npm run build` then re-runs
# harmlessly before `cap sync`.
set -euo pipefail

if [ -d ios ]; then
  echo "ios/ already present — Capacitor iOS platform exists, nothing to do."
  exit 0
fi

echo "ios/ absent (gitignored, regenerated in CI) — bootstrapping the Capacitor iOS platform."
if [ ! -d dist ]; then
  echo "Building web assets so 'cap add' can copy them..."
  npm run build
fi
npx cap add ios
echo "Capacitor iOS platform added at ios/."
