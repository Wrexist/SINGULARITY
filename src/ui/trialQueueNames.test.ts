import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TrialsPanel } from "./TrialsPanel";
import { createInitialState } from "../engine/state";
import { queueTrial, trialDefs } from "../engine/trials";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * The Trials list's queue buttons (bug hunt r5, accessibility). Every ladder card ends
 * in the same button, and each one's only name was its text — "Next run" — so a
 * VoiceOver user heard "Next run, toggle button" eight times over with nothing saying
 * WHICH Trial each would queue (the rotor's button list was eight identical rows). The
 * button was also a 28px pill, well under the 44pt the rest of the app's small
 * controls reach through the shared hit-area rule.
 */

const noop = () => {};
const render = (game: GameState) =>
  renderToStaticMarkup(createElement(TrialsPanel, { game, onStart: noop, onAbandon: noop }));

function veteran(ships: number): GameState {
  const s = createInitialState();
  s.prestige = { ships, legacyWeights: Big.of(1e6) };
  s.stats.totalShips = ships;
  return s;
}

/** Each queue button's accessible name (aria-label, else its text) and pressed state. */
function queueButtons(html: string): { name: string; pressed: string | null }[] {
  return [...html.matchAll(/<button class="trial-attempt[^"]*"([^>]*)>([^<]*)</g)].map((m) => {
    const attrs = m[1]!;
    const label = /aria-label="([^"]*)"/.exec(attrs)?.[1];
    return { name: label ?? m[2]!, pressed: /aria-pressed="(true|false)"/.exec(attrs)?.[1] ?? null };
  });
}

describe("Trial queue buttons are told apart", () => {
  it("names the Trial each button queues", () => {
    const html = render(veteran(40));
    const btns = queueButtons(html);
    expect(btns.length).toBeGreaterThan(2);
    const names = btns.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
    // Each name carries the Trial shown on its own card.
    const cards = html.split('<div class="trial-card').slice(1);
    for (const c of cards) {
      const trial = /<span class="trial-name">([^<]*)/.exec(c)?.[1];
      const b = queueButtons(c)[0];
      if (!trial || !b) continue;
      expect(b.name).toContain(trial);
    }
  });

  it("keeps the name steady when queued; the pressed state carries the change", () => {
    const s = veteran(40);
    const first = queueButtons(render(s))[0]!;
    const id = trialDefs().find((d) => first.name.includes(d.name))!.id;
    const queued = queueButtons(render(queueTrial(s, id))).find((b) => b.pressed === "true")!;
    expect(queued.name).toBe(first.name);
  });

  it("gives the pill a 44pt hit area", () => {
    const css = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8");
    // The shared rule: `<selectors>::after { content: ""; position: absolute; top: max(...` .
    const rule = /((?:[.\w\s-]+::after,\s*)*[.\w\s-]+::after)\s*\{\s*content: "";\s*position: absolute;\s*top: max\(var\(--hit-cap-y/.exec(css);
    expect(rule).not.toBeNull();
    const selectors = rule![1]!.split(",").map((x) => x.trim());
    expect(selectors).toContain(".trial-attempt::after");
  });
});
