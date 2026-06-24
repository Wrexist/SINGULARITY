import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor shell config. The web app (Vite `dist/`) is wrapped into the native
 * iOS project. `appId` MUST match the bundle ID in the App Store Connect app
 * record and in Fastlane Match (see DEPLOYMENT.md).
 */
const config: CapacitorConfig = {
  appId: "com.wrexist.singularityinc",
  appName: "Singularity Inc.",
  webDir: "dist",
  ios: {
    contentInset: "always",
    backgroundColor: "#0d1124", // matches the hall's dark room so launch is seamless
  },
};

export default config;
