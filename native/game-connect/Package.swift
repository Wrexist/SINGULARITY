// swift-tools-version: 5.9
import PackageDescription

// Swift Package Manager manifest, for a project that uses SPM instead of CocoaPods.
let package = Package(
    name: "SingularityCapacitorGameConnect",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "SingularityCapacitorGameConnect", targets: ["GameConnectPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "7.0.0")
    ],
    targets: [
        .target(
            name: "GameConnectPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/GameConnectPlugin"
        )
    ]
)
