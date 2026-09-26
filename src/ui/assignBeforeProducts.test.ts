import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { EmployeesPanel } from "./EmployeesPanel";
import { EmptyState } from "./EmptyState";
import { hookHost, findElements, expand } from "./hookHost";
import { createInitialState } from "../engine/state";
import { derive } from "../engine/derive";
import { productsUnlocked } from "../engine/products";
import type { Employee, GameState } from "../engine/types";

/**
 * The Team opens with the first research node, in generation 1, and a recruit can be
 * any role, product crew included (ML Scientist, SRE, Growth, Sales…). Tapping one
 * offered "Assign…", which flipped to the Projects pane to "tap a project below" —
 * there were none, and there could be none: the empty state said "Launch one in the
 * Products tab", a tab that does not exist until the first Ship. A dead-end tap that
 * pointed at a place the player could not find.
 */
const growthLead: Employee = { id: "emp-1", name: "Ada Park", roleId: "staff_growth", level: 1, trait: null, assignedProductId: null, training: null };

function genOne(): GameState {
  const base = createInitialState();
  return { ...base, research: ["backprop"], employees: [growthLead] };
}

const text = (n: ReactNode): string => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(text).join("");
  if (isValidElement(n)) return text((n.props as { children?: ReactNode }).children);
  return "";
};
const noop = () => {};
const render = (host: ReturnType<typeof hookHost>, game: GameState) => expand(host.render(EmployeesPanel, {
  game, derived: derive(game), candidates: null,
  onRecruit: noop, onRefresh: noop, onCloseRecruit: noop, onHireCandidate: () => true,
  onTrain: noop, onAssign: noop, onFire: noop, onBuyPerk: noop,
}), ["RosterRow", "AvailRow", "PersonCard"]) as ReactElement; // reach into the person rows
const buttons = (tree: ReactElement, label: string) =>
  findElements(tree, (el) => el.type === "button" && text((el.props as { children?: ReactNode }).children).trim() === label);

describe("product crew before there are products", () => {
  it("offers no Assign… while there is nothing to assign to", () => {
    const game = genOne();
    expect(productsUnlocked(game)).toBe(false);
    const host = hookHost();
    let tree = render(host, game);
    const card = findElements(tree, (el) => (el.props as { role?: string }).role === "button" && (el.props as { className?: string }).className?.startsWith("emp-person") === true)[0]!;
    (card.props as { onClick: () => void }).onClick();
    tree = render(host, game);
    expect(buttons(tree, "Fire")).toHaveLength(1); // the person's actions are open
    expect(buttons(tree, "Assign…")).toHaveLength(0);
  });

  it("does not send a first-generation lab to a Products tab it does not have", () => {
    const game = genOne();
    const host = hookHost();
    let tree = render(host, game);
    const projects = findElements(tree, (el) => el.type === "button" && (el.props as { role?: string }).role === "tab" && text((el.props as { children?: ReactNode }).children).startsWith("Projects"))[0]!;
    (projects.props as { onClick: () => void }).onClick();
    tree = render(host, game);
    const empty = findElements(tree, (el) => el.type === EmptyState)[0]!;
    const hint = text((empty.props as { hint?: ReactNode }).hint);
    expect(hint).not.toMatch(/Products tab/);
    expect(hint).toMatch(/first Ship/);
    // The idle crew listed under it has nothing to be placed on either.
    expect(buttons(tree, "Assign")).toHaveLength(0);
  });

  it("still points at the Products tab once it exists", () => {
    const game = { ...genOne(), prestige: { ...genOne().prestige, ships: 1 } };
    expect(productsUnlocked(game)).toBe(true);
    const host = hookHost();
    let tree = render(host, game);
    const projects = findElements(tree, (el) => el.type === "button" && (el.props as { role?: string }).role === "tab" && text((el.props as { children?: ReactNode }).children).startsWith("Projects"))[0]!;
    (projects.props as { onClick: () => void }).onClick();
    tree = render(host, game);
    const empty = findElements(tree, (el) => el.type === EmptyState)[0]!;
    expect(text((empty.props as { hint?: ReactNode }).hint)).toMatch(/Products tab/);
  });
});
