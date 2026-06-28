/**
 * Cosmetic collection (R6.3) — DATA only. Hall themes the player earns by playing,
 * turning the cosmetic layer into a durable cross-reset chase (GDD §7, cosmetic-only).
 *
 * Each theme is purely visual (a CSS filter applied to the hall canvas — see
 * src/ui/hallThemes.ts for the filter/swatch presentation). Unlock conditions read
 * ONLY monotonic lifetime stats (totalShips, ascensions, peak compute, …), so an
 * earned theme can NEVER re-lock after a prestige. Zero gameplay effect → the tuned
 * curve is untouched. Humour lives in the blurbs (the design spine).
 */

export type CosmeticUnlock =
  | { kind: "free" }
  | { kind: "premium" }
  | { kind: "ships"; n: number }
  | { kind: "ascensions"; n: number }
  | { kind: "peakCompute"; n: number }
  | { kind: "totalMoney"; n: number }
  | { kind: "productsLaunched"; n: number }
  | { kind: "worldEvents"; n: number }
  | { kind: "playtimeHours"; n: number };

export interface ThemeDef {
  id: string;
  name: string;
  /** Satirical one-liner shown in the collection (the chase + the voice). */
  blurb: string;
  unlock: CosmeticUnlock;
}

/** Source of truth for theme id / name / unlock. Presentation (filter, swatch) is
 *  keyed by the same id in src/ui/hallThemes.ts. Order = display order. */
export const themes: ThemeDef[] = [
  // — Always available (the starting wardrobe) —
  { id: "classic", name: "Classic", blurb: "The honest blue-and-green of a lab that still has investors.", unlock: { kind: "free" } },
  { id: "neon", name: "Neon", blurb: "For when the GPUs aren't the only thing running hot.", unlock: { kind: "free" } },
  { id: "sunset", name: "Sunset", blurb: "Golden hour over the server farm. Very LinkedIn.", unlock: { kind: "free" } },
  { id: "blueprint", name: "Blueprint", blurb: "Desaturated and serious. You read the whitepaper, twice.", unlock: { kind: "free" } },
  // — Earned by playing (the collection chase) —
  { id: "vaporwave", name: "Vaporwave", blurb: "Ship two models and unlock your aesthetic phase.", unlock: { kind: "ships", n: 2 } },
  { id: "synthwave", name: "Synthwave", blurb: "Launch five products; bask in the retro-future glow.", unlock: { kind: "productsLaunched", n: 5 } },
  { id: "carbon", name: "Carbon", blurb: "Four ships deep. Matte black, like your soul and your racks.", unlock: { kind: "ships", n: 4 } },
  { id: "matrix", name: "Mainframe Green", blurb: "Hit 1M Compute/s. There is no spoon, only throughput.", unlock: { kind: "peakCompute", n: 1_000_000 } },
  { id: "inferno", name: "Inferno", blurb: "Survive 15 world events. The regulators know your name.", unlock: { kind: "worldEvents", n: 15 } },
  { id: "platinum", name: "Platinum", blurb: "Earn $1B all-time. The valuation is fake but the chrome is real.", unlock: { kind: "totalMoney", n: 1_000_000_000 } },
  { id: "midnight", name: "Midnight Oil", blurb: "Five hours in. Sleep is a deprecated dependency.", unlock: { kind: "playtimeHours", n: 5 } },
  { id: "iridescent", name: "Iridescent", blurb: "Ascend to AGI once. The hall shimmers with post-human regret.", unlock: { kind: "ascensions", n: 1 } },
  // — Premium nod —
  { id: "gold", name: "Founder Gold", blurb: "You backed the lab early. Wear it.", unlock: { kind: "premium" } },
];

/** Rack skins (R6.3) — a SECOND cosmetic axis, independent of the hall theme: recolours
 *  the server racks themselves (parametric HSL tint in the renderer, no assets). Same
 *  earn-by-play model + monotonic unlocks. id "classic" is the default (identity). */
export const rackSkins: ThemeDef[] = [
  { id: "classic", name: "Classic", blurb: "Honest factory colours, tier by tier.", unlock: { kind: "free" } },
  { id: "mono", name: "Matte Black", blurb: "Ship one model; paint everything the colour of focus (and fingerprints).", unlock: { kind: "ships", n: 1 } },
  { id: "frost", name: "Frostbyte", blurb: "Hit 100K Compute/s. Run them cold, run them blue.", unlock: { kind: "peakCompute", n: 100_000 } },
  { id: "ember", name: "Overclocked", blurb: "Survive 10 events; let the racks glow like they feel it.", unlock: { kind: "worldEvents", n: 10 } },
  { id: "synth", name: "Hotpink HPC", blurb: "Launch four products. Compute, but make it a personality.", unlock: { kind: "productsLaunched", n: 4 } },
  { id: "aurora", name: "Aurora", blurb: "Ascend to AGI. The racks shimmer in colours that don't have names yet.", unlock: { kind: "ascensions", n: 1 } },
  { id: "gold", name: "Gold-Plated", blurb: "Founder flex: solid-gold heatsinks, terrible thermals.", unlock: { kind: "premium" } },
];
