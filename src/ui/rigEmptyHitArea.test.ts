import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Rig Bay's empty-slot chips (bug hunt r5, accessibility). A tier's empty slots fold
 * into a wrapping row of small dashed "+ Accelerator / + Cooling / + Interconnect"
 * chips, 36px tall and 6px apart. They are the only way to open the part picker for an
 * empty slot, yet they sat outside the shared 44pt hit-area rule, so on a phone a tap
 * a few pixels off the chip missed it. They join the rule, and since wrapped rows sit
 * one above another, the row gap is what lets a 36px chip reach 44pt without its
 * hit area reaching into the chip below.
 */

const css = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8");

/** Last declaration of `prop` in a plain `selector { … }` block. */
function decl(selector: string, prop: string): string | null {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let out: string | null = null;
  for (const m of css.matchAll(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`, "g"))) {
    const v = new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+);`).exec(m[1]!);
    if (v) out = v[1]!.trim();
  }
  return out;
}

const px = (v: string | null) => (v === null ? NaN : parseFloat(v));

describe("Rig Bay empty-slot chips reach 44pt", () => {
  it("are in the shared hit-area rule", () => {
    const rule = /((?:[.\w\s-]+::after,\s*)*[.\w\s-]+::after)\s*\{\s*content: "";\s*position: absolute;\s*top: max\(var\(--hit-cap-y/.exec(css);
    expect(rule).not.toBeNull();
    expect(rule![1]!.split(",").map((x) => x.trim())).toContain(".rig-empty::after");
  });

  it("grow to 44pt tall without crossing into the next wrapped row", () => {
    const chip = px(decl(".rig-empty", "min-height"));
    const rowGap = px((decl(".rig-empties", "gap") ?? "").split(/\s+/)[0] ?? null);
    const cap = -px(decl(".rig-empty", "--hit-cap-y"));
    // The ::after is placed from the PADDING box, so the chip's border eats into the
    // growth: what reaches past the border box is `cap - border` a side.
    const border = px(/^(\d+(?:\.\d+)?)px/.exec(decl(".rig-empty", "border") ?? "")?.[1] ?? "0");
    expect(chip).toBeGreaterThan(0);
    // Each side may grow by at most half the row gap (no overlap with the row below)…
    expect(cap).toBeLessThanOrEqual(rowGap / 2);
    // …and that growth must be enough to reach 44pt.
    expect(chip + 2 * (cap - border)).toBeGreaterThanOrEqual(44);
  });
});
