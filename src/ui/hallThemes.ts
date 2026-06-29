/**
 * Cosmetic hall themes — PRESENTATION only (no image assets, no gameplay effect;
 * GDD §7 cosmetic-only). A theme is just a CSS filter applied to the hall <canvas>,
 * so it's a one-line, zero-risk re-tint of the parametric render. The id / name /
 * unlock condition live in `src/engine/balance/cosmetics.ts` (data) + `cosmetics.ts`
 * (pure unlock logic); this file maps each id to its visual filter + picker swatch.
 */
export interface ThemeStyle {
  /** CSS filter applied to the hall <canvas>. */
  filter: string;
  /** Swatch gradient for the picker. */
  swatch: string;
}

const STYLES: Record<string, ThemeStyle> = {
  classic: { filter: "", swatch: "linear-gradient(135deg,#2f7bf6,#16b364)" },
  neon: { filter: "hue-rotate(38deg) saturate(1.5) brightness(1.05)", swatch: "linear-gradient(135deg,#22d3ee,#a855f7)" },
  sunset: { filter: "hue-rotate(-42deg) saturate(1.4) brightness(1.03)", swatch: "linear-gradient(135deg,#ff8c42,#ff385c)" },
  blueprint: { filter: "saturate(0.22) brightness(1.08) contrast(1.05)", swatch: "linear-gradient(135deg,#9aa4b2,#5b6472)" },
  vaporwave: { filter: "hue-rotate(255deg) saturate(1.55) brightness(1.05)", swatch: "linear-gradient(135deg,#ff6ad5,#26c6da)" },
  synthwave: { filter: "hue-rotate(292deg) saturate(1.6) brightness(1.04)", swatch: "linear-gradient(135deg,#e835a0,#4338ca)" },
  carbon: { filter: "grayscale(0.7) brightness(0.92) contrast(1.12)", swatch: "linear-gradient(135deg,#3a3f47,#15171b)" },
  matrix: { filter: "hue-rotate(75deg) saturate(1.7) brightness(0.96)", swatch: "linear-gradient(135deg,#22c55e,#064e3b)" },
  inferno: { filter: "hue-rotate(-24deg) saturate(1.8) brightness(1.02)", swatch: "linear-gradient(135deg,#ff4d2e,#7c1d0c)" },
  platinum: { filter: "grayscale(0.4) brightness(1.12) contrast(0.98)", swatch: "linear-gradient(135deg,#e8edf3,#aab4c2)" },
  midnight: { filter: "hue-rotate(200deg) saturate(0.8) brightness(0.85)", swatch: "linear-gradient(135deg,#1e3a8a,#0b1224)" },
  iridescent: { filter: "hue-rotate(180deg) saturate(1.7) brightness(1.08)", swatch: "linear-gradient(135deg,#a855f7,#22d3ee,#f5b40a)" },
  gold: { filter: "hue-rotate(14deg) saturate(1.25) sepia(0.2) brightness(1.05)", swatch: "linear-gradient(135deg,#f5b40a,#ff8c42)" },
};

export function themeStyle(id: string): ThemeStyle {
  return STYLES[id] ?? STYLES.classic!;
}

/** Picker swatches for rack skins (R6.3) — approximate the in-hall tint so the chip
 *  previews the look. Purely presentational. */
const SKIN_SWATCH: Record<string, string> = {
  classic: "linear-gradient(135deg,#34d27e,#3f86f0,#9b51e0)",
  mono: "linear-gradient(135deg,#5b6472,#2b3039)",
  frost: "linear-gradient(135deg,#7ee8ff,#3f86f0)",
  ember: "linear-gradient(135deg,#ff7a3d,#e83a2e)",
  synth: "linear-gradient(135deg,#ff5fd2,#a855f7)",
  aurora: "linear-gradient(135deg,#5effc0,#7ee8ff,#c08bff)",
  gold: "linear-gradient(135deg,#f5d020,#f5b40a)",
};

export function skinSwatch(id: string): string {
  return SKIN_SWATCH[id] ?? SKIN_SWATCH.classic!;
}

export function themeFilter(id: string): string {
  return themeStyle(id).filter;
}
