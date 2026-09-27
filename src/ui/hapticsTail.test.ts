import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Haptics chords (bug hunt r6). "celebrate" and "epic" play a notification now and
 * one or two heavy impacts 90-260ms later via setTimeout. The Haptics setting was
 * read once, when the chord started, so a player who switched Haptics off in that
 * window (a Ship celebration fires one as the sheet they are tapping in opens) still
 * felt the tail. The tail now reads the setting when it lands. On the web a started
 * vibration pattern is likewise cancelled when Haptics is switched off.
 */

const impact = vi.fn(async (_o: unknown) => {});
const notification = vi.fn(async (_o: unknown) => {});
let native = true;

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native } }));
vi.mock("@capacitor/haptics", () => ({
  Haptics: { impact: (o: unknown) => impact(o), notification: (o: unknown) => notification(o) },
  ImpactStyle: { Light: "LIGHT", Medium: "MEDIUM", Heavy: "HEAVY" },
  NotificationType: { Success: "SUCCESS", Warning: "WARNING", Error: "ERROR" },
}));

const { haptics } = await import("./haptics");
const { useSettings } = await import("./settings");

beforeEach(() => {
  vi.useFakeTimers();
  impact.mockClear();
  notification.mockClear();
  native = true;
  useSettings.setState({ haptics: true, hapticsLight: false });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a haptic chord's tail honours the setting when it lands", () => {
  it("plays the whole epic chord while Haptics stays on", () => {
    haptics.epic();
    vi.advanceTimersByTime(400);
    expect(notification).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledTimes(2);
  });

  it("drops the epic tail once Haptics is switched off mid-chord", () => {
    haptics.epic();
    expect(notification).toHaveBeenCalledTimes(1);
    useSettings.setState({ haptics: false });
    vi.advanceTimersByTime(400);
    expect(impact).not.toHaveBeenCalled();
  });

  it("drops the celebrate tail once Haptics is switched off mid-chord", () => {
    haptics.celebrate();
    useSettings.setState({ haptics: false });
    vi.advanceTimersByTime(200);
    expect(impact).not.toHaveBeenCalled();
  });

  it("softens the tail when Light is switched on mid-chord", () => {
    haptics.epic();
    useSettings.setState({ hapticsLight: true });
    vi.advanceTimersByTime(400);
    expect(impact.mock.calls.map((c) => (c[0] as { style: string }).style)).toEqual(["MEDIUM"]);
  });
});

describe("web vibration", () => {
  it("cancels a running pattern when Haptics is switched off", () => {
    native = false;
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate, userActivation: { hasBeenActive: true } });
    try {
      haptics.epic();
      expect(vibrate).toHaveBeenCalledTimes(1);
      useSettings.setState({ haptics: false });
      expect(vibrate).toHaveBeenLastCalledWith(0);
      // Switching it on again does not buzz.
      vibrate.mockClear();
      useSettings.setState({ haptics: true });
      expect(vibrate).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
