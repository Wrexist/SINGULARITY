import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { wingAtX } from "./wingSlop";

/**
 * 44pt hit areas, app-wide sweep (bug hunt r6). A Playwright probe walked every tab,
 * sub-tab, fold and sheet of a deep save at 390 and 320 wide and found 94 controls a
 * tap 22px from the centre missed: the Lab and Goals section tabs (36px), buy-quantity
 * buttons (36px), every HQ/Goals fold header (30-32px), People/Projects (33px),
 * contract Claim (36px), Grand Challenge Fund (33px), the product sheet's close
 * button (32x32), tabs, switch, Suggest mix and feature Buy buttons, the rival Press
 * blitz / Stake buttons, the Rig Bay picker's "close", and the Settings backup
 * buttons (29-31px). Each now joins the shared transparent hit-area rule (so nothing
 * moves), with caps where a neighbour sits closer than 44pt. The probe also checked
 * no grown box steals a tap from inside a neighbour; these tests pin the CSS it
 * verified.
 */

const css = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8");

/** Selectors of the shared rule, i.e. the block whose body starts with the 44pt maths. */
function sharedRuleSelectors(): string[] {
  const m = /([^{}]+)\{\s*content: "";\s*position: absolute;\s*top: max\(var\(--hit-cap-y/.exec(css);
  expect(m).not.toBeNull();
  return m![1]!.split(",").map((s) => s.replace(/\/\*[\s\S]*?\*\//g, "").trim()).filter(Boolean);
}

/** Selectors that get `position: relative` from the rule just above it. */
function positionedSelectors(): string[] {
  const i = css.indexOf("/* 44pt hit areas for small controls");
  const m = /([^{}]+)\{\s*position: relative;\s*\}/.exec(css.slice(i));
  expect(m).not.toBeNull();
  return m![1]!.split(",").map((s) => s.trim());
}

/** Last value of `prop` in a plain `selector { … }` block. */
function decl(selector: string, prop: string): string | null {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let out: string | null = null;
  for (const m of css.matchAll(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`, "g"))) {
    const v = new RegExp(`(?:^|[;\\s])${prop.replace(/[-]/g, "\\-")}\\s*:\\s*([^;]+);`).exec(m[1]!);
    if (v) out = v[1]!.trim();
  }
  return out;
}
const px = (v: string | null) => (v === null ? NaN : parseFloat(v));

const SWEPT = [
  ".tab", ".buy-qty-btn", ".collapsible-toggle", ".stats-toggle", ".legacy-tree-toggle",
  ".emp-seg-btn", ".contract-claim", ".challenge-fund", ".market-blitz", ".market-stake",
  ".set-backup .btn-sm", ".prod-name", ".pd-name", ".pd-close", ".pd-flagship", ".pd-sell",
  ".pd-toggle-row", ".pd-suggest", ".pd-feature-buy", ".rig-chooser-head .link-btn",
];

describe("44pt hit areas across the app", () => {
  it("every swept control is in the shared rule and positioned for it", () => {
    const rule = sharedRuleSelectors();
    const pos = positionedSelectors();
    for (const s of SWEPT) {
      expect(rule, s).toContain(`${s}::after`);
      expect(pos, s).toContain(s);
    }
  });

  it("product tabs use ::before, since ::after already draws the active underline", () => {
    expect(css).toMatch(/\.pd-tab\.on::after\s*\{[^}]*content/);
    expect(sharedRuleSelectors()).toContain(".pd-tab::before");
    // position: relative comes from .pd-tab itself
    expect(decl(".pd-tab", "position")).toBe("relative");
  });

  it("the two reward lanes, 5px apart with a 1px border, meet in the middle", () => {
    const gap = px(decl(".objective-choice", "gap"));
    const cap = -px(decl(".objective-lane", "--hit-cap-y"));
    const border = 1;
    // Past the border box each lane reaches cap - border: at most half the gap (no
    // overlap), and within half a pixel of it (no dead strip between the lanes).
    expect(cap - border).toBeLessThanOrEqual(gap / 2);
    expect(cap - border).toBeGreaterThanOrEqual(gap / 2 - 0.5);
  });

  it("Stake stops halfway up the 4px gap under Press blitz", () => {
    const m = /\.market-blitz \+ \.market-stake::after\s*\{\s*top:\s*(-?[\d.]+)px/.exec(css);
    expect(m).not.toBeNull();
    // 1px border, 4px gap (the market column's flex gap): 2px past the border at most.
    expect(-parseFloat(m![1]!) - 1).toBeLessThanOrEqual(2);
  });
});

describe("hall wing switcher", () => {
  it("sits in a frame 2px larger than the pill on every side, in the same spot", () => {
    expect(decl(".hall-wings-hit", "padding")).toBe("2px");
    expect(px(decl(".hall-wings-hit", "bottom")) + 2).toBe(px(decl(".hall-wings", "bottom")));
    expect(px(decl(".hall-wings-hit", "left")) + 2).toBe(px(decl(".hall-wings", "left")));
    // Chip hit areas fill the pill's 4px padding; the pill's 1px border and the
    // frame's 2px take the rest: a 31px chip reaches 31 + 2 * (4 + 1 + 2) = 45.
    expect(-px(decl(".hall-wing", "--hit-cap-y"))).toBe(px(decl(".hall-wings", "padding")));
    expect(31 + 2 * (4 + 1 + 2)).toBeGreaterThanOrEqual(44);
  });

  it("hands a tap that misses every chip to the chip under or nearest it", () => {
    const chips = [{ left: 34, right: 91 }, { left: 95, right: 153 }, { left: 157, right: 215 }];
    expect(wingAtX(chips, 60)).toBe(0);
    expect(wingAtX(chips, 120)).toBe(1);
    expect(wingAtX(chips, 216)).toBe(2); // beside the last chip
    expect(wingAtX(chips, 31)).toBe(0); // in the frame left of the first
    expect(wingAtX(chips, 94)).toBe(1); // in the 4px gap, nearer the second
    expect(wingAtX([], 50)).toBe(-1);
  });
});
