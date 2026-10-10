/**
 * The App Store rating request (see reviewRules for WHEN). On device it calls StoreKit
 * through the in-app-review plugin; Apple decides whether the sheet appears. Anywhere
 * else it is a no-op that reports false, so a web build never burns an ask. Loaded on
 * demand: the plugin is only needed the rare moment it is used.
 */
import { Capacitor } from "@capacitor/core";

export async function requestStoreReview(): Promise<boolean> {
  try {
    if (!Capacitor.isNativePlatform()) return false;
    const { InAppReview } = await import("@capacitor-community/in-app-review");
    await InAppReview.requestReview();
    return true;
  } catch {
    return false; // never let a store prompt break the game
  }
}
