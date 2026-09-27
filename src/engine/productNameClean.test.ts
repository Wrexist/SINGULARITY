import { describe, it, expect } from "vitest";
import { createInitialState } from "./state";
import { releaseProduct, renameProduct, PRODUCT_NAME_MAX } from "./products";
import { Big } from "./math/Big";
import type { GameState } from "./types";

/**
 * A product name is typed or pasted by the player and then shown everywhere: the
 * product card, the leaderboard, every product toast and away-recap line. The rename
 * kept whatever arrived, cut at 24 UTF-16 units:
 *  - the cut could land inside an emoji or a ZWJ sequence, leaving a lone surrogate
 *    (drawn as a replacement box) or half a family emoji;
 *  - a pasted right-to-left OVERRIDE (U+202E) or embedding control has no closing mark
 *    inside the name, so it flipped the rest of every toast that named the product
 *    ("Nova shipped v3" rendered back to front);
 *  - tabs, NULs and other control characters went straight into the save and the UI.
 */

const lab = (): GameState => {
  const s = createInitialState();
  s.prestige = { ...s.prestige, ships: 1 };
  s.resources = { ...s.resources, compute: Big.of(1e9), data: Big.of(1e9) };
  return releaseProduct(s, { type: "general", name: "Temp", id: "p1" });
};
const renamed = (name: string) => renameProduct(lab(), "p1", name).products.active[0]!.name;
const loneSurrogate = /[\ud800-\udbff](?![\udc00-\udfff])|(^|[^\ud800-\udbff])[\udc00-\udfff]/;

describe("product rename cleans hostile text", () => {
  it("never cuts an emoji in half at the length cap", () => {
    const name = renamed("a".repeat(PRODUCT_NAME_MAX - 1) + "😀");
    expect(loneSurrogate.test(name)).toBe(false);
    expect(name.length).toBeLessThanOrEqual(PRODUCT_NAME_MAX);
  });

  it("never leaves half a ZWJ sequence at the cap", () => {
    const family = "👩‍👩‍👧‍👦"; // 11 UTF-16 units, one grapheme
    const name = renamed("Lab " + family + family + family);
    expect(name.length).toBeLessThanOrEqual(PRODUCT_NAME_MAX);
    expect(name.endsWith("‍")).toBe(false);
    expect(name.replace(/^Lab /, "").split(family).join("")).toBe("");
  });

  it("drops a lone surrogate that was pasted in", () => {
    expect(loneSurrogate.test(renamed("Nova\ud83d"))).toBe(false);
    expect(renamed("Nova\ud83d")).toBe("Nova");
  });

  it("strips bidi overrides and embeddings, keeps real right-to-left text", () => {
    expect(renamed("‮Nova")).toBe("Nova");
    expect(renamed("A‫B‬C⁦D⁩")).toBe("ABCD");
    expect(renamed("نوفا Nova")).toBe("نوفا Nova");
    expect(renamed("נובה")).toBe("נובה");
  });

  it("turns tabs, newlines and control characters into single spaces", () => {
    expect(renamed("Ca\tsh\nCow")).toBe("Ca sh Cow");
    expect(renamed("No\u0000va")).toBe("No va");
    expect(renamed("A B")).toBe("A B");
  });

  it("keeps ordinary names, specials and combining marks as typed", () => {
    expect(renamed("Ca$h $& {name} %s")).toBe("Ca$h $& {name} %s");
    expect(renamed("<script>x</script>")).toBe("<script>x</script>");
    expect(renamed("Café")).toBe("Café");
    expect(renamed("Café")).toBe("Café");
  });

  it("an all-junk name falls back to Untitled", () => {
    expect(renamed("‮\u0000\t ")).toBe("Untitled");
  });
});
