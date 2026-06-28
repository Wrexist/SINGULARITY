/**
 * Tiered upgrade flavor (R7.1) — the satire layer the GDD names as a core wedge.
 * Most upgrades have one static description across every level; the heavily-bought
 * ones (racks especially) get escalating jokes at owned-count breakpoints, so the
 * 50th rack reads differently from the 1st. Pure data + a pure selector — the UI
 * just shows whatever string this returns, so there's nothing to break visually.
 */

interface FlavorTier {
  /** Show this line once you own at least this many. */
  at: number;
  text: string;
}

/** Per-upgrade escalating flavor, ascending by `at`. The base (level-0) line stays
 *  in `balance.upgrades[].desc` and is used as the fallback below `at` of the first
 *  tier — so these only ADD escalation, never replace the original copy. */
const UPGRADE_FLAVOR: Record<string, FlavorTier[]> = {
  rack_basic: [
    { at: 6, text: "One shelf became several. The hum is now a drone." },
    { at: 16, text: "Your landlord has questions about the power bill." },
    { at: 30, text: "Technically a 'compute facility' now. Technically." },
  ],
  rack_server: [
    { at: 8, text: "An aisle of blinking servers. You feel important." },
    { at: 20, text: "The cooling bill rivals a small nation's GDP." },
  ],
  rack_tpu: [
    { at: 5, text: "Pods upon pods. The future is loud." },
    { at: 15, text: "You no longer remember what a CPU is." },
  ],
  overclock: [
    { at: 4, text: "The fans scream. You call it 'productivity'." },
    { at: 9, text: "One does not simply cool this. One prays." },
  ],
};

/**
 * The flavor line to show for an upgrade at its current owned count: the
 * highest-threshold tier the player has reached, or `fallback` (the upgrade's
 * base description) when none applies. Pure.
 */
export function upgradeFlavor(id: string, owned: number, fallback: string): string {
  const tiers = UPGRADE_FLAVOR[id];
  if (!tiers) return fallback;
  let line = fallback;
  for (const tier of tiers) {
    if (owned >= tier.at) line = tier.text;
    else break; // tiers are ascending; the first unreached one ends the search
  }
  return line;
}
