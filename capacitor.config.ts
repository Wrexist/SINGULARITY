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
    // Edge to edge: the web page paints under the status bar itself, so the strip
    // takes the page colour in Light AND Dark. The top chrome clears the notch /
    // Dynamic Island with env(safe-area-inset-top) (see styles.css), and the status
    // text colour follows the theme via @capacitor/status-bar (src/ui/appearance.ts).
    // "always" inset the web view below a native strip that stayed light in Dark.
    contentInset: "never",
    // The native view behind the web view: seen only before the page's first paint
    // and wherever WKWebView shows its own background (e.g. a rubber-band bounce the
    // page doesn't cover). Light, matching the Light surface and the launch splash;
    // it can't follow the theme from here, which is why the page paints everything.
    backgroundColor: "#eef1f8",
  },
};

export default config;
