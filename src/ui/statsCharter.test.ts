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
import { createInitialState } from "../engine/state";
import { derive } from "../engine/derive";
import type { GameState } from "../engine/types";

/**
 * The Charter row in Lab Stats (bug hunt r2). It listed only a charter's LANE tilts, so
 * the three rule-changers of the Charter Draft read wrong: Research Sprint (no lane
 * tilt at all) showed "Research Sprint · " with nothing after the dot, Product Company
 * showed only its −40% $ and hid the ×2.5 product revenue that defines it, and True
 * Believers hid its ×2 faction shifts.
 */

function withCharter(id: string): GameState {
  const s = createInitialState();
  s.prestige.ships = 8;
  s.charter = id;
  return s;
}

const charterValue = (game: GameState): string | null => {
  const html = renderToStaticMarkup(createElement(StatsPanel, { game, derived: derive(game) }));
  const m = /Charter<\/span><span[^>]*>(.*?)<\/span>/.exec(html);
  return m ? m[1]!.replace(/&#x27;/g, "'") : null;
};

describe("Lab Stats names every effect of the active charter", () => {
  it("shows a pure rule charter's rule, with no dangling separator", () => {
    const v = charterValue(withCharter("research_sprint"));
    expect(v).not.toBeNull();
    expect(v).toContain("research compute");
    expect(v).toContain("research data");
    expect(v!.trim().endsWith("·")).toBe(false);
  });

  it("keeps the rule beside the lane tilt", () => {
    const pc = charterValue(withCharter("product_company"));
    expect(pc).toContain("×2.5 product revenue");
    expect(pc).toContain("-40% $");
    const tb = charterValue(withCharter("true_believers"));
    expect(tb).toContain("×2 faction shifts");
    expect(tb).toContain("+15% data");
  });

  it("is unchanged for a lane charter", () => {
    expect(charterValue(withCharter("moonshot"))).toBe("Moonshot · +35% cmp · -15% data");
  });
});
