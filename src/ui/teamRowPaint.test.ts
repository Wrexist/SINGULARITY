import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Even with no row re-rendering, a 512-staff Team tab spent most of each tick in
 * Paint: the numbers that tick above the list (Money, Payroll /s, Revenue /s) sit
 * in the same layer, and repainting that layer walked every card inside its
 * 8,000-px cull rect (68 ms a paint at 4x throttle, ten times a second). Cards far
 * off screen now skip layout and paint (`content-visibility: auto`), keeping their
 * last measured height (`contain-intrinsic-size: auto …`) so the scroll does not
 * jump. A layout test can't run in node, so this pins the rule itself; the
 * before/after profile is in the commit that added it.
 */
const css = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rulesFor = (selector: string) =>
  [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((m) => m[1]!.split(",").some((s) => s.trim() === selector))
    .map((m) => m[2]!);

describe("person cards off screen", () => {
  it("skip rendering, with a remembered height", () => {
    const body = rulesFor(".emp-person").join(";");
    expect(body).toMatch(/content-visibility:\s*auto/);
    expect(body).toMatch(/contain-intrinsic-size:\s*auto\s+\d+px/);
  });
});
