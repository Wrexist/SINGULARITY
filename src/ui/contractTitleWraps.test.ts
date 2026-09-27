import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * A Contract card is a two-column flex row: the title/desc/bar column and a side column
 * with the Rep reward and the Claim button. At 320px the text column is ~150px wide,
 * and a title word with no break point (a longer sponsor name, a future localisation)
 * could not wrap: in the built app a one-word title ran 117px past its column, through
 * the card gap and under "+6 Rep" / Claim. The title now wraps the same way product
 * names do (overflow-wrap: anywhere, min-width: 0). Measured with Playwright at 320px.
 */

const css = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Every declaration of `prop` in a rule whose selector list includes `selector`. */
function decls(selector: string, prop: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}@]+)\{([^}]*)\}/g)) {
    const sels = m[1]!.split(",").map((s) => s.trim());
    if (!sels.includes(selector)) continue;
    for (const d of m[2]!.matchAll(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+);`, "g"))) out.push(d[1]!.trim());
  }
  return out;
}

describe("Contract titles wrap inside their column", () => {
  it(".contract-title breaks a long word and can shrink", () => {
    expect(decls(".contract-title", "overflow-wrap")).toContain("anywhere");
    expect(decls(".contract-title", "min-width")).toContain("0");
  });
  it("the text column itself can shrink beside the reward column", () => {
    expect(decls(".contract-main", "min-width")).toContain("0");
  });
});
