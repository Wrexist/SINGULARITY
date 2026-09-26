/**
 * The hall's wing switcher is a horizontal scroller (a lab can found up to 25 wings),
 * and a scroller clips whatever its chips draw outside it — so a chip's own 44pt hit
 * area can never reach past the pill. The pill sits in a slightly larger transparent
 * frame instead, and a tap that lands on the frame or on the pill's own padding, not
 * on a chip, goes to the chip straight above or below it (or the nearest one, for a
 * tap beside the end chips). Pure, so it can be tested without a DOM.
 */
export function wingAtX(chips: ReadonlyArray<{ left: number; right: number }>, x: number): number {
  let best = -1;
  let bestDist = Infinity;
  chips.forEach((c, i) => {
    const d = x < c.left ? c.left - x : x > c.right ? x - c.right : 0;
    if (d < bestDist) { best = i; bestDist = d; }
  });
  return best;
}
