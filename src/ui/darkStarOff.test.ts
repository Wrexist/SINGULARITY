import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Dark appearance (round 9 review). The Team roster shows a specialist's level as five
 * stars: gold for each level earned, light grey for the rest. The Dark theme defined a
 * night value for the grey (--star-off: #3a4052) but the star rule still painted the
 * literal #d8d8e0, so in Dark the UNEARNED stars glowed near-white next to the gold
 * ones and a level-1 hire read as a four- or five-star one at a glance.
 */
const css = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({ sel: sel!.trim(), body: body! }));

/** A light, near-neutral grey (#a0a0a0..#fefefe with little hue): a Light-only fill or ink. */
function lightGrey(hex: string): boolean {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hi = Math.max(r!, g!, b!), lo = Math.min(r!, g!, b!);
  return lo >= 160 && hi < 255 && hi - lo <= 24;
}

describe("Dark theme: no Light-only grey left as a literal", () => {
  it("an unearned level star paints from the theme's --star-off token", () => {
    const star = rules.find((r) => r.sel === ".emp-star");
    expect(star, ".emp-star rule").toBeDefined();
    expect(star!.body).toMatch(/color:\s*var\(--star-off\)/);
  });

  it("no colour, background or border outside the theme blocks is a raw light grey", () => {
    const bad: string[] = [];
    for (const { sel, body } of rules) {
      if (sel.startsWith(":root") || sel.includes("data-theme")) continue;
      for (const decl of body.split(";")) {
        const m = /^\s*(color|background(?:-color)?|border(?:-[a-z]+)?|fill|stroke)\s*:(.*)$/.exec(decl);
        if (!m) continue;
        for (const hex of m[2]!.matchAll(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
          if (lightGrey(hex[0])) bad.push(`${sel} { ${decl.trim()} }`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
