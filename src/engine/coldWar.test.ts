import { describe, it, expect } from "vitest";
import {
  applyDueRetaliations, canRunColdWarOp, coldWarCooldown, coldWarCost, coldWarTarget, nextRetaliationSec, rivalPosture, runColdWarOp,
} from "./coldWar";
import { market as M } from "./balance/market";
import { marketLeaderboard } from "./market";
import { tick } from "./tick";
import { createInitialState } from "./state";
import { serialize, deserialize } from "./save";
import { Big } from "./math/Big";
import { buildHallModel } from "../render/hallModel";
import type { GameState, ProductState } from "./types";

/**
 * AUDIT 2026-08 #8 — the Rival Cold War. A second verb with consequences: hostile
 * operations are ANSWERED, on a deterministic delay, by a short workable incident; a
 * pact buys a truce; breaking one is a betrayal. Everything is temporary and behind a
 * tap, and nothing is scheduled unless the player acts — so the tuned curve is safe.
 */
const W = M.coldWar;
const product = (id: string, mau: number): ProductState => ({
  id, type: "general", name: id, quality: 10, version: 2, mau, paid: mau / 20, priceMult: 1, marketingPerSec: 0,
  buzzSec: 0, features: [], enterprise: false, enterprisePrice: 1, channelMix: {}, ageSec: 1e6, upgrade: null,
});
function lab(mau = 1_000_000): GameState {
  const s = createInitialState();
  return {
    ...s,
    upgrades: { ...s.upgrades, rack_basic: 6 },
    products: { ...s.products, active: [product("p1", mau)] },
    resources: { ...s.resources, money: Big.of(1e15) },
    stats: { ...s.stats, playtimeSec: 5000 },
  };
}
const at = (s: GameState, sec: number): GameState => ({ ...s, stats: { ...s.stats, playtimeSec: sec } });

describe("cold war — who you're fighting", () => {
  it("needs a live product (no one fights a lab with nothing on the market)", () => {
    expect(coldWarTarget(createInitialState())).toBeNull();
  });

  it("aims at the smallest rival still ahead of you, or the runner-up when you lead", () => {
    const s = lab();
    const t = coldWarTarget(s)!;
    const mine = marketLeaderboard(s).find((e) => e.isYou)!.users;
    const ahead = marketLeaderboard(s).filter((e) => !e.isYou && e.users > mine);
    expect(t.users).toBe(Math.min(...ahead.map((e) => e.users)));
    const leader = lab(1e13);
    const rivals = marketLeaderboard(leader).filter((e) => !e.isYou);
    expect(coldWarTarget(leader)!.users).toBe(Math.max(...rivals.map((e) => e.users)));
  });
});

describe("cold war — operations", () => {
  it("a poach pays, buffs Data, and schedules their answer within the stated window", () => {
    const s = lab();
    const t = coldWarTarget(s)!;
    const after = runColdWarOp(s, "poach");
    const paid = s.resources.money.sub(after.resources.money);
    expect(paid.eq(coldWarCost("poach", t.users, s.resources.money))).toBe(true);
    // A deep bank pays its share (4%), not the rival-sized fee.
    expect(paid.toNumber()).toBeCloseTo(1e15 * M.coldWar.ops.poach.bankShare, -3);
    expect(after.modifiers.find((m) => m.id === "cw_poach")).toMatchObject({ target: "dataMult", factor: 1.5, tone: "good" });
    expect(after.coldWar.pending).toHaveLength(1);
    const due = after.coldWar.pending[0]!.dueSec;
    expect(due).toBeGreaterThanOrEqual(5000 + W.retaliateMinSec);
    expect(due).toBeLessThanOrEqual(5000 + W.retaliateMinSec + W.retaliateSpreadSec);
    expect(rivalPosture(after, t.name)).toBe("hostile");
    expect(runColdWarOp(s, "poach")).toEqual(after); // deterministic
  });

  it("one operation per news cycle", () => {
    const after = runColdWarOp(lab(), "takedown");
    expect(coldWarCooldown(after)).toBe(W.cooldownSec);
    expect(canRunColdWarOp(after, "pact")).toBe(false);
    expect(runColdWarOp(after, "pact")).toBe(after);
    expect(canRunColdWarOp(at(after, 5000 + W.cooldownSec), "pact")).toBe(true);
  });

  it("can't be run without the money", () => {
    const broke = { ...lab(), resources: { ...lab().resources, money: Big.of(1) } };
    expect(canRunColdWarOp(broke, "poach")).toBe(false);
    expect(runColdWarOp(broke, "poach")).toBe(broke);
  });

  it("a pact buys a surge and a truce, calling off their answer", () => {
    const hostile = runColdWarOp(lab(), "poach");
    const t = coldWarTarget(hostile)!;
    const later = at(hostile, 5000 + W.cooldownSec);
    const pact = runColdWarOp(later, "pact");
    expect(pact.coldWar.pending).toHaveLength(0);
    expect(rivalPosture(pact, t.name)).toBe("pact");
    expect(pact.modifiers.find((m) => m.id === "cw_pact")).toMatchObject({ target: "computeMult", factor: 1.35 });
    expect(canRunColdWarOp(at(pact, 5000 + 2 * W.cooldownSec), "pact")).toBe(false); // already allied
    // The truce ends.
    expect(rivalPosture(at(pact, 5000 + W.cooldownSec + W.pactSec + 1), t.name)).toBe("hostile");
  });

  it("moving against a pact partner is a betrayal: answered fast and hard", () => {
    const pact = runColdWarOp(lab(), "pact");
    const t = coldWarTarget(pact)!;
    const betray = runColdWarOp(at(pact, 5000 + W.cooldownSec), "takedown");
    expect(betray.coldWar.pacts[t.name]).toBeUndefined();
    expect(betray.coldWar.pending).toEqual([{ rival: t.name, kind: "betrayal", dueSec: 5000 + W.cooldownSec + W.betrayalSec }]);
  });
});

describe("cold war — retaliation lands in the tick", () => {
  it("at its due second, as a temporary incident", () => {
    const after = runColdWarOp(lab(), "poach");
    const due = nextRetaliationSec(after);
    const before = tick(after, (due - 5000 - 1) * 1000);
    expect(before.coldWar.pending).toHaveLength(1);
    expect(before.modifiers.some((m) => m.id === "cw_ret_poach")).toBe(false);
    const landed = tick(after, (due - 5000 + 10) * 1000);
    expect(landed.coldWar.pending).toHaveLength(0);
    const ret = landed.modifiers.find((m) => m.id === "cw_ret_poach")!;
    expect(ret).toMatchObject({ target: "dataMult", factor: W.retaliation.poach.factor, tone: "bad" });
    // Applied AT the due second: 10s of it already ran.
    expect(ret.remainingSec).toBeCloseTo(W.retaliation.poach.durationSec - 10, 3);
    expect(buildHallModel(landed).incidents.some((i) => i.id === "cw_ret_poach")).toBe(true);
  });

  it("a long window away applies it on time and lets it run out", () => {
    const after = runColdWarOp(lab(), "takedown");
    const away = tick(after, 30 * 60 * 1000);
    expect(away.coldWar.pending).toHaveLength(0);
    expect(away.modifiers.some((m) => m.id.startsWith("cw_ret_"))).toBe(false);
  });

  it("does nothing when nothing is due", () => {
    const s = lab();
    expect(applyDueRetaliations(s)).toBe(s);
  });
});

describe("cold war — saves", () => {
  it("round-trips a scheduled answer and a pact", () => {
    const s = runColdWarOp(lab(), "poach");
    expect(deserialize(serialize(s)).coldWar).toEqual(s.coldWar);
  });

  it("filters a crafted war: unknown rivals, far-future stamps, duplicates", () => {
    const s = lab();
    const raw = JSON.parse(serialize(s));
    const real = M.rivals[0]!.name;
    raw.coldWar = {
      ops: -3,
      lastOpSec: 9e12,
      pacts: { [real]: 9e12, "Not A Rival": 6000, __proto__: 1 },
      crossed: [real, real, "Nobody"],
      pending: [
        { rival: real, kind: "poach", dueSec: 9e12 },
        { rival: real, kind: "takedown", dueSec: 5100 },
        { rival: "Nobody", kind: "poach", dueSec: 5100 },
        { rival: M.rivals[1]!.name, kind: "nuke", dueSec: 5100 },
      ],
    };
    const cw = deserialize(JSON.stringify(raw)).coldWar;
    const now = 5000;
    expect(cw.ops).toBe(0);
    expect(cw.lastOpSec).toBe(now);
    expect(cw.pacts).toEqual({ [real]: now + W.pactSec });
    expect(cw.crossed).toEqual([real]);
    expect(cw.pending).toEqual([{ rival: real, kind: "poach", dueSec: now + W.retaliateMinSec + W.retaliateSpreadSec }]);
    raw.coldWar = "garbage";
    expect(deserialize(JSON.stringify(raw)).coldWar).toEqual({ ops: 0, lastOpSec: null, pacts: {}, crossed: [], pending: [] });
  });

  it("migrates a v42 save to peace", () => {
    const old = JSON.parse(serialize(lab()));
    delete old.coldWar;
    old.version = 42;
    expect(deserialize(JSON.stringify(old)).coldWar).toEqual({ ops: 0, lastOpSec: null, pacts: {}, crossed: [], pending: [] });
  });
});
