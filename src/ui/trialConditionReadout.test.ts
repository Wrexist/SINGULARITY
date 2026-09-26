import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrialsPanel } from "./TrialsPanel";
import { DataMarketPanel } from "./DataMarketPanel";
import { createInitialState } from "../engine/state";
import { trialConditionMet } from "../engine/trials";
import { CONDITION_THRESHOLDS } from "../engine/balance/trials";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * A running condition Trial must show the condition the Ship checks (bug hunt r7,
 * goal copy parity). Only Solo Run had a readout. Running Hot ("Heat 60 or higher")
 * and Apolitician ("alignment inside ±0.4") showed nothing, and the only Heat readout,
 * the Data Bazaar meter, rounded 59.5 up to "60%" while trialConditionMet refused it:
 * a player shipped on a "60" and lost the whole generation's Trial.
 */

const noop = () => {};
const trials = (g: GameState) => renderToStaticMarkup(createElement(TrialsPanel, { game: g, onStart: noop, onAbandon: noop }));
const market = (g: GameState) =>
  renderToStaticMarkup(createElement(DataMarketPanel, { game: g, onBuyData: noop, onBuyTool: noop, onLobby: noop }));
const status = (html: string) => [...html.matchAll(/<span class="trial-status"[^>]*>([^<]*)</g)].map((m) => m[1]!);

function running(id: string, patch: Partial<GameState> = {}): GameState {
  const s = createInitialState();
  s.prestige = { ships: 20, legacyWeights: Big.of(1e6) };
  s.stats.totalShips = 20;
  return { ...s, activeTrial: id, research: ["backprop"], ...patch };
}

describe("Running Hot shows the Heat condition the Ship checks", () => {
  it("59.6 Heat: not met, and the meter does not read 60%", () => {
    const g = running("trial_hot", { heat: CONDITION_THRESHOLDS.hot - 0.4 });
    expect(trialConditionMet(g)).toBe(false);
    const line = status(trials(g)).find((s) => s.startsWith("Condition"));
    expect(line).toBeDefined();
    expect(line).toContain(`Heat ${CONDITION_THRESHOLDS.hot} or higher`);
    expect(line).toContain("not met");
    expect(market(g)).not.toContain(`${CONDITION_THRESHOLDS.hot}%`);
  });

  it("60 Heat: met", () => {
    const g = running("trial_hot", { heat: CONDITION_THRESHOLDS.hot });
    expect(trialConditionMet(g)).toBe(true);
    expect(status(trials(g)).find((s) => s.startsWith("Condition"))).toContain("met ✓");
    expect(market(g)).toContain(`${CONDITION_THRESHOLDS.hot}%`);
  });
});

describe("Apolitician shows the alignment condition the Ship checks", () => {
  it("committed to a side: not met", () => {
    const g = running("trial_neutral", { alignment: CONDITION_THRESHOLDS.neutralBand });
    expect(trialConditionMet(g)).toBe(false);
    const line = status(trials(g)).find((s) => s.startsWith("Condition"));
    expect(line).toContain(`±${CONDITION_THRESHOLDS.neutralBand}`);
    expect(line).toContain("not met");
  });

  it("at the center: met", () => {
    const g = running("trial_neutral", { alignment: 0 });
    expect(status(trials(g)).find((s) => s.startsWith("Condition"))).toContain("met ✓");
  });
});

describe("Solo Run keeps its readout", () => {
  it("empty roster: met", () => {
    expect(status(trials(running("trial_solo"))).find((s) => s.startsWith("Condition"))).toContain("no staff on the roster — met ✓");
  });
});
