import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ModifierBar } from "./ModifierBar";
import type { ActiveModifier } from "../engine/types";

/**
 * The regulator truce in the modifier bar (bug hunt, economy r1 #6). It is a factor-1
 * marker that only gates Chen's return, but it rendered as a red "Setback" with a
 * workable "−12s" button — whose one effect was to bring Chen back sooner.
 */

const truce: ActiveModifier = {
  id: "regulator_truce", target: "moneyMult", factor: 1, remainingSec: 200,
  label: "Supervisor Chen: case settled", tone: "bad",
};
const shortage: ActiveModifier = {
  id: "gpu_shortage", target: "computeMult", factor: 0.6, remainingSec: 60, label: "GPU shortage", tone: "bad",
};

const render = (modifiers: ActiveModifier[]) =>
  renderToStaticMarkup(createElement(ModifierBar, { modifiers, onWork: () => {}, workShaveSec: 12 }));

describe("ModifierBar and the regulator truce", () => {
  it("shows the truce as a quiet status chip — not a setback, not workable", () => {
    const html = render([truce]);
    expect(html).toContain("case settled");
    expect(html).not.toContain("workable");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Setback");
    expect(html).toContain("modchip neutral");
  });

  it("a real setback beside it is still a workable button", () => {
    const html = render([truce, shortage]);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain("GPU shortage");
    expect(html).toContain("workable");
  });
});
