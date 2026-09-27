import { describe, it, expect } from "vitest";
import { achievements } from "./balance/achievements";
import { objectives, laneLabel, objectiveRewardLabel } from "./balance/objectives";
import { contracts } from "./balance/contracts";
import { productMilestones } from "./balance/products";
import { themes, rackSkins, type CosmeticUnlock } from "./balance/cosmetics";
import { reputation } from "./balance/reputation";
import { legacyTree } from "./balance/legacyTree";
import { paradigms } from "./balance/paradigms";
import { institute } from "./balance/institute";
import { doctrine } from "./balance/doctrine";
import { challenges } from "./balance/challenges";
import { charters } from "./balance/charters";
import { trials, CONDITION_THRESHOLDS } from "./balance/trials";
import { codex } from "./balance/codex";
import { market } from "./balance/market";
import { balance } from "./balance/config";
import { unlockHint } from "./cosmetics";
import { trialRewardLabel } from "./trials";
import { createInitialState } from "./state";
import { derive } from "./derive";
import { settledMrr } from "./products";
import { applyWorldEvent } from "./actions";
import { directiveSummary } from "./reputation";
import type { GameState, ProductState } from "./types";

/**
 * GOAL COPY PARITY (bug hunt r7). Every player-facing goal and reward definition
 * says what it checks and what it grants in prose; the engine reads the numbers.
 * This table walks each definition, derives the number (and the unit, and the lane)
 * from the data the engine actually applies, and asserts the copy quotes the same.
 * A new definition whose words drift from its numbers fails here, not in review.
 */

const SUFFIX: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/** The first quantity a sentence quotes: "1K", "$2,000", "v10", "24 hours", "five",
 *  "first" / "once" / "a" (→ 1). Hours are returned in seconds. */
function quoted(s: string): number | null {
  const m = /(\d[\d,]*(?:\.\d+)?)\s*([KMBT])?(?![a-zA-Z0-9])(\s*hours?)?/.exec(s);
  if (m) {
    const n = Number(m[1]!.replace(/,/g, "")) * (m[2] ? SUFFIX[m[2]]! : 1);
    return m[3] ? n * 3600 : n;
  }
  const w = /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b(\s*hours?)?/i.exec(s);
  if (w) return WORDS[w[1]!.toLowerCase()]! * (w[2] ? 3600 : 1);
  // A single, unnumbered act: "your first", "once", "a live product", "Ascend in …",
  // "Invest in the Legacy tree", "Ascend to AGI".
  if (/\b(first|once|an?)\b|^(Ascend|Invest) (in|to)\b/i.test(s)) return 1;
  return null;
}

/** Every signed percent a line quotes ("+12%", "−15%"), as signed fractions. */
function percents(s: string): number[] {
  return [...s.matchAll(/([+−-])\s?(\d+(?:\.\d+)?)%/g)].map((m) => (m[1] === "+" ? 1 : -1) * Number(m[2]) / 100);
}

/** What a permanent lane reward must be CALLED. The Money lane is the one the lab's
 *  training runs pay into; product revenue is a separate economy it never touches, so
 *  a Money reward must not promise "all revenue". A global reward names every lane. */
function laneWordOk(kind: string, desc: string): boolean {
  switch (kind) {
    case "computeMult": case "compute": return /\bCompute\b/.test(desc);
    case "dataMult": case "data": return /\bData\b/.test(desc);
    case "moneyMult": case "money": return /\bMoney\b/.test(desc) && !/all revenue/i.test(desc);
    case "globalMult": case "legacyMult": case "allMult": case "all":
      return /ALL output|all production|Compute, Data and Money/.test(desc);
    default: return false;
  }
}

describe("achievements quote the threshold they unlock at", () => {
  const overrides: Record<string, number> = {
    // Named by a number the copy can't hold as digits.
    level_max: balance.staff.maxLevel,
    research_30: achievements.find((a) => a.id === "research_30")!.threshold,
    market_1: market.rivals.length,
  };
  for (const a of achievements) {
    it(`${a.id}: "${a.desc}"`, () => {
      if (a.metric === "eraReached") {
        expect(a.desc).toContain(balance.eras.list[a.threshold]!.name);
        return;
      }
      const want = overrides[a.id] ?? a.threshold;
      if (a.id in overrides) {
        expect(a.threshold).toBe(want);
        return;
      }
      expect(quoted(a.desc)).toBe(want);
    });
  }
  it("the per-second revenue badges say per second", () => {
    for (const a of achievements.filter((x) => x.metric === "peakMrr")) expect(a.desc).toMatch(/\/s\b/);
  });
});

describe("objectives quote their target", () => {
  for (const o of objectives.pool) {
    it(`${o.id}: "${o.desc}"`, () => expect(quoted(o.desc)).toBe(o.target));
  }
});

describe("contracts quote their target", () => {
  for (const c of contracts.pool) {
    it(`${c.id}: "${c.desc}"`, () => expect(quoted(c.desc)).toBe(c.target));
  }
});

describe("product milestones quote their threshold", () => {
  for (const m of productMilestones) {
    it(`${m.id}: "${m.desc}"`, () => {
      const pct = percents(`+${m.desc}`)[0];
      if (m.metric === "qf") expect(/(\d+)%/.exec(m.desc) && Number(/(\d+)%/.exec(m.desc)![1]) / 100).toBe(m.threshold);
      else expect(pct === undefined ? quoted(m.desc) : quoted(m.desc)).toBe(m.threshold);
      if (m.metric === "mrr") expect(m.desc).toMatch(/\/s\b/);
    });
  }
});

describe("hall themes and rack skins quote their unlock", () => {
  const n = (u: CosmeticUnlock): number | null => ("n" in u ? (u.kind === "playtimeHours" ? u.n * 3600 : u.n) : null);
  for (const t of [...themes, ...rackSkins]) {
    if (!("n" in t.unlock)) continue;
    it(`${t.id}: "${t.blurb}"`, () => {
      expect(quoted(t.blurb)).toBe(n(t.unlock));
      expect(quoted(unlockHint(t.unlock).replace(/ hours?/, "")) ?? 1).toBe("n" in t.unlock ? t.unlock.n : 1);
    });
  }
});

/** A permanent lane reward: the copy quotes the same percent on the same lane. */
function laneReward(id: string, desc: string, kind: string, value: number) {
  it(`${id}: "${desc}"`, () => {
    expect(percents(desc)).toContain(Math.round(value * 100) / 100);
    expect(laneWordOk(kind, desc)).toBe(true);
  });
}

describe("Lab Reputation perks, Directives and records", () => {
  for (const p of reputation.perks) {
    const { kind, value } = p.effect;
    if (kind === "payrollMult") {
      it(`${p.id}: "${p.desc}"`, () => expect(percents(p.desc)).toContain(-value));
    } else if (kind === "researchDiscount") {
      it(`${p.id}: "${p.desc}"`, () => expect(p.desc).toContain(`${Math.round(value * 100)}% less`));
    } else if (kind === "startingRacks" || kind === "productSlot") {
      it(`${p.id}: "${p.desc}"`, () => expect(quoted(p.desc)).toBe(value));
    } else if (kind !== "automate") {
      laneReward(p.id, p.desc, kind, value);
    }
  }
  for (const d of reputation.endowment.directives.defs) laneReward(d.id, d.desc, d.lane, d.value);
});

describe("Legacy Investments", () => {
  for (const p of legacyTree.perks) {
    if ("lane" in p.effect) laneReward(p.id, p.desc, p.effect.lane, p.effect.value);
    else it(`${p.id}: "${p.desc}"`, () => expect(quoted(p.desc.replace(/^Unlock a /, ""))).toBe(p.effect.value));
  }
});

describe("Paradigms, the Institute and Doctrine perks", () => {
  for (const p of paradigms.list) laneReward(p.id, p.desc, p.effect.kind, p.effect.value);
  for (const p of institute.perks) laneReward(p.id, p.desc, p.effect.kind, p.effect.value);
  for (const p of doctrine.perks) laneReward(p.id, p.desc, p.effect.kind, p.effect.value);
});

describe("Grand Challenges, their forks and Megaproject Mandates", () => {
  for (const c of challenges.list) {
    laneReward(c.id, c.reward.desc, c.reward.kind, c.reward.magnitude);
    for (const f of c.forks ?? []) laneReward(`${c.id}/${f.id}`, f.reward.desc, f.reward.kind, f.reward.magnitude);
  }
  for (const m of challenges.megaproject.mandates.defs) laneReward(m.id, m.desc, m.lane, m.value);
});

describe("Trials quote their handicap, condition and reward", () => {
  const LANE = { compute: "Compute", data: "Data", money: "Money" } as const;
  for (const t of trials.list) {
    it(`${t.id}: "${t.desc}"`, () => {
      if (t.handicap) {
        const f = t.handicap.factor;
        const left = f === 0.5 ? new RegExp(`(HALF|50%) ${LANE[t.handicap.lane]}`) : new RegExp(`${Math.round(f * 100)}% ${LANE[t.handicap.lane]}`);
        expect(t.desc).toMatch(left);
      }
      if (t.condition === "hot") expect(t.desc).toContain(`${CONDITION_THRESHOLDS.hot} or higher`);
      if (t.condition === "neutral") expect(t.desc).toContain(`±${CONDITION_THRESHOLDS.neutralBand}`);
      if (t.reward) {
        expect(percents(t.desc)).toContain(t.reward.value);
        expect(t.desc).toContain(`${LANE[t.reward.lane]}, permanently`);
      }
      if (t.bonus?.productSlots) expect(t.desc).toContain(`+${t.bonus.productSlots} product slot`);
      if (t.bonus?.rep) expect(t.desc).toContain(`+${t.bonus.rep} Lab Reputation`);
      if (t.unplug) expect(t.desc).toMatch(/Legacy/);
      // The running card's "Ship to bank …" line is derived; it names the same payout.
      for (const part of trialRewardLabel(t).split(" and ")) expect(t.desc).toContain(part);
    });
  }
});

describe("office perks, staff roles and dark-web tools", () => {
  for (const p of balance.office.perks) {
    it(`${p.id}: "${p.desc}"`, () => {
      const got = percents(p.desc);
      if (p.morale > 0) expect(got).toContain(p.morale);
      if (p.payrollMult !== 1) expect(got).toContain(-Math.round((1 - p.payrollMult) * 100) / 100);
    });
  }
  for (const r of balance.staff.roles) {
    it(`${r.id}: "${r.desc}"`, () => {
      const [pct] = percents(r.desc);
      expect(Math.abs(pct!)).toBe(r.effect.perLevel);
    });
  }
  for (const u of balance.upgrades.filter((x) => x.effect.kind === "dataPerSec")) {
    it(`${u.id}: "${u.desc}"`, () => expect(quoted(u.desc)).toBe((u.effect as { perLevel: number }).perLevel));
  }
});

describe("Field Notes lore quotes the count it unlocks at", () => {
  // Lore that names its own unlock count in words. The rest is unnumbered satire.
  const NAMED: Record<string, number> = {
    closing: 0, // filled from the data below
    pmf: 0,
    the_growth_team: 0,
    diminishing_godhood: 0,
  };
  const byWord = (s: string): number | null => {
    if (/\bA million\b/.test(s)) return 1_000_000;
    if (/\bA hundred thousand\b/.test(s)) return 100_000;
    return quoted(s);
  };
  for (const id of Object.keys(NAMED)) {
    const e = codex.entries.find((x) => x.id === id)!;
    it(`${id}: "${e.body.slice(0, 40)}…"`, () => expect(byWord(e.body)).toBe(e.threshold));
  }
});

describe("the Money lane is the lab's run income, not product revenue", () => {
  // Why a Money reward may not say "all revenue": a completed "Enterprise Trust"
  // (moneyMult +50%) lifts derive's Money multiplier and leaves every product's
  // revenue exactly where it was.
  it("a completed Money challenge moves moneyMult and no product's revenue", () => {
    const s = createInitialState();
    s.prestige.ships = 20;
    const p: ProductState = {
      id: "prod-1", name: "Nimbus", type: "code", version: 3, quality: s.products.frontier,
      priceMult: 1, enterprise: false, enterprisePrice: 1, marketingPerSec: 0, channelMix: { ads: 1 },
      mau: 1e5, paid: 1e4, buzzSec: 0, ageSec: 5_000, upgrade: null, features: [],
    };
    s.products = { ...s.products, active: [p] };
    const won: GameState = {
      ...s,
      challenges: { ...s.challenges, completed: ["aligned_agi"], forks: { aligned_agi: "enterprise_trust" } },
    };
    const a = derive(s);
    const b = derive(won);
    expect(b.moneyMult.div(a.moneyMult).toNumber()).toBeCloseTo(1.5, 9);
    expect(b.productModsById).toEqual(a.productModsById);
    expect(settledMrr(p, won.products.frontier, b.productModsById[p.id]))
      .toBe(settledMrr(p, s.products.frontier, a.productModsById[p.id]));
  });
});

describe("every goal is reachable", () => {
  const slots = 3
    + reputation.perks.reduce((n, p) => n + (p.effect.kind === "productSlot" ? p.effect.value : 0), 0)
    + legacyTree.perks.reduce((n, p) => n + ("unlock" in p.effect ? p.effect.value : 0), 0)
    + trials.list.reduce((n, t) => n + (t.bonus?.productSlots ?? 0), 0);
  it("product-count goals fit the slots a lab can own", () => {
    for (const o of objectives.pool.filter((x) => x.metric === "liveProducts")) expect(o.target).toBeLessThanOrEqual(slots);
    for (const m of productMilestones.filter((x) => x.metric === "live")) expect(m.threshold).toBeLessThanOrEqual(slots);
    for (const a of achievements.filter((x) => x.metric === "liveProducts")) expect(a.threshold).toBeLessThanOrEqual(slots);
  });
  it("staff-count goals fit the roster the save keeps", () => {
    for (const o of objectives.pool.filter((x) => x.metric === "staff")) expect(o.target).toBeLessThanOrEqual(balance.staff.maxRoster);
    for (const c of contracts.pool.filter((x) => x.metric === "employees")) expect(c.target).toBeLessThanOrEqual(balance.staff.maxRoster);
  });
  it("theme-count goals fit the themes play can earn", () => {
    const earnable = themes.filter((t) => t.unlock.kind !== "premium").length;
    for (const a of achievements.filter((x) => x.metric === "themesUnlocked")) expect(a.threshold).toBeLessThanOrEqual(earnable);
    for (const e of codex.entries.filter((x) => x.metric === "themesUnlocked")) expect(e.threshold).toBeLessThanOrEqual(earnable);
  });
  it("era goals name an era that exists", () => {
    for (const a of achievements.filter((x) => x.metric === "eraReached")) expect(a.threshold).toBeLessThan(balance.eras.list.length);
  });
  it("rival goals fit the named rivals", () => {
    for (const a of achievements.filter((x) => x.metric === "rivalsBeaten")) expect(a.threshold).toBeLessThanOrEqual(market.rivals.length);
    for (const e of codex.entries.filter((x) => x.metric === "rivalsBeaten")) expect(e.threshold).toBeLessThanOrEqual(market.rivals.length);
  });
  it("the Running Hot Trial asks for Heat the meter can reach", () => {
    expect(CONDITION_THRESHOLDS.hot).toBeLessThanOrEqual(balance.heat.max);
  });
});

describe("'Revenue' never labels the Money lane", () => {
  // The moneyMult lane is the lab's run income ("Money"); product revenue is a separate
  // economy it never touches (see above). The Objective lane buttons, the world-event
  // modifier chips and summaries, the event copy and the Directive summary all called
  // it "Revenue", so a player boosting it watched their products' Revenue /s sit still.
  const MONEY_TARGET = "moneyMult";
  it("the Objective lane label is Money", () => {
    expect(laneLabel(MONEY_TARGET)).toBe("Money");
    for (const o of objectives.pool) {
      for (const lane of ["computeMult", "dataMult", "moneyMult"] as const) {
        expect(objectiveRewardLabel({ ...o.reward, target: lane })).not.toMatch(/Revenue/i);
      }
    }
  });
  it("every Money world event and choice names Money, with the factor it applies", () => {
    let seen = 0;
    for (const e of balance.worldEvents.list) {
      const lines: { text: string; effect: typeof e.effect }[] = [];
      if (e.effect) lines.push({ text: e.body, effect: e.effect });
      for (const c of e.choices ?? []) lines.push({ text: c.label, effect: c.effect });
      for (const { text, effect } of lines) {
        expect(text).not.toMatch(/Revenue\s*[×x]\s*\d/);
        if (effect?.kind !== "buff" || effect.target !== MONEY_TARGET) continue;
        seen++;
        expect(text).toContain(`Money ×${effect.factor}`);
      }
    }
    expect(seen).toBeGreaterThan(10);
  });
  it("the modifier chip and the event summary say Money", () => {
    const s = createInitialState();
    for (const e of balance.worldEvents.list) {
      const r = applyWorldEvent(s, e.id);
      expect(r.event.summary).not.toMatch(/Revenue/);
      for (const c of r.event.choices ?? []) expect(c.summary).not.toMatch(/Revenue/);
      for (const m of r.state.modifiers) expect(m.label).not.toMatch(/Revenue/);
    }
    const viral = applyWorldEvent(s, "viral_demo");
    expect(viral.state.modifiers[0]!.label).toBe("Money ×2");
    expect(viral.event.summary).toMatch(/^Money ×2/);
  });
  it("the Money lane's proper names say Money: Legacy nodes, the Mandate, the charter pitch", () => {
    // Legacy Investment nodes and Megaproject Mandates are named after their lane; the
    // Money ones read "Revenue Specialist / Mastery / Frontier" and "Revenue Mandate"
    // though they raise run income, not product revenue. Ids stay put (saves hold them).
    const moneyNodes = legacyTree.perks.filter((p) => "lane" in p.effect && p.effect.lane === "money");
    expect(moneyNodes.map((p) => p.name)).toEqual(["Money Specialist", "Money Mastery", "Money Frontier"]);
    expect(moneyNodes.map((p) => p.id)).toEqual(["leg_money1", "leg_money2", "leg_money3"]);
    const mandate = challenges.megaproject.mandates.defs.find((m) => m.lane === "money")!;
    expect(mandate.id).toBe("mand_money");
    expect(mandate.name).toBe("Money Mandate");
    for (const p of legacyTree.perks) expect(`${p.name} ${p.desc}`).not.toMatch(/Revenue/);
    for (const m of challenges.megaproject.mandates.defs) expect(`${m.name} ${m.desc}`).not.toMatch(/Revenue/);
    for (const c of charters.list.filter((x) => (x.moneyMult ?? 0) !== 0)) expect(`${c.name} ${c.blurb}`).not.toMatch(/Revenue/);
  });
  it("the owned-Directive summary names the Money lane Money", () => {
    const money = reputation.endowment.directives.defs.find((d) => d.lane === "money")!;
    const s: GameState = { ...createInitialState(), endowmentDirectives: [money.id] };
    expect(directiveSummary(s)).toEqual([`Money +${Math.round(money.value * 100)}%`]);
  });
});
