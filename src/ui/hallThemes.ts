/**
 * Cosmetic hall themes — purely visual palette filters applied to the hall
 * canvas (no image assets, no gameplay effect; GDD §7 cosmetic-only). A theme is
 * just a CSS filter string, so it's a one-line, zero-risk re-tint of the parametric
 * render. "Founder Gold" is the premium nod; the rest are free.
 */
export interface HallTheme {
  id: string;
  name: string;
  /** CSS filter applied to the hall <canvas>. */
  filter: string;
  /** Swatch gradient for the picker. */
  swatch: string;
  premium?: boolean;
}

export const HALL_THEMES: HallTheme[] = [
  { id: "classic", name: "Classic", filter: "", swatch: "linear-gradient(135deg,#2f7bf6,#16b364)" },
  { id: "neon", name: "Neon", filter: "hue-rotate(38deg) saturate(1.5) brightness(1.05)", swatch: "linear-gradient(135deg,#22d3ee,#a855f7)" },
  { id: "sunset", name: "Sunset", filter: "hue-rotate(-42deg) saturate(1.4) brightness(1.03)", swatch: "linear-gradient(135deg,#ff8c42,#ff385c)" },
  { id: "blueprint", name: "Blueprint", filter: "saturate(0.22) brightness(1.08) contrast(1.05)", swatch: "linear-gradient(135deg,#9aa4b2,#5b6472)" },
  { id: "gold", name: "Founder Gold", filter: "hue-rotate(14deg) saturate(1.25) sepia(0.2) brightness(1.05)", swatch: "linear-gradient(135deg,#f5b40a,#ff8c42)", premium: true },
];

export function themeFilter(id: string): string {
  return HALL_THEMES.find((t) => t.id === id)?.filter ?? "";
}
