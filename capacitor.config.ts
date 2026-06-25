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
    // Light, matching the app surface — so the status-bar area, home-indicator
    // area, and overscroll bounce never flash the old dark navy ("blue bar").
    backgroundColor: "#eef1f8",
  },
};

export default config;
