# Game Center setup (owner actions)

The app side of Game Center is **fully wired and shipped** (IMPROVEMENTS #18):

- `src/ui/gameCenter.ts` is the bridge:
  - Ships and ascensions leaderboard scores are submitted after every prestige.
  - In-game achievement unlocks mirror to Game Center.
  - A "Game Center" row appears in Settings.
- **Everything is a silent no-op until a native plugin named `GameConnect` is
  installed.** Builds without it are completely unaffected: no dead buttons, no errors.

## The plugin lives in this repo (2026-10)

No maintained npm plugin supports Capacitor 7. The only one,
`@openforge/capacitor-game-connect`, is still on Capacitor 5. So the plugin is now
written in-repo at **`native/game-connect/`**:

- It's a small Swift wrapper over Apple's GameKit.
- It exposes exactly the four calls the bridge makes: `signIn`, `submitScore`,
  `unlockAchievement` and `showLeaderboard`.
- It ships a CocoaPods podspec (what CI uses) and an SPM manifest.

It is **not installed yet**. Swift can't be compiled in the cloud environment that
wrote it, so it needs one verified build on a Mac or TestFlight before it rides a
release.

## Steps to light it up

1. **Install the plugin** (one line in `package.json`, then `npm install`):

   ```json
   "@singularity/capacitor-game-connect": "file:native/game-connect"
   ```

   CI's `scripts/ios-prepare.mjs` notices the plugin. It then adds the
   **Game Center entitlement** (`com.apple.developer.game-center`) to the App target
   automatically, and `cap sync ios` links the pod. No manual Xcode step is needed in
   CI. Locally, `npm run cap:sync` does the same.
2. **App Store Connect → your app → Features → Game Center**, create:
   - Leaderboard `singularity.ships`: "Models Shipped", integer, best = highest.
   - Leaderboard `singularity.ascensions`: "AGI Ascensions", integer, best = highest.
   - Achievements with ids `singularity.ach.<in-game id>` for each achievement you
     want mirrored. The in-game ids are in `src/engine/achievements.ts`. Unmapped ids
     fail silently, so you can start with a handful (e.g. `first_ship`, `compute_1m`)
     and add more later.

   These ids are defined in one place in code, `GC_IDS` in `src/ui/gameCenter.ts`.
3. **Enable Game Center on the App ID** (developer portal → Identifiers → the app →
   Game Center) if it isn't already. CI signs with `-allowProvisioningUpdates`, so the
   profile picks it up.
4. **Ship a TestFlight build and verify:**
   - Settings shows the "Game Center" row.
   - The first Ship after launch prompts the Game Center sign-in (use the sandbox
     account on a dev build).
   - The leaderboard sheet opens from Settings.

   If the build fails in the plugin's Swift, remove the `package.json` line and the
   next build is exactly as before.

**Why it matters:** besides leaderboards, Game Center games are surfaced in Apple's
Games app. That's a free discovery channel.

## Privacy note

Game Center is invoked purely through Apple's OS services. The app itself still sends
nothing anywhere ("Data Not Collected" continues to hold for the app's own telemetry
posture). Game Center participation is governed by the player's Apple account settings,
and players who decline sign-in lose nothing: every call no-ops quietly.
