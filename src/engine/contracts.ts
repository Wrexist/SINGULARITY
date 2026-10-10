import { contracts as C, type ContractDef } from "./balance/contracts";
import { totalRacks } from "./hall";
import type { GameState } from "./types";

/**
 * Contracts engine (Phase 4) — pure/deterministic. The board is derived from the
 * `completed` list (the first `slots` uncompleted pool entries), so there is no
 * stored board to migrate or desync. Claiming a ready contract just appends its
 * id to `completed`; the Reputation reward flows automatically through
 * `earnedReputation` (which sums completed-contract rewards), mirroring how
 * achievements feed Reputation.
 */

export { C as contractsBalance };

const DEF_BY_ID = new Map(C.pool.map((d) => [d.id, d]));

/** Current value of a contract's metric, read straight from state/stats. */
export function contractMetric(state: GameState, metric: ContractDef["metric"]): number {
  switch (metric) {
    case "peakComputePerSec": return state.stats.peakComputePerSec.toNumber();
    case "totalMoney": return state.stats.totalMoney.toNumber();
    case "totalRacks": return totalRacks(state);
    case "productsActive": return state.products.active.length;
    case "employees": return state.employees.length;
    case "ships": return state.prestige.ships;
    case "research": return Math.max(state.research.length, state.stats.peakResearchCount);
    case "peakMrr": return state.stats.peakMrr;
    case "peakMau": return state.stats.peakMau;
    case "ascensions": return state.stats.ascensions;
  }
}

export function contractDone(state: GameState, def: ContractDef): boolean {
  return contractMetric(state, def.metric) >= def.target;
}

/** The board: the first `slots` pool contracts not yet completed, in order. */
export function activeContracts(state: GameState): ContractDef[] {
  if (!C.enabled) return [];
  const done = new Set(state.contracts.completed);
  return C.pool.filter((d) => !done.has(d.id)).slice(0, C.slots);
}

/** True when a contract is on the board, met, and not yet claimed. */
export function contractReady(state: GameState, id: string): boolean {
  if (state.contracts.completed.includes(id)) return false;
  if (!activeContracts(state).some((d) => d.id === id)) return false;
  const def = DEF_BY_ID.get(id);
  return !!def && contractDone(state, def);
}

/** Claim a ready contract: record completion (Reputation follows via earned). */
export function claimContract(state: GameState, id: string): GameState {
  if (!contractReady(state, id)) return state;
  return { ...state, contracts: { completed: [...state.contracts.completed, id] } };
}

/** Total Reputation earned from completed contracts (summed into earnedReputation).
 *  Sponsor completions (`sponsor_<dayKey>`) pay the flat sponsor rate. */
export function contractsReputation(state: GameState): number {
  let pts = 0;
  let campaigns = 0;
  for (const id of state.contracts.completed) {
    if (SPONSOR_ID_RE.test(id)) pts += C.sponsor.rep;
    else if (CAMPAIGN_ID_RE.test(id)) campaigns++;
    else pts += DEF_BY_ID.get(id)?.rep ?? 0;
  }
  // The n-th banked campaign pays its tier's bonus (order-free: only the count matters).
  for (let n = 0; n < campaigns; n++) pts += campaignRep(n);
  return pts;
}

/** A ladder contract id (not a daily sponsor or a weekly campaign record). */
export function isLadderContractId(id: string): boolean {
  return !SPONSOR_ID_RE.test(id) && !CAMPAIGN_ID_RE.test(id);
}

// ---------- IDEAS #9 — rotating daily sponsor contracts (post-ladder) ----------

/** Completed-sponsor id format: sponsor_<local days-since-epoch>. */
export const SPONSOR_ID_RE = /^sponsor_\d{1,7}$/;

export const sponsorIdFor = (dayKey: number): string => `sponsor_${dayKey}`;

/** The latest sponsor day this lab has rolled or completed (-1 = none). Saves from
 *  before round 10 keyed sponsors by UTC day and later ones by local day; both are
 *  plain day numbers, so the store keeps new rolls from going back past this one
 *  (a zone change west must not roll an earlier day's sponsor over today's). */
export function lastSponsorDay(state: GameState): number {
  let last = state.sponsor?.dayKey ?? -1;
  for (const id of state.contracts.completed) {
    if (SPONSOR_ID_RE.test(id)) last = Math.max(last, Number(id.slice(8)));
  }
  return last;
}

/** Small deterministic day hash (Knuth multiplicative). */
const dayHash = (dayKey: number): number => (dayKey * 2654435761) >>> 0;

/**
 * Roll (or clear) today's sponsor objective. Deterministic in (state, dayKey);
 * same-ref no-op when nothing changes. Offered once the base ladder is cleared,
 * or alongside it from `openAtShips` ships on; the target is anchored to the CURRENT stat at roll time so
 * it stays a fixed, beatable goal for the day. The store passes the local
 * day number in — the engine stays clockless.
 */
export function rollSponsor(state: GameState, dayKey: number): GameState {
  const S = C.sponsor;
  const open = activeContracts(state).length === 0 || (S.openAtShips > 0 && state.prestige.ships >= S.openAtShips);
  // A sponsor that was met but not yet claimed is banked before it is replaced or
  // cleared: the player earned it ("miss it and nothing is lost"), and a lab that
  // simply didn't open GOALS that day used to lose the Reputation at the rollover.
  // claimSponsor is a same-ref no-op for an unmet or already-claimed sponsor.
  if (!C.enabled || !S.enabled || !open) {
    return state.sponsor === null ? state : { ...bankCampaign(claimSponsor(state)), sponsor: null };
  }
  if (state.sponsor?.dayKey === dayKey) return state;
  // Bank today's met sponsor, then — on a new week — the finished week's met campaign.
  let banked = claimSponsor(state);
  if (state.sponsor && weekOf(state.sponsor.dayKey) !== weekOf(dayKey)) banked = bankCampaign(banked);
  const h = dayHash(dayKey);
  // Only lanes the player has actually started: a lab with no products yet must not
  // be asked to grow product revenue. A cleared-ladder veteran has every lane > 0,
  // so their daily roll is unchanged.
  // Only lanes whose "beat your best" target is a real number: all-time earnings and
  // peak Compute are Bigs a deep-endgame lab carries past 1.8e308, where the number read
  // is Infinity — the goal became "∞", met the moment it was rolled, and its target
  // saved as null so the loader dropped it. Identity below that scale.
  const topMult = Math.max(...S.mults);
  const finite = S.lanes.filter((l) => Number.isFinite(contractMetric(state, l.metric) * topMult));
  const started = finite.filter((l) => contractMetric(state, l.metric) > 0);
  const lanes = started.length > 0 ? started : finite.length > 0 ? finite : S.lanes;
  const lane = lanes[h % lanes.length]!;
  const current = contractMetric(state, lane.metric);
  const mult = S.mults[(h >>> 4) % S.mults.length]!;
  const target = Math.max(lane.floor, Math.ceil(current * mult));
  // The week's campaign sponsor runs every day of that week (one banner per campaign).
  const title = campaignSponsor(weekOf(dayKey));
  return {
    ...banked,
    sponsor: {
      dayKey,
      metric: lane.metric,
      target,
      rep: S.rep,
      title,
      desc: `Today's objective: push your ${lane.noun} past the sponsor's bar. No deadline pressure — miss it and nothing is lost.`,
    },
  };
}

/** Live view of today's sponsor objective (null when none rolled). */
export function sponsorView(state: GameState): (ContractView & { claimed: boolean }) | null {
  const sp = state.sponsor;
  if (!sp) return null;
  const metric = sp.metric as ContractDef["metric"];
  const value = contractMetric(state, metric);
  const claimed = state.contracts.completed.includes(sponsorIdFor(sp.dayKey));
  return {
    def: { id: sponsorIdFor(sp.dayKey), title: sp.title, desc: sp.desc, metric, target: sp.target, rep: sp.rep },
    value,
    progress: sp.target > 0 ? Math.min(1, value / sp.target) : 1,
    ready: !claimed && value >= sp.target,
    claimed,
  };
}

/** Claim today's met sponsor objective (records `sponsor_<dayKey>`). */
export function claimSponsor(state: GameState): GameState {
  const v = sponsorView(state);
  if (!v || !v.ready) return state;
  return { ...state, contracts: { completed: [...state.contracts.completed, sponsorIdFor(state.sponsor!.dayKey)] } };
}

export interface ContractView {
  def: ContractDef;
  value: number;
  /** 0..1 progress toward the target. */
  progress: number;
  ready: boolean;
}

/** The board with live progress, for the UI. */
export function contractBoard(state: GameState): ContractView[] {
  const completed = new Set(state.contracts.completed);
  return activeContracts(state).map((def) => {
    const value = contractMetric(state, def.metric);
    return {
      def,
      value,
      progress: def.target > 0 ? Math.min(1, value / def.target) : 1,
      ready: value >= def.target && !completed.has(def.id),
    };
  });
}

// ---------- AUDIT 2026-08 #5 — weekly Sponsor Campaigns ----------

/** Banked-campaign id format: campaign_<week number>. */
export const CAMPAIGN_ID_RE = /^campaign_\d{1,6}$/;
export const campaignIdFor = (weekKey: number): string => `campaign_${weekKey}`;

/** Monday-to-Sunday weeks over the local day number (day 0 was Thursday 1 Jan 1970,
 *  so day 4 — the first Monday — opens week 1). */
export const weekOf = (dayKey: number): number => Math.floor((dayKey + 3) / 7);
export const weekStartDay = (weekKey: number): number => weekKey * 7 - 3;

/** The sponsor whose banner a week's campaign runs under (deterministic by week). */
export function campaignSponsor(weekKey: number): string {
  const S = C.sponsor;
  return S.sponsors[(((weekKey * 2654435761) >>> 0) >>> 8) % S.sponsors.length]!;
}

/** Which of a week's seven days (Monday first) have a completed sponsor. */
export function campaignDays(completed: readonly string[], weekKey: number): boolean[] {
  const start = weekStartDay(weekKey);
  const days = [false, false, false, false, false, false, false];
  for (const id of completed) {
    if (!SPONSOR_ID_RE.test(id)) continue;
    const d = Number(id.slice(8)) - start;
    if (d >= 0 && d < 7) days[d] = true;
  }
  return days;
}

/** Bonus Reputation for the n-th banked campaign (0-based): tier-scaled, capped. */
export function campaignRep(n: number): number {
  const K = C.campaign;
  return K.rep + K.perTier * Math.min(Math.max(0, n), K.tierCap);
}

/** Campaigns banked so far = the Sponsor Tier. */
export function sponsorTier(state: GameState): number {
  let n = 0;
  for (const id of state.contracts.completed) if (CAMPAIGN_ID_RE.test(id)) n++;
  return n;
}

export function sponsorTierName(tier: number): string {
  const t = C.campaign.tiers;
  return t[Math.min(Math.max(0, tier), t.length - 1)]!;
}

export interface CampaignView {
  weekKey: number;
  /** The sponsor whose banner the week runs under. */
  title: string;
  /** Seven flags, Monday first: a sponsor completed that day. */
  days: boolean[];
  /** Today's place in the week (0 = Monday). */
  today: number;
  done: number;
  need: number;
  /** Met and not yet banked. */
  ready: boolean;
  claimed: boolean;
  /** Current Sponsor Tier (campaigns banked) and its name; the rung a claim reaches. */
  tier: number;
  tierName: string;
  nextTierName: string;
  /** Reputation this campaign pays when banked. */
  reward: number;
}

/** The current week's campaign (keyed off today's rolled sponsor — clockless), or
 *  null when no sponsor runs. */
export function campaignView(state: GameState): CampaignView | null {
  const K = C.campaign;
  const sp = state.sponsor;
  if (!C.enabled || !C.sponsor.enabled || !K.enabled || !sp) return null;
  const weekKey = weekOf(sp.dayKey);
  const days = campaignDays(state.contracts.completed, weekKey);
  const done = days.filter(Boolean).length;
  const claimed = state.contracts.completed.includes(campaignIdFor(weekKey));
  const tier = sponsorTier(state);
  return {
    weekKey,
    title: campaignSponsor(weekKey),
    days,
    today: sp.dayKey - weekStartDay(weekKey),
    done,
    need: K.needDays,
    ready: !claimed && done >= K.needDays,
    claimed,
    tier,
    tierName: sponsorTierName(tier),
    nextTierName: sponsorTierName(tier + 1),
    reward: campaignRep(tier),
  };
}

/** Bank the current week's met campaign (records `campaign_<week>`; same-ref no-op
 *  when it isn't met or is already banked). */
export function bankCampaign(state: GameState): GameState {
  const v = campaignView(state);
  if (!v || !v.ready) return state;
  return { ...state, contracts: { completed: [...state.contracts.completed, campaignIdFor(v.weekKey)] } };
}
