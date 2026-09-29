import { describe, it, expect, beforeEach } from "vitest";
import { burst, floatText, _fxState } from "./fx";
import { useSettings } from "./settings";

/**
 * Reduced motion vs in-flight juice (bug hunt r6). Turning reduced motion on unmounts
 * the FxCanvas, which stops draining fx.ts's particle and floater arrays. Whatever was
 * mid-flight stayed queued, frozen, and when motion was turned back on it replayed —
 * a stale claim spray and "+$" floater at their old screen spots — on the next burst.
 * Queued fx are now dropped the moment motion is reduced.
 */
beforeEach(() => {
  useSettings.setState({ reducedMotion: false });
  const { particles, floaters } = _fxState();
  particles.length = 0;
  floaters.length = 0;
});

describe("fx queued when reduced motion turns on", () => {
  it("are dropped, so they cannot replay when motion comes back", () => {
    burst(100, 100, { count: 12 });
    floatText(100, 100, "+$5");
    expect(_fxState().particles.length).toBe(12);
    expect(_fxState().floaters.length).toBe(1);

    useSettings.getState().toggle("reducedMotion"); // on: the canvas unmounts
    expect(_fxState().particles.length).toBe(0);
    expect(_fxState().floaters.length).toBe(0);

    useSettings.getState().toggle("reducedMotion"); // off again
    burst(10, 10, { count: 4 });
    // Only the new burst is drawn — nothing from before the switch.
    expect(_fxState().particles.length).toBe(4);
    expect(_fxState().floaters.length).toBe(0);
  });

  it("an unrelated settings change leaves live fx alone", () => {
    burst(100, 100, { count: 6 });
    useSettings.getState().toggle("sound");
    expect(_fxState().particles.length).toBe(6);
    useSettings.getState().toggle("sound");
  });
});
