import { describe, it, expect, vi } from "vitest";

// Lab Stats renders nothing but its header until tapped open; hold it open so the
// server render shows the rows (the panel's only hook is this one useState).
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useState: <T,>(_init: T) => [true as unknown as T, () => {}] as const };
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CharterPanel } from "./CharterPanel";
import { StatsPanel } from "./StatsPanel";
import { fmtSignedPct } from "./format";
import { createInitialState } from "../engine/state";
import { derive } from "../engine/derive";
import { shiftAlignment } from "../engine/alignment";
import { doctrineBalance } from "../engine/doctrine";
import type { GameState } from "../engine/types";

/**
 * A small faction lean (bug hunt r4, number formatting). Faction choices move the
 * stance by two-decimal steps of different sizes (+0.32 one way, −0.30 the other), so
 * two opposite picks leave a lab at ±0.02 — a real tilt of +0.3% Compute and −0.2% $.
 * Every signed percent on the Stance row and in Lab Stats rounded to a whole percent,
 * so that tilt read "+0% compute · 0% $ · +1% heat": a +0% that changes something,
 * and a "0%" that is really a loss (Math.round(−0.2) is −0, which prints as "0").
 */

const noop = () => {};

/** A revealed lab at the start of a run, leaning +0.02 after two opposite picks. */
function leaning(delta1: number, delta2: number): GameState {
  const s = createInitialState();
  s.prestige.ships = doctrineBalance.revealAtShips + 1;
  s.alignment = shiftAlignment(shiftAlignment(0, delta1), delta2);
  return s;
}

/** A whole-percent "+0%" or a signless "0%": what a nonzero effect must never read. */
const ZERO_PCT = /(^|[^\d.])[+-]?0%/;

describe("small signed percentages", () => {
  it("never read a nonzero effect as +0% or 0%", () => {
    expect(fmtSignedPct(0.003)).toBe("+0.3%");
    expect(fmtSignedPct(-0.002)).toBe("-0.2%");
    expect(fmtSignedPct(0.0004)).toBe("+<0.1%");
    expect(fmtSignedPct(-0.0004)).toBe("-<0.1%");
    // Whole percents stay whole, as every existing label reads them.
    expect(fmtSignedPct(0.06)).toBe("+6%");
    expect(fmtSignedPct(-0.35)).toBe("-35%");
    expect(fmtSignedPct(0.0096)).toBe("+1%");
  });

  it("the Stance row shows a +0.02 lean's real tilt", () => {
    const s = leaning(0.32, -0.3);
    expect(s.alignment).toBeCloseTo(0.02, 10);
    const html = renderToStaticMarkup(createElement(CharterPanel, { game: s, onSet: noop, onLock: noop, onStance: noop }));
    const fx = /<p class="stance-fx">(.*?)<\/p>/.exec(html)?.[1] ?? "";
    expect(fx).toContain("+0.3% compute");
    expect(fx).toContain("-0.2% $");
    expect(fx).toContain("+1% heat");
    expect(fx).not.toMatch(ZERO_PCT);
  });

  it("Lab Stats shows a −0.02 lean's real tilt", () => {
    const s = leaning(-0.32, 0.3);
    expect(s.alignment).toBeCloseTo(-0.02, 10);
    const html = renderToStaticMarkup(createElement(StatsPanel, { game: s, derived: derive(s) }));
    const row = /Stance effects<\/span><span[^>]*>(.*?)<\/span>/.exec(html)?.[1] ?? "";
    expect(row).toContain("-0.2% cmp");
    expect(row).toContain("+0.3% $");
    expect(row).toContain("-1% heat");
    expect(row).not.toMatch(ZERO_PCT);
  });
});
