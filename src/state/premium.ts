/**
 * Premium entitlement persistence — a single local flag, kept in the state layer
 * so both the store (offline cap) and the UI's IAP module can read it without a
 * layering inversion. The actual PURCHASE flow lives in src/ui/iap.ts.
 *
 * Per the GDD: premium is one generous, cosmetic/QoL unlock — never gameplay power.
 */
const KEY = "singularity.premium.v1";

export function isPremium(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setPremium(owned: boolean): void {
  try {
    localStorage.setItem(KEY, owned ? "1" : "0");
  } catch {
    /* ignore */
  }
}
