import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrialsPanel } from "./TrialsPanel";
import { createInitialState } from "../engine/state";
import { canQueueTrial, queueTrial, startTrial, trialDefs } from "../engine/trials";
import { Big } from "../engine/math/Big";
import type { GameState } from "../engine/types";

/**
 * Chaining a Trial ladder from the panel (bug hunt r3). The engine lets a player queue
 * a ladder's NEXT rung while the current rung is running, so the Ship that banks rung I
 * starts rung II (trialQueue.test.ts, "chains a ladder"). The panel hid the whole
 * ladder card while its rung ran ("shown above"), so that queue could never be made:
 * each rung of a ladder cost two generations instead of one.
 */

const noop = () => {};
const render = (game: GameState) =>
  renderToStaticMarkup(createElement(TrialsPanel, { game, onStart: noop, onAbandon: noop }));

const U1 = trialDefs().find((d) => d.id === "trial_unplugged")!;
const U2 = trialDefs().find((d) => d.id === "trial_unplugged_r2")!;
const A1 = trialDefs().find((d) => d.id === "trial_ablation")!;
const A3 = trialDefs().find((d) => d.id === "trial_ablation_r3")!;

function veteran(ships: number): GameState {
  const s = createInitialState();
  s.prestige = { ships, legacyWeights: Big.of(1e6) };
  s.stats.totalShips = ships;
  return s;
}

/** The ladder card for a rung, by its name, and whether its button is live. */
function card(html: string, name: string): { found: boolean; enabled: boolean; queued: boolean } {
  const cards = html.split('<div class="trial-card').slice(1);
  const c = cards.find((x) => x.includes(`<span class="trial-name">${name}`));
  if (!c) return { found: false, enabled: false, queued: false };
  const btn = /<button class="trial-attempt[^"]*"([^>]*)>([^<]*)</.exec(c);
  return { found: true, enabled: !!btn && !/disabled/.test(btn[1]!), queued: !!btn && btn[2]!.startsWith("Queued") };
}

describe("a running rung offers the next rung of its ladder", () => {
  it("shows Unplugged II as queueable while Unplugged I runs", () => {
    const running = { ...startTrial(veteran(U2.unlockShips), U1.id), research: ["backprop"] };
    expect(running.activeTrial).toBe(U1.id);
    expect(canQueueTrial(running, U2.id)).toBe(true); // the engine allows the chain…
    const html = render(running);
    const next = card(html, U2.name);
    expect(next.found).toBe(true); // …and the panel now offers it
    expect(next.enabled).toBe(true);
  });

  it("shows the queued next rung as Queued", () => {
    const running = { ...startTrial(veteran(U2.unlockShips), U1.id), research: ["backprop"] };
    const queued = queueTrial(running, U2.id);
    expect(queued.queuedTrial).toBe(U2.id);
    const next = card(render(queued), U2.name);
    expect(next.found).toBe(true);
    expect(next.queued).toBe(true);
  });

  it("shows the next rung locked while the ship count is short of it", () => {
    const running = startTrial(veteran(A1.unlockShips), A1.id);
    const next = card(render(running), `${A1.name} II`);
    expect(next.found).toBe(true);
    expect(next.enabled).toBe(false);
  });

  it("offers nothing more for a ladder whose last rung is the one running", () => {
    const top = veteran(A3.unlockShips);
    const done = { ...top, trialsDone: [A1.id, `${A1.id}_r2`] };
    const running = startTrial(done, A3.id);
    expect(running.activeTrial).toBe(A3.id);
    const html = render(running);
    // The running rung is the active card above; there is no ladder card for it.
    expect(html.match(new RegExp(`trial-name">${A3.name}`, "g"))?.length ?? 0).toBe(1);
    expect(html).toContain(`${A3.name} — running`);
  });
});
