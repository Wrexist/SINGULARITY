import { describe, it, expect, vi } from "vitest";

// Lab Stats renders nothing but its header until tapped open; hold it open so the
// server render shows the rows (the panel's only hook is this one useState).
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useState: <T,>(_init: T) => [true as unknown as T, () => {}] as const };
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StatsPanel } from "./StatsPanel";
import { fmtMult } from "./format";
import { createInitialState } from "../engine/state";
import { derive, legacyMultiplier } from "../engine/derive";
import { legacyAvailable } from "../engine/legacyTree";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * Lab Stats multipliers (bug hunt r4, number formatting). The four multiplier rows went
 * through the resource formatter, which keeps one decimal under 10: a lab that shipped
 * early with 3 Legacy Weights (a real ×1.04) read "Legacy boost ×1.0" — as if the ship
 * had done nothing — while the Ship panel quoted the same boost as ×1.04, and a −4%
 * stance on Compute read "Compute multiplier ×1.0".
 */

const statValue = (html: string, label: string) =>
  new RegExp(`${label}</span><span[^>]*>(.*?)</span>`).exec(html)?.[1] ?? null;

function earlyShipper(): GameState {
  const s = createInitialState();
  s.prestige = { legacyWeights: Big.of(3), ships: 1 };
  s.stats.totalShips = 1;
  return s;
}

describe("Lab Stats multipliers", () => {
  it("fmtMult: two decimals while small, the compact format once big", () => {
    expect(fmtMult(Big.of(1.0433))).toBe("1.04");
    expect(fmtMult(Big.of(0.96))).toBe("0.96");
    expect(fmtMult(Big.of(1))).toBe("1.00");
    expect(fmtMult(Big.of(99.999))).toBe("100");
    expect(fmtMult(Big.of(2.5e11))).toBe("250B");
  });

  it("an early ship's ×1.04 Legacy boost reads as the Ship panel quotes it", () => {
    const s = earlyShipper();
    const d = derive(s);
    expect(d.legacyMult.toNumber()).toBeCloseTo(1.0433, 3);
    const stats = renderToStaticMarkup(createElement(StatsPanel, { game: s, derived: d }));
    expect(statValue(stats, "Legacy boost")).toBe("×1.04");
    // The Ship panel's "Held weights … (×1.04)" reads the same boost the same way.
    expect(fmtMult(legacyMultiplier(legacyAvailable(s)))).toBe("1.04");
  });

  it("a −4% Compute stance does not read ×1.0", () => {
    const s = createInitialState();
    s.alignment = -0.4;
    const d = derive(s);
    expect(d.computeMult.toNumber()).toBeCloseTo(0.96, 6);
    const stats = renderToStaticMarkup(createElement(StatsPanel, { game: s, derived: d }));
    expect(statValue(stats, "Compute multiplier")).toBe("×0.96");
  });
});
