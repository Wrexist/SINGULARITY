import Foundation
import Capacitor
import GameKit

/// Game Center for Singularity Inc. — the "GameConnect" plugin that src/ui/gameCenter.ts
/// targets (signIn / submitScore / unlockAchievement / showLeaderboard). Every method
/// resolves or rejects exactly once; the web side treats any rejection as "Game Center
/// unavailable" and stays silent, so a player who declines loses nothing.
@objc(GameConnectPlugin)
public class GameConnectPlugin: CAPPlugin, CAPBridgedPlugin, GKGameCenterControllerDelegate {
    public let identifier = "GameConnectPlugin"
    public let jsName = "GameConnect"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unlockAchievement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showLeaderboard", returnType: CAPPluginReturnPromise)
    ]

    /// GameKit may call the authenticate handler more than once (a sign-in sheet, then
    /// the result; again later if the account changes). Only the first outcome answers
    /// the JS promise.
    @objc func signIn(_ call: CAPPluginCall) {
        let player = GKLocalPlayer.local
        if player.isAuthenticated {
            call.resolve(["player_name": player.displayName])
            return
        }
        var settled = false
        player.authenticateHandler = { [weak self] viewController, error in
            DispatchQueue.main.async {
                if let viewController = viewController {
                    self?.bridge?.viewController?.present(viewController, animated: true)
                    return
                }
                if settled { return }
                settled = true
                if player.isAuthenticated {
                    call.resolve(["player_name": player.displayName])
                } else {
                    call.reject(error?.localizedDescription ?? "Game Center is unavailable")
                }
            }
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard let leaderboardID = call.getString("leaderboardID"),
              let score = call.getInt("totalScoreAmount") else {
            call.reject("leaderboardID and totalScoreAmount are required")
            return
        }
        GKLeaderboard.submitScore(score, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [leaderboardID]) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    @objc func unlockAchievement(_ call: CAPPluginCall) {
        guard let achievementID = call.getString("achievementID") else {
            call.reject("achievementID is required")
            return
        }
        let achievement = GKAchievement(identifier: achievementID)
        achievement.percentComplete = 100
        achievement.showsCompletionBanner = true
        GKAchievement.report([achievement]) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    @objc func showLeaderboard(_ call: CAPPluginCall) {
        guard let leaderboardID = call.getString("leaderboardID") else {
            call.reject("leaderboardID is required")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let presenter = self.bridge?.viewController else {
                call.reject("No view controller to present from")
                return
            }
            let sheet = GKGameCenterViewController(leaderboardID: leaderboardID, playerScope: .global, timeScope: .allTime)
            sheet.gameCenterDelegate = self
            presenter.present(sheet, animated: true)
            call.resolve()
        }
    }

    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }
}
