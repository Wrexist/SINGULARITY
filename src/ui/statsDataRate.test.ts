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
import { barRates, effRate, fmt } from "./format";
import { createInitialState } from "../engine/state";
import { derive } from "../engine/derive";
import type { GameState } from "../engine/types";

/**
 * Lab Stats "Data / sec" (bug hunt r4, number formatting). The row — and the sparkline
 * beside it — read derive's dataPerSec, which is only the passive scraper lane. Once
 * auto-train runs the lab, nearly all Data arrives as run payouts, so a lab climbing
 * 66.8Qa Data a second read "Data / sec 0" in Lab Stats while the resource bar above it
 * showed 66.8Qa/s. The bar was fixed to count runs (they restart themselves); the stats
 * row that exists to trend that same number was not.
 */

const statValue = (html: string, label: string) =>
  new RegExp(`${label}</span>(?:<span class="stat-spark[^"]*">.*?</span>)?<span[^>]*>(.*?)</span>`).exec(html)?.[1] ?? null;

function autoTrainingLab(): GameState {
  const s = createInitialState();
  s.upgrades = { ...s.upgrades, rack_basic: 20, auto_claim: 1, auto_train: 1 };
  s.computeFocus = 1;
  return s;
}

describe("Lab Stats Data / sec", () => {
  it("reads the Data rate the resource bar shows once runs restart themselves", () => {
    const s = autoTrainingLab();
    const d = derive(s);
    expect(d.autoTrain).toBe(true);
    expect(d.dataPerSec.eq(0)).toBe(true); // no scrapers: the passive lane is empty
    const shown = effRate(d, "data", s.computeFocus);
    expect(shown.gt(0)).toBe(true);
    const html = renderToStaticMarkup(createElement(StatsPanel, { game: s, derived: d }));
    expect(statValue(html, "Data / sec")).toBe(fmt(shown));
  });

  it("is still the passive lane while training is held or hand-run", () => {
    const held = { ...autoTrainingLab(), computeFocus: 0 };
    const d = derive(held);
    expect(barRates(held, d).data.eq(d.dataPerSec)).toBe(true);
    const html = renderToStaticMarkup(createElement(StatsPanel, { game: held, derived: d }));
    expect(statValue(html, "Data / sec")).toBe(fmt(d.dataPerSec));
  });
});
