import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * A product's name is player-typed: up to 24 characters, and a single long word has no
 * break point. At 320px a 24-letter name ("WWWW…") ran 136px past the product card's
 * right edge, pushed the $/s figure off screen and made the whole page scroll sideways
 * (document 523px wide on a 320px viewport). The same name overran the Manage sheet's
 * title (under the close button), the market leaderboard, the Team projects pane and
 * every toast that names the product (the text ran 84px past a 320px screen).
 * Measured in the built app with Playwright (r7 hostile-text hunt); every surface that
 * prints the name must be allowed to wrap it, and to shrink below its longest word.
 */

const css = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Every declaration of `prop` in a rule whose selector list includes `selector`. */
function decls(selector: string, prop: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/(^|\})\s*([^{}@]+)\{([^}]*)\}/g)) {
    const sels = m[2]!.split(",").map((s) => s.trim());
    if (!sels.includes(selector)) continue;
    for (const d of m[3]!.matchAll(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+);`, "g"))) out.push(d[1]!.trim());
  }
  return out;
}

describe("player-typed product names wrap inside their box", () => {
  it.each([".prod-name", ".pd-name", ".market-name", ".emp-proj-name", ".toast-text", ".wiwa-story p", ".confirm-modal h2", ".confirm-modal .modal-sub"])("%s breaks a long word and can shrink", (sel) => {
    expect(decls(sel, "overflow-wrap")).toContain("anywhere");
    expect(decls(sel, "min-width")).toContain("0");
  });
});
