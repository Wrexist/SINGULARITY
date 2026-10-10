import { market as M } from "./balance/market";
import { marketLeaderboard } from "./market";
import { Big } from "./math/Big";
import type { ActiveModifier, GameState, ModifierTarget } from "./types";

/**
 * The Rival Cold War (AUDIT 2026-08 #8) — pure and deterministic. Operations target
 * your NEAREST rival; hostile ones schedule a retaliation at a playtime second hashed
 * from the lab's own state (no RNG), which the tick applies as a temporary "bad"
 * modifier — a workable incident. Pacts buy a surge and a truce. All effects are
 * temporary modifiers behind a player tap; see balance/market.ts `coldWar`.
 */

const W = M.coldWar;
export type ColdWarOp = keyof typeof W.ops;
export type RetaliationKind = keyof typeof W.retaliation;
export const COLD_WAR_OPS: ColdWarOp[] = ["poach", "takedown", "pact"];
const RIVAL_NAMES = new Set(M.rivals.map((r) => r.name));

export type Posture = "pact" | "hostile" | "neutral";

export interface ColdWarTarget {
  name: string;
  vendor: string;
  users: number;
  posture: Posture;
}

/** Your best live product's users (0 with none). */
function myBestUsers(state: GameState): number {
  return marketLeaderboard(state).find((e) => e.isYou)?.users ?? 0;
}

export function rivalPosture(state: GameState, name: string): Posture {
  const cw = state.coldWar;
  if ((cw.pacts[name] ?? 0) > state.stats.playtimeSec) return "pact";
  if (cw.pending.some((p) => p.rival === name) || cw.crossed.includes(name)) return "hostile";
  return "neutral";
}

/** The rival your operations aim at: the smallest one still AHEAD of you, or — when
 *  you lead the market — the runner-up on your heels. Null without a live product. */
export function coldWarTarget(state: GameState): ColdWarTarget | null {
  if (!W.enabled || state.products.active.length === 0) return null;
  const board = marketLeaderboard(state).filter((e) => !e.isYou && RIVAL_NAMES.has(e.name));
  if (board.length === 0) return null;
  const mine = myBestUsers(state);
  const ahead = board.filter((e) => e.users > mine).sort((a, b) => a.users - b.users);
  const pick = ahead[0] ?? [...board].sort((a, b) => b.users - a.users)[0]!;
  return { name: pick.name, vendor: pick.vendor, users: pick.users, posture: rivalPosture(state, pick.name) };
}

/** Money an operation costs right now: the larger of a rival-sized fee and a share of
 *  your bank (so it stays a decision however rich the lab gets). */
export function coldWarCost(op: ColdWarOp, rivalUsers: number, bank: Big): Big {
  const fee = Big.of(Math.max(1, Math.round(rivalUsers * W.ops[op].costPerUser)));
  return fee.max(bank.mul(W.ops[op].bankShare).floor());
}

/** Seconds of play until the next operation (0 = ready). */
export function coldWarCooldown(state: GameState): number {
  const last = state.coldWar.lastOpSec;
  if (last === null) return 0;
  return Math.max(0, W.cooldownSec - (state.stats.playtimeSec - last));
}

export function canRunColdWarOp(state: GameState, op: ColdWarOp): boolean {
  const t = coldWarTarget(state);
  if (!t || coldWarCooldown(state) > 0) return false;
  if (op === "pact" && t.posture === "pact") return false; // already allied
  return state.resources.money.gte(coldWarCost(op, t.users, state.resources.money));
}

/** Small integer mix → the retaliation delay (deterministic in the lab's state). */
function delaySec(state: GameState, rival: string): number {
  let h = Math.imul(state.coldWar.ops + 1, 2654435761);
  for (let i = 0; i < rival.length; i++) h = Math.imul(h ^ rival.charCodeAt(i), 16777619);
  h ^= Math.imul(Math.floor(Math.max(0, state.stats.playtimeSec)), 97);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h ^= h >>> 13;
  return W.retaliateMinSec + ((h >>> 0) % (W.retaliateSpreadSec + 1));
}

const modifier = (id: string, target: string, factor: number, durationSec: number, label: string): ActiveModifier => ({
  id,
  target: target as ModifierTarget,
  factor,
  remainingSec: durationSec,
  label,
  tone: factor < 1 ? "bad" : "good",
});

/** Run an operation against your nearest rival. Same-ref no-op when it can't run. */
export function runColdWarOp(state: GameState, op: ColdWarOp): GameState {
  if (!canRunColdWarOp(state, op)) return state;
  const t = coldWarTarget(state)!;
  const now = state.stats.playtimeSec;
  const def = W.ops[op];
  const id = `cw_${op}`;
  const label = op === "poach" ? `Poached from ${t.name}` : op === "takedown" ? `Takedown of ${t.name}` : `Pact with ${t.name}`;
  const cw = state.coldWar;
  let pacts = cw.pacts;
  let pending = cw.pending;
  let crossed = cw.crossed;
  if (op === "pact") {
    // A truce: the pact holds for a while and calls off any retaliation in the works.
    pacts = { ...pacts, [t.name]: now + W.pactSec };
    pending = pending.filter((p) => p.rival !== t.name);
  } else {
    if (!crossed.includes(t.name)) crossed = [...crossed, t.name];
    if (t.posture === "pact") {
      // Moving against a pact partner: the pact is off and the answer comes fast.
      const { [t.name]: _gone, ...rest } = pacts;
      pacts = rest;
      pending = [...pending.filter((p) => p.rival !== t.name), { rival: t.name, kind: "betrayal", dueSec: now + W.betrayalSec }];
    } else if (!pending.some((p) => p.rival === t.name)) {
      pending = [...pending, { rival: t.name, kind: op, dueSec: now + delaySec(state, t.name) }];
    }
  }
  return {
    ...state,
    resources: { ...state.resources, money: state.resources.money.sub(coldWarCost(op, t.users, state.resources.money)) },
    modifiers: [...state.modifiers.filter((m) => m.id !== id), modifier(id, def.target, def.factor, def.durationSec, label)],
    coldWar: { ops: cw.ops + 1, lastOpSec: now, pacts, crossed, pending },
  };
}

/** The playtime second the next retaliation lands (Infinity = none pending). */
export function nextRetaliationSec(state: GameState): number {
  let next = Infinity;
  for (const p of state.coldWar.pending) if (p.dueSec < next) next = p.dueSec;
  return next;
}

/** Land every retaliation that's due (a temporary "bad" modifier each — a workable
 *  incident). Same-ref no-op when none is due. Called by the tick at the due second. */
export function applyDueRetaliations(state: GameState): GameState {
  const now = state.stats.playtimeSec + 1e-6;
  const due = state.coldWar.pending.filter((p) => p.dueSec <= now);
  if (due.length === 0) return state;
  let mods = state.modifiers;
  for (const p of due) {
    const r = W.retaliation[p.kind];
    const id = `cw_ret_${p.kind}`;
    mods = [...mods.filter((m) => m.id !== id), modifier(id, r.target, r.factor, r.durationSec, `${r.label} (${p.rival})`)];
  }
  return { ...state, modifiers: mods, coldWar: { ...state.coldWar, pending: state.coldWar.pending.filter((p) => p.dueSec > now) } };
}
