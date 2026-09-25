import { describe, it, expect, beforeEach } from "vitest";
import { useSettings } from "./settings";

/**
 * `achievementsSeen` is the high-water mark behind the GOALS badge's "new
 * achievements" part: badge = max(0, achievements.length − seen). Achievements
 * only grow within a save, so it only ever needs to rise — until the save itself
 * is replaced. A Hard Reset or an older backup leaves fewer achievements than the
 * mark, and without re-anchoring, nothing new badged until the old total was beaten.
 */
describe("achievementsSeen high-water mark", () => {
  const seen = () => useSettings.getState().achievementsSeen;
  const badge = (earned: number) => Math.max(0, earned - seen());

  beforeEach(() => {
    useSettings.setState({ achievementsSeen: 0 });
  });

  it("rises as the Collection is viewed and ignores a stale smaller count", () => {
    useSettings.getState().markAchievementsSeen(40);
    useSettings.getState().markAchievementsSeen(12);
    expect(seen()).toBe(40);
  });

  it("re-anchors to a replaced save so new unlocks badge again (Hard Reset)", () => {
    useSettings.getState().markAchievementsSeen(40);
    useSettings.getState().rebaseAchievementsSeen(0); // the fresh save holds none
    expect(seen()).toBe(0);
    expect(badge(1)).toBe(1); // the first unlock after the reset shows
  });

  it("re-anchors to an older backup without badging what it already had", () => {
    useSettings.getState().markAchievementsSeen(40);
    useSettings.getState().rebaseAchievementsSeen(15); // imported save holds 15
    expect(badge(15)).toBe(0);
    expect(badge(16)).toBe(1);
  });

  it("never raises the mark — only viewing the Collection does that", () => {
    useSettings.getState().markAchievementsSeen(10);
    useSettings.getState().rebaseAchievementsSeen(25);
    expect(seen()).toBe(10);
  });
});
