/**
 * Achievement definitions (Phase 3) — a cross-system badge collection that spans
 * the whole game (hall scale, business, team, prestige legacy, meta). Pure DATA;
 * the detection/progress logic lives in engine/achievements.ts and reads the
 * lifetime-stats store. Reward-free by design in this step (the dopamine is the
 * badge + toast); lab reputation (a later step) will grant points per unlock.
 *
 * Humour lives here (writing), never in the math — per the design spine.
 */
import { balance } from "./config";
import { market } from "./market";

/** Number of named rivals on the AI market — the "outrank everyone" badge derives
 *  its threshold from this so it can't drift when the roster changes (same pattern
 *  as RESEARCH_TREE_SIZE below). */
const NAMED_RIVALS = market.rivals.length;

/** Max research nodes OWNABLE in one run — the "own everything" capstone tracks
 *  this so it can't drift when nodes are added/removed. Mutually-exclusive groups
 *  only let you own one sibling, so each group of size G costs (G−1) off the total. */
const RESEARCH_TREE_SIZE = (() => {
  const groupSize: Record<string, number> = {};
  for (const r of balance.research) if (r.exclusiveGroup) groupSize[r.exclusiveGroup] = (groupSize[r.exclusiveGroup] ?? 0) + 1;
  const lockedOut = Object.values(groupSize).reduce((sum, g) => sum + (g - 1), 0);
  return balance.research.length - lockedOut;
})();

export type AchMetric =
  | "peakCompute"
  | "totalMoney"
  | "peakMrr"
  | "peakMau"
  | "liveProducts"
  | "productsLaunched"
  | "productsSold"
  | "peakVersion"
  | "employeesHired"
  | "staffLevel"
  | "totalShips"
  | "totalLegacy"
  | "eraReached"
  | "peakResearch"
  | "worldEventsResolved"
  | "playtimeSec"
  | "openSourceShips"
  | "contractsDone"
  | "legacyInvested"
  | "rivalsBeaten"
  | "ascensions"
  | "themesUnlocked";

export type AchCategory = "scale" | "business" | "team" | "legacy" | "meta";

export interface AchievementDef {
  id: string;
  label: string;
  desc: string;
  cat: AchCategory;
  metric: AchMetric;
  /** Unlocks when the metric reaches this value. */
  threshold: number;
  /** Hidden until unlocked (the description shows only after). */
  secret?: boolean;
  /** Lab Reputation points granted on unlock (default 2; see engine/reputation.ts). */
  rep?: number;
}

/** Reputation granted by an achievement on unlock (defaults to 2). */
export function achievementRep(def: AchievementDef): number {
  return def.rep ?? 2;
}

export const achievements: AchievementDef[] = [
  // ---- Scale (Compute) ----
  { id: "compute_1k", label: "It Computes", desc: "Reach 1K Compute/sec", cat: "scale", metric: "peakCompute", threshold: 1_000 },
  { id: "compute_1m", label: "Server Room", desc: "Reach 1M Compute/sec", cat: "scale", metric: "peakCompute", threshold: 1_000_000 },
  { id: "compute_1b", label: "Datacenter", desc: "Reach 1B Compute/sec", cat: "scale", metric: "peakCompute", threshold: 1_000_000_000 },
  { id: "compute_1t", label: "Hyperscale", desc: "Reach 1T Compute/sec", cat: "scale", metric: "peakCompute", threshold: 1_000_000_000_000 },

  // ---- Business (Money / Products) ----
  { id: "money_10k", label: "Seed Round", desc: "Earn $10K lifetime", cat: "business", metric: "totalMoney", threshold: 10_000 },
  { id: "money_10m", label: "Series A", desc: "Earn $10M lifetime", cat: "business", metric: "totalMoney", threshold: 10_000_000 },
  { id: "money_10b", label: "Unicorn", desc: "Earn $10B lifetime", cat: "business", metric: "totalMoney", threshold: 10_000_000_000 },
  { id: "mrr_1k", label: "Recurring Revenue", desc: "Hit $1K/s total revenue", cat: "business", metric: "peakMrr", threshold: 1_000 },
  { id: "mrr_100k", label: "Cash Machine", desc: "Hit $100K/s total revenue", cat: "business", metric: "peakMrr", threshold: 100_000 },
  { id: "mau_1m", label: "Going Viral", desc: "Reach 1M total users", cat: "business", metric: "peakMau", threshold: 1_000_000 },
  { id: "mau_100m", label: "Everyone's App", desc: "Reach 100M total users", cat: "business", metric: "peakMau", threshold: 100_000_000 },
  { id: "launch_1", label: "Hello, World", desc: "Launch your first product", cat: "business", metric: "productsLaunched", threshold: 1 },
  { id: "launch_10", label: "Product Machine", desc: "Launch 10 products", cat: "business", metric: "productsLaunched", threshold: 10 },
  { id: "live_3", label: "Conglomerate", desc: "Run 3 products at once", cat: "business", metric: "liveProducts", threshold: 3 },
  { id: "sold_5", label: "Serial Founder", desc: "Sell 5 products", cat: "business", metric: "productsSold", threshold: 5 },
  { id: "version_10", label: "Never Stale", desc: "Take a product to v10", cat: "business", metric: "peakVersion", threshold: 10 },
  { id: "version_25", label: "Ship of Theseus", desc: "Take a product to v25", cat: "business", metric: "peakVersion", threshold: 25 },

  // ---- Team ----
  { id: "hire_1", label: "First Employee", desc: "Hire your first specialist", cat: "team", metric: "employeesHired", threshold: 1 },
  { id: "hire_10", label: "Staffing Up", desc: "Hire 10 employees", cat: "team", metric: "employeesHired", threshold: 10 },
  { id: "hire_50", label: "Real HR Problem", desc: "Hire 50 employees", cat: "team", metric: "employeesHired", threshold: 50 },
  { id: "hire_200", label: "Org Chart", desc: "Hire 200 employees", cat: "team", metric: "employeesHired", threshold: 200 },
  { id: "level_max", label: "Principal", desc: "Train someone to max level", cat: "team", metric: "staffLevel", threshold: 4 },

  // ---- Legacy (Prestige) ----
  { id: "ship_1", label: "Ship It", desc: "Ship the Model once", cat: "legacy", metric: "totalShips", threshold: 1 },
  { id: "ship_5", label: "Iteration", desc: "Ship the Model 5 times", cat: "legacy", metric: "totalShips", threshold: 5 },
  { id: "ship_25", label: "Relentless", desc: "Ship the Model 25 times", cat: "legacy", metric: "totalShips", threshold: 25 },
  { id: "ship_50", label: "Veteran", desc: "Ship the Model 50 times", cat: "legacy", metric: "totalShips", threshold: 50 },
  { id: "ship_100", label: "Centurion", desc: "Ship the Model 100 times", cat: "legacy", metric: "totalShips", threshold: 100 },
  { id: "legacy_1k", label: "Heavy Weights", desc: "Bank 1K Legacy Weights", cat: "legacy", metric: "totalLegacy", threshold: 1_000 },
  { id: "legacy_1m", label: "Legend", desc: "Bank 1M Legacy Weights", cat: "legacy", metric: "totalLegacy", threshold: 1_000_000 },
  { id: "legacy_1b", label: "Titan", desc: "Bank 1B Legacy Weights", cat: "legacy", metric: "totalLegacy", threshold: 1_000_000_000 },
  { id: "era_3", label: "Frontier Lab", desc: "Reach the Frontier Lab era", cat: "legacy", metric: "eraReached", threshold: 3 },
  { id: "era_4", label: "Hyperscaler", desc: "Reach the Hyperscaler era", cat: "legacy", metric: "eraReached", threshold: 4 },
  { id: "era_5", label: "Singularity", desc: "Reach the Post-Singularity era — you built AGI", cat: "legacy", metric: "eraReached", threshold: 5 },

  // ---- Meta ----
  { id: "research_15", label: "Well Read", desc: "Own 15 research nodes in one run", cat: "meta", metric: "peakResearch", threshold: 15 },
  // Capstone = the full tree, derived so it can't drift (was an unreachable
  // hardcoded 30, then a brittle 17) — a true "own everything" badge.
  { id: "research_30", label: "Completionist", desc: "Own every research node in a single run", cat: "meta", metric: "peakResearch", threshold: RESEARCH_TREE_SIZE },
  { id: "events_25", label: "Survivor", desc: "Resolve 25 world events", cat: "meta", metric: "worldEventsResolved", threshold: 25 },
  { id: "play_1h", label: "Hooked", desc: "Play for 1 hour", cat: "meta", metric: "playtimeSec", threshold: 3_600 },
  { id: "play_10h", label: "Dedicated", desc: "Play for 10 hours", cat: "meta", metric: "playtimeSec", threshold: 36_000 },

  // ---- New systems (open-source · market · contracts · legacy tree · ascension) ----
  { id: "os_1", label: "People's Champion", desc: "Open-source a model — give it to the world", cat: "business", metric: "openSourceShips", threshold: 1 },
  { id: "os_5", label: "For the Culture", desc: "Open-source 5 models", cat: "business", metric: "openSourceShips", threshold: 5 },
  { id: "market_3", label: "Podium Finish", desc: "Outrank 3 named rivals on the AI market", cat: "business", metric: "rivalsBeaten", threshold: 3 },
  { id: "market_1", label: "Market Leader", desc: "Outrank every named rival — top the AI market", cat: "business", metric: "rivalsBeaten", threshold: NAMED_RIVALS },
  { id: "contracts_5", label: "Deal Maker", desc: "Complete 5 contracts", cat: "meta", metric: "contractsDone", threshold: 5 },
  { id: "contracts_10", label: "Always Be Closing", desc: "Complete 10 contracts", cat: "meta", metric: "contractsDone", threshold: 10 },
  { id: "legacy_1", label: "Specialist", desc: "Invest in the Legacy tree", cat: "legacy", metric: "legacyInvested", threshold: 1 },
  { id: "legacy_3", label: "Min-Maxer", desc: "Own 3 Legacy investments at once", cat: "legacy", metric: "legacyInvested", threshold: 3 },
  { id: "ascend_1", label: "Transcendence", desc: "Ascend once in the Post-Singularity era", cat: "legacy", metric: "ascensions", threshold: 1 },
  { id: "ascend_5", label: "Beyond", desc: "Ascend 5 times", cat: "legacy", metric: "ascensions", threshold: 5 },

  // ---- Cosmetic collection (R6.3) — earn hall themes by playing ----
  { id: "wardrobe", label: "Wardrobe", desc: "Unlock 6 hall themes", cat: "meta", metric: "themesUnlocked", threshold: 6 },
  { id: "haute_couture", label: "Haute Couture", desc: "Unlock 10 hall themes", cat: "meta", metric: "themesUnlocked", threshold: 10 },

  // ---- Secret / satirical ----
  { id: "secret_idle", label: "Touch Grass", desc: "Play for 24 hours total. We're not judging.", cat: "meta", metric: "playtimeSec", threshold: 86_400, secret: true },
  { id: "secret_flipper", label: "Exit Strategy", desc: "Sell 20 products. Founder, or flipper?", cat: "business", metric: "productsSold", threshold: 20, secret: true },
];
