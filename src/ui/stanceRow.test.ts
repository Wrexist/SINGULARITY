import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CharterPanel } from "./CharterPanel";
import { DoctrinePanel } from "./DoctrinePanel";
import { chartersBalance } from "../engine/charter";
import { createInitialState } from "../engine/state";
import { doctrineBalance, declareStance, stanceOpen, committedSide } from "../engine/doctrine";
import { applyNegotiationChoice } from "../engine/negotiation";
import { balance } from "../engine/balance/config";
import type { GameState } from "../engine/types";

/**
 * The Stance row on the Lab Charter card (bug hunt r2). A declaration sets alignment to
 * exactly ±threshold or 0, but the regulator's Lobby / Defy and faction choices keep
 * moving it — and Chen can sit down with you in the first second of a run, while the
 * stance is still open. The row described the DECLARED point, not the lab: after a
 * Defy it lit "Center" and read "No tilt" while +3% Compute / −2% $ / +10% Heat were
 * applied, tapping Center did nothing (it already read as chosen), and past the
 * threshold it quoted the threshold's numbers instead of the live ones.
 */

const noop = () => {};
const render = (game: GameState) =>
  renderToStaticMarkup(createElement(CharterPanel, { game, onSet: noop, onLock: noop, onStance: noop }));

/** A revealed lab at the very start of a run (the stance is open). */
function fresh(): GameState {
  const s = createInitialState();
  s.prestige.ships = doctrineBalance.revealAtShips + 1;
  return s;
}

/** Chen's "Defy" branch — the regulator's sit-down can open a run. */
const DEFY = 2;
const LOBBY = 1;

/** The Stance radios in order: Safety, Center, Acceleration. */
const checked = (html: string) =>
  [...html.matchAll(/role="radio" aria-checked="(true|false)"/g)].map((m) => m[1] === "true");

const fx = (html: string) => /<p class="stance-fx">(.*?)<\/p>/.exec(html)?.[1] ?? "";

describe("the Stance row describes the lab's real alignment", () => {
  it("does not light Center, or promise no tilt, while the lab leans off-center", () => {
    const s = applyNegotiationChoice(fresh(), DEFY);
    expect(s.alignment).toBe(balance.regulator.negotiation.defy.alignment);
    expect(stanceOpen(s)).toBe(true);
    expect(committedSide(s)).toBeNull();
    const html = render(s);
    // None of the three is the lab's position, so none reads as chosen — and Center
    // stays a live button that really re-centres.
    expect(checked(html)).toEqual([false, false, false]);
    expect(fx(html)).not.toContain("No tilt");
    expect(fx(html)).toContain("+3% compute");
    expect(fx(html)).toContain("+10% heat");
  });

  it("reads the live tilt past the declared point, not the threshold's", () => {
    // Declared Safety, then Chen appeased twice: −0.4 − 0.15 − 0.15 = −0.7.
    const s = applyNegotiationChoice(applyNegotiationChoice(declareStance(fresh(), "doomer"), LOBBY), LOBBY);
    expect(s.alignment).toBeCloseTo(-0.7, 10);
    expect(stanceOpen(s)).toBe(true);
    const html = render(s);
    expect(checked(html)).toEqual([true, false, false]);
    expect(fx(html)).toContain("-35% heat");
    expect(fx(html)).not.toContain("-20% heat");
  });

  it("still reads the declared points exactly", () => {
    expect(fx(render(declareStance(fresh(), "doomer")))).toContain("+6% $ · -4% compute · -20% heat");
    expect(fx(render(declareStance(fresh(), "accel")))).toContain("+6% compute · -4% $ · +20% heat");
    const center = render(fresh());
    expect(checked(center)).toEqual([false, true, false]);
    expect(fx(center)).toContain("No tilt");
  });

  it("shows a locked lean too, not a bare Center", () => {
    const s = { ...applyNegotiationChoice(fresh(), DEFY), research: [balance.prestige.capabilityResearch] };
    expect(stanceOpen(s)).toBe(false);
    const html = render(s);
    expect(html).toContain("stance-locked-fx");
    expect(html).toContain("+3% compute");
  });
});

describe("the Doctrine panel says when a Director owner's stance locks", () => {
  const renderDoctrine = (game: GameState) =>
    renderToStaticMarkup(createElement(DoctrinePanel, { game, onClaim: noop }));
  const hintOf = (html: string, track: string) =>
    new RegExp(`${track}(?:<span[^>]*>[^<]*</span>)*</div><p class="doctrine-track-hint">(.*?)</p>`).exec(html)?.[1] ?? null;

  /** A Director owner seconds after a ship: the Director has already researched, the
   *  stance is still open (its grace), Safety declared. */
  function directorRun(): GameState {
    const s = fresh();
    s.stats.totalShips = s.prestige.ships;
    s.stats.playtimeSec = 9_000;
    s.shipLog = [{ mode: "deploy", era: 1, asc: false, gen: s.prestige.ships, atSec: 8_995 }];
    s.reputation.perks = ["rep_autoresearch"];
    s.research = ["backprop"];
    return declareStance(s, "doomer");
  }

  it("points at the grace, not at a first research that already happened", () => {
    const s = directorRun();
    expect(stanceOpen(s)).toBe(true); // research exists, yet the stance is still open
    const hint = hintOf(renderDoctrine(s), "Safety");
    expect(hint).not.toBeNull();
    expect(hint).not.toContain("first research");
    expect(hint).toContain(`${chartersBalance.directorGraceSec} seconds`);
  });

  it("keeps the research hint for everyone else", () => {
    const s = declareStance(fresh(), "doomer");
    expect(hintOf(renderDoctrine(s), "Safety")).toContain("first research");
  });
});
