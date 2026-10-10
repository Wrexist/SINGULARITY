import { describe, it, expect } from "vitest";
import { nextDprCap, shouldRender, DPR_STEPS, SLOW_FRAME_MS } from "./quality";

/**
 * The 3D Lab's battery guards. An idle game stays open for long sessions, so a device
 * that can't hold the frame target must get cheaper (never pricier), and a player who
 * asked for reduced motion must not pay for 30 repaints a second of a still picture.
 */
describe("adaptive pixel ratio", () => {
  it("holds the cap while the device keeps up", () => {
    expect(nextDprCap(2, 33)).toBe(2);
    expect(nextDprCap(2, SLOW_FRAME_MS)).toBe(2);
  });

  it("steps down one notch at a time when frames run slow, and stops at the floor", () => {
    let cap = 2;
    const seen: number[] = [];
    for (let k = 0; k < 6; k++) {
      cap = nextDprCap(cap, 60);
      seen.push(cap);
    }
    expect(seen).toEqual([1.75, 1.5, 1.25, 1.25, 1.25, 1.25]);
    expect(Math.min(...DPR_STEPS)).toBe(1.25);
  });

  it("never steps back up and ignores a garbled measurement", () => {
    expect(nextDprCap(1.5, 16)).toBe(1.5);
    expect(nextDprCap(1.5, Number.NaN)).toBe(1.5);
  });
});

describe("still lab (reduced motion)", () => {
  it("renders continuously when motion is on, or while exploring", () => {
    expect(shouldRender({ reducedMotion: false, explore: false, changed: false, sinceLastMs: 0 })).toBe(true);
    expect(shouldRender({ reducedMotion: true, explore: true, changed: false, sinceLastMs: 0 })).toBe(true);
  });

  it("under reduced motion repaints on change, otherwise at most twice a second", () => {
    expect(shouldRender({ reducedMotion: true, explore: false, changed: true, sinceLastMs: 10 })).toBe(true);
    expect(shouldRender({ reducedMotion: true, explore: false, changed: false, sinceLastMs: 100 })).toBe(false);
    expect(shouldRender({ reducedMotion: true, explore: false, changed: false, sinceLastMs: 500 })).toBe(true);
  });
});
