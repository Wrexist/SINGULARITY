import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CharterPanel } from "./CharterPanel";
import { charterHand, chartersBalance } from "../engine/charter";
import { createInitialState } from "../engine/state";
import type { GameState } from "../engine/types";

/**
 * The Charter draft's cards (bug hunt r5, accessibility). Each dealt charter is a
 * toggle — tap to adopt, tap the adopted one again to drop it — but the cards were
 * plain buttons, so assistive tech announced three identical "button"s with no state:
 * nothing said which charter was adopted, or that a second tap would undo it. They
 * now expose that state with aria-pressed, like the app's other toggles (buy quantity,
 * hall themes, Trial queue).
 */

const noop = () => {};
const render = (game: GameState) =>
  renderToStaticMarkup(createElement(CharterPanel, { game, onSet: noop, onLock: noop, onStance: noop }));

function openRun(): GameState {
  const s = createInitialState();
  s.prestige.ships = chartersBalance.unlockAtShips + 2;
  return s;
}

const cards = (html: string) =>
  [...html.matchAll(/<button class="charter-card[^"]*"([^>]*)>/g)].map((m) => /aria-pressed="(true|false)"/.exec(m[1]!)?.[1] ?? null);

describe("Charter draft cards expose their adopted state", () => {
  it("marks no card pressed before a pick", () => {
    const html = render(openRun());
    const pressed = cards(html);
    expect(pressed.length).toBeGreaterThan(1);
    expect(pressed.every((p) => p === "false")).toBe(true);
  });

  it("marks exactly the adopted card pressed", () => {
    const s = openRun();
    const pick = charterHand(s)[1]!;
    const html = render({ ...s, charter: pick });
    const pressed = cards(html);
    expect(pressed.filter((p) => p === "true")).toHaveLength(1);
    expect(pressed.filter((p) => p === "false")).toHaveLength(pressed.length - 1);
  });
});
