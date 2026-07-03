# Game Center setup (owner actions)

The app side of Game Center is **fully wired and shipped** (IMPROVEMENTS #18):

- `src/ui/gameCenter.ts` — the bridge. Ships/ascensions leaderboard submits fire
  after every prestige; in-game achievement unlocks mirror to Game Center; a
  "Game Center" row appears in Settings.
- **Everything is a silent no-op until a native plugin named `GameConnect` is
  installed.** The current web + TestFlight builds are completely unaffected —
  no dead buttons, no errors.

## Why the plugin isn't in package.json yet

The only maintained plugin, [`@openforge/capacitor-game-connect`](https://github.com/openforge/capacitor-game-connect),
is at 5.0.2 and peers on **Capacitor 5**; this app is on **Capacitor 6**.
Installing it today would risk breaking the iOS build (untested native API
mismatch), which can only be verified on a Mac/Xcode — not in this environment.

## Steps to light it up

1. **Wait for (or fork) Capacitor 6 support.** Watch the openforge repo for a
   6.x release, or fork and bump `@capacitor/core` peer + `Package.swift`/podspec
   (the GameKit API surface it uses is stable). Alternatively any plugin that
   exposes `signIn / submitScore / unlockAchievement / showLeaderboard` under the
   plugin name `GameConnect` works — the bridge targets that de-facto API.
2. `npm install @openforge/capacitor-game-connect` (once compatible), then
   `npm run cap:sync`.
3. **Xcode:** add the **Game Center capability** to the app target
   (Signing & Capabilities → + Capability → Game Center).
4. **App Store Connect → Features → Game Center:** create
   - Leaderboard `grp.singularity.ships` — "Models Shipped", integer, best = highest.
   - Leaderboard `grp.singularity.ascensions` — "AGI Ascensions", integer, best = highest.
   - Achievements with ids `grp.singularity.ach.<in-game id>` for each achievement
     you want mirrored (in-game ids are in `src/engine/achievements.ts`; unmapped
     ids fail silently, so you can start with a handful — e.g. `first_ship`,
     `compute_1m` — and add more later).
   These ids are defined in ONE place in code (`GC_IDS` in `src/ui/gameCenter.ts`)
   if you prefer different naming.
5. Ship a TestFlight build and verify: Settings should now show the
   "Game Center" row; the first prestige after launch should prompt the Game
   Center sign-in (or use the sandbox account on a dev build).

## Privacy note

Game Center is invoked purely through Apple's OS services. The app itself still
sends nothing anywhere ("Data Not Collected" continues to hold for the app's own
telemetry posture); Game Center participation is governed by the player's Apple
account settings, and players who decline sign-in lose nothing — every call
no-ops quietly.
