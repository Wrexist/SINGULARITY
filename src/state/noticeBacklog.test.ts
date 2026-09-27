import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useGame } from "./store";
import { enqueueNotices, NOTICE_BACKLOG_CAP } from "./noticeQueue";
import type { FiredEvent } from "./store";
import { createInitialState } from "../engine/state";
import type { Employee, GameState } from "../engine/types";

/**
 * The notice backlog (round 8, owner call). Completion notices drain one per 900ms so a
 * burst reads as staggered toasts, but the queue was cut with slice(0, 6): the 7th and
 * later notices of a burst were silently dropped — a level-up, a version ship, a
 * milestone's Money never announced and never written to Recent activity. The queue
 * now keeps every notice in order; only a runaway backlog past a generous cap folds its
 * overflow into ONE summary notice, so nothing is lost without a trace.
 */

const n = (key: number, message = `note ${key}`, tone: FiredEvent["tone"] = "good"): FiredEvent => ({ key, message, tone });

describe("enqueueNotices", () => {
  it("keeps a burst past six in order", () => {
    const q = enqueueNotices([n(1), n(2), n(3)], [n(4), n(5), n(6), n(7), n(8), n(9)]);
    expect(q.map((x) => x.key)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("folds only the overflow past the cap into one summary, counting every notice", () => {
    const burst = Array.from({ length: NOTICE_BACKLOG_CAP + 5 }, (_, i) => n(i + 1));
    const q = enqueueNotices([], burst);
    expect(q).toHaveLength(NOTICE_BACKLOG_CAP);
    expect(q.slice(0, -1).map((x) => x.key)).toEqual(burst.slice(0, NOTICE_BACKLOG_CAP - 1).map((x) => x.key));
    const summary = q[q.length - 1]!;
    expect(summary.message).toMatch(/^6 more updates/);
    // The next burst keeps folding into the same summary, never growing the queue.
    const q2 = enqueueNotices(q, [n(100), n(101)]);
    expect(q2).toHaveLength(NOTICE_BACKLOG_CAP);
    expect(q2[q2.length - 1]!.message).toMatch(/^8 more updates/);
    expect(q2[q2.length - 1]!.key).toBe(101);
  });

  it("a summary of quiet notices stays quiet; any win makes it a good one", () => {
    const quiet = Array.from({ length: NOTICE_BACKLOG_CAP + 1 }, (_, i) => n(i + 1, "x", "neutral"));
    expect(enqueueNotices([], quiet).at(-1)!.tone).toBe("neutral");
    const mixed = [...quiet.slice(0, -1), n(99, "win", "good")];
    expect(enqueueNotices([], mixed).at(-1)!.tone).toBe("good");
  });
});

/** Ten specialists whose training finishes on ten consecutive 100ms ticks. */
function trainingLab(): GameState {
  const s = createInitialState();
  const employees: Employee[] = Array.from({ length: 10 }, (_, i) => ({
    id: `e${i}`, name: `Specialist${i}`, roleId: "staff_researcher", level: 1, trait: null,
    assignedProductId: null, training: { remainingSec: 0.05 + i * 0.1, totalSec: 60 },
  }));
  return { ...s, employees };
}

describe("a burst of level-ups in the store", () => {
  afterEach(() => { vi.restoreAllMocks(); });
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // no world / product / heat events
    useGame.setState({ game: trainingLab(), offline: null, notice: null, event: null, worldEvent: null });
  });

  it("announces every one of them, in the order they happened", () => {
    const seen: string[] = [];
    let lastKey = -1;
    for (let i = 0; i < 200; i++) {
      useGame.getState().advance(100, 100);
      const note = useGame.getState().notice;
      if (note && note.key !== lastKey) {
        lastKey = note.key;
        if (note.kind === "levelup") seen.push(note.message);
      }
    }
    const names = seen.map((m) => /Specialist(\d)/.exec(m)?.[1]).filter((x) => x !== undefined).map(Number);
    expect(names).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
