import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hallPinFit, hallPinBottomPad, SPLIT_HALL_H, MIN_PIN_HALL_H } from "./hallPin";

/**
 * The iPad split pins the hall column below the resource bar only when the whole
 * column fits above the bottom nav. The old CSS gate (min-height: 940px, a hardcoded
 * 129px offset) let only 12.9"/13" iPads pin; an 11" iPad in landscape always scrolled
 * the hall away. Numbers below are measured in the built app (Playwright): the bar pins
 * with its bottom at 113px (column top 129px), the nav's top is at 758px on a 1180×820
 * screen and 962px on 1366×1024, and a veteran's column is the 372px hall plus 337px
 * of ticker, dock and gaps (a first-run column swaps the ticker for the 126px FIRST
 * STEPS checklist: 382px).
 */

const veteran = { columnH: 372 + 337, hallH: 372 };
const firstRun = { columnH: 372 + 382, hallH: 372 };

describe("the hall column pins only where it fits", () => {
  it("pins on an 11-inch iPad in landscape, giving back hall height to fit", () => {
    const at820 = hallPinFit({ pinTop: 129, navTop: 758, ...veteran });
    expect(at820.pin).toBe(true);
    expect(at820.hallH).toBeGreaterThanOrEqual(MIN_PIN_HALL_H);
    expect(129 + at820.hallH + 337).toBeLessThanOrEqual(758); // clears the nav
    const at834 = hallPinFit({ pinTop: 129, navTop: 772, ...veteran });
    expect(at834.pin).toBe(true);
    expect(at834.hallH).toBeGreaterThan(at820.hallH);
  });

  it("keeps the full hall on a 12.9-inch iPad", () => {
    expect(hallPinFit({ pinTop: 129, navTop: 962, ...veteran })).toEqual({ pin: true, hallH: SPLIT_HALL_H });
    expect(hallPinFit({ pinTop: 129, navTop: 962, ...firstRun })).toEqual({ pin: true, hallH: SPLIT_HALL_H });
  });

  it("scrolls instead of shrinking the hall below the phone hall", () => {
    // 11-inch landscape with FIRST STEPS showing: would need a 247px hall.
    expect(hallPinFit({ pinTop: 129, navTop: 758, ...firstRun }).pin).toBe(false);
    // A landscape phone (430px tall) never pins.
    expect(hallPinFit({ pinTop: 129, navTop: 368, ...veteran }).pin).toBe(false);
  });

  it("the fit does not depend on the hall height it already picked (no oscillation)", () => {
    const first = hallPinFit({ pinTop: 129, navTop: 758, ...veteran });
    const again = hallPinFit({ pinTop: 129, navTop: 758, columnH: 337 + first.hallH, hallH: first.hallH });
    expect(again).toEqual(first);
  });

  it("a taller resource bar (larger text) pushes the column down and is measured, not assumed", () => {
    const taller = hallPinFit({ pinTop: 129 + 40, navTop: 758, ...veteran });
    expect(taller.pin).toBe(false);
  });

  it("junk measurements never pin", () => {
    expect(hallPinFit({ pinTop: NaN, navTop: 758, ...veteran }).pin).toBe(false);
    expect(hallPinFit({ pinTop: 129, navTop: Infinity, ...veteran }).pin).toBe(false);
  });

  it("at the very end of the page the pinned column still starts below the bar (11-inch)", () => {
    // A sticky column can't leave the stage: at the end of the scroll the stage's bottom
    // (viewport bottom − the page's bottom padding) is its floor. With the phone padding
    // (84px on an 820px screen whose nav starts at 758) the floor sat at 736, and the
    // 629px column the fit placed at 129..758 was shoved up to 107: under the bar (bottom
    // 113), with the footer line drawn over the Training dock.
    for (const [viewportH, navTop] of [[820, 758], [834, 772], [1024, 962]] as const) {
      const fit = hallPinFit({ pinTop: 129, navTop, ...veteran });
      expect(fit.pin).toBe(true);
      const column = veteran.columnH - veteran.hallH + fit.hallH;
      const floor = viewportH - hallPinBottomPad(viewportH, navTop)!;
      const topAtEnd = Math.min(129, floor - column);
      expect(topAtEnd, `${viewportH}px screen`).toBe(129);
    }
    expect(hallPinBottomPad(NaN, 758)).toBeNull();
    expect(hallPinBottomPad(820, Infinity)).toBeNull();
  });

  it("the pinned page pads by the measured nav, and the footer leaves the pinned column", () => {
    const css = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).toMatch(/\.app\.app-split\.hall-pin\s*\{[^}]*padding-bottom:\s*var\(--hall-pin-pad/);
    expect(css).toMatch(/\.app-split\.hall-pin \.stage > \.footer\s*\{[^}]*grid-column:\s*2/);
  });

  it("the CSS pins from the measured bar height, not a hardcoded gate", () => {
    const css = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/min-height:\s*940px/);
    expect(css).not.toMatch(/top:\s*calc\(129px/);
    expect(css).toMatch(/\.app-split\.hall-pin \.stage-left\s*\{[^}]*position:\s*sticky[^}]*var\(--resbar-h/);
  });
});
