import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { directivePickWaiting } from "./repSignal";
import { createInitialState } from "../engine/state";
import { pickEndowmentDirective, reputationBalance as R } from "../engine/reputation";
import type { GameState } from "../engine/types";

/**
 * Every ten Endowment levels earn a free Directive pick (a permanent +30% lane
 * doctrine), and the reward waits until the player chooses. The pick was only visible
 * INSIDE the Reputation sheet: nothing on the Lab tab, the HQ segment or the HQ
 * Reputation strip said one was waiting, so an endgame lab could sit on several
 * unclaimed doctrines for days. A calm, wordless dot now marks the path (Lab → HQ →
 * the Reputation strip) while a pick waits, and clears the moment it is taken.
 */

function endowedLab(level: number, picked: string[] = []): GameState {
  const s = createInitialState();
  return {
    ...s,
    reputation: { spent: 0, perks: R.perks.map((p) => p.id) },
    repEndowment: level,
    endowmentDirectives: picked,
  };
}

describe("an earned Endowment Directive pick has a signal outside the sheet", () => {
  it("is waiting only while an earned pick is unclaimed", () => {
    expect(directivePickWaiting(createInitialState())).toBe(false);
    expect(directivePickWaiting(endowedLab(R.endowment.directives.interval - 1))).toBe(false);
    const lab = endowedLab(R.endowment.directives.interval);
    expect(directivePickWaiting(lab)).toBe(true);
    const picked = pickEndowmentDirective(lab, R.endowment.directives.defs[0]!.id);
    expect(directivePickWaiting(picked)).toBe(false);
  });

  it("the Lab nav, the HQ segment and the Reputation strip all carry the dot", () => {
    const app = readFileSync(fileURLToPath(new URL("./App.tsx", import.meta.url)), "utf8");
    const prestige = readFileSync(fileURLToPath(new URL("./PrestigePanel.tsx", import.meta.url)), "utf8");
    expect(app.match(/pick-dot/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(prestige).toMatch(/pick-dot/);
  });

  it("the dot is static (nothing to degrade under reduced motion)", () => {
    const css = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8");
    const rules = [...css.matchAll(/([^{}]*pick-dot[^{}]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) expect(r[2]).not.toMatch(/animation/);
  });
});
