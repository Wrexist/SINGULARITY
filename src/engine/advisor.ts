import { balance } from "./balance/config";
import { productMetrics, productsUnlocked, canStartUpgrade, maxActiveProducts } from "./products";
import { reputationBalance, canBuyReputationPerk } from "./reputation";
import { contractBoard } from "./contracts";
import { canBuyResearch } from "./actions";
import { canPrestige } from "./prestige";
import type { GameState } from "./types";

/** The first research node (no prereqs) — the new player's first capability buy. */
const FIRST_RESEARCH = balance.research[0]?.id ?? "";

/**
 * The advisor — a tiny, pure "what should I do next?" layer. It scans the game
 * state for genuine problems and waiting decisions, returning them in priority
 * order. The UI reads this to show ONE next-action nudge and small per-tab
 * attention counts, so a new player is never lost and a busy player never misses
 * a product quietly bleeding money. Deterministic; no React, no clock.
 */

export type AdvisorTab = "lab" | "products" | "employees";

export interface AdvisorItem {
  /** Which tab resolves this item (where tapping the nudge should jump). */
  tab: AdvisorTab;
  /** Player-facing one-liner. */
  text: string;
  /** Higher = more urgent. Used only for ordering. */
  priority: number;
}

/** True once the Employees tab is available (mirrors App's showStaff gate). */
function staffUnlocked(state: GameState): boolean {
  return balance.staff.enabled && state.research.length >= balance.staff.revealAtResearch;
}

/**
 * All current advisory items, most urgent first. Kept conservative on purpose:
 * every item is either a waiting decision (a model to launch, a first hire) or a
 * real problem (a product losing money with no marketing behind it, or one that
 * rivals have left behind). Investment losses — running marketing at a deliberate
 * loss to grow — are NOT flagged.
 */
export function advisorItems(state: GameState): AdvisorItem[] {
  const items: AdvisorItem[] = [];
  const ps = state.products;

  // ---- First-session hook: until the first Ship, hand-hold the core loop so a
  // brand-new player always has one obvious next move (claim → start → research
  // → ship). Gated on ships === 0 so it never nags a returning player. ----
  if (state.prestige.ships === 0) {
    if (state.run.readyToClaim) {
      items.push({ tab: "lab", text: "Claim your finished run — bank the Data & $", priority: 95 });
    }
    if (canPrestige(state)) {
      items.push({ tab: "lab", text: "Ship the Model — reset for a permanent boost", priority: 92 });
    }
    // Affordable first research outranks the idle "start a run" nudge, so it
    // actually surfaces when it becomes the meaningful next step (nextAction
    // returns only the single highest-priority item).
    const canBuyFirstResearch = state.research.length === 0 && FIRST_RESEARCH && canBuyResearch(state, FIRST_RESEARCH);
    if (canBuyFirstResearch) {
      items.push({ tab: "lab", text: "Research your first capability", priority: 70 });
    } else if (!state.run.active && !state.run.readyToClaim) {
      items.push({ tab: "lab", text: "Start a training run to earn Data & $", priority: 68 });
    }
  }

  if (productsUnlocked(state)) {
    // A raw model from Ship the Model is sitting un-commercialised — but only
    // actionable while a portfolio slot is free (else launching is blocked).
    const freeSlot = ps.active.length < maxActiveProducts(state);
    if (ps.drafts.length > 0 && freeSlot) {
      items.push({
        tab: "products",
        text: ps.drafts.length === 1 ? "Launch the model you shipped" : `Launch ${ps.drafts.length} models you shipped`,
        priority: 90,
      });
    }

    for (const p of ps.active) {
      const m = productMetrics(p, ps.frontier);
      // Rivals have pulled ahead and no new version is in the works — the one
      // unambiguous "this product needs you" signal. Suppressed during the launch /
      // new-version buzz window, matching churnReason's buzz guard, so a just-shipped
      // (stale-on-arrival) draft isn't roasted before the player can react.
      if (m.qf < 0.5 && !p.upgrade && p.buzzSec <= 0) {
        items.push({
          tab: "products",
          text: `${p.name} is behind rivals — ${canStartUpgrade(state, p.id) ? "research a new version" : "save up for a new version"}`,
          priority: 60,
        });
      }
    }

    // Products unlocked but nothing in flight: point back to the Lab.
    if (ps.active.length === 0 && ps.drafts.length === 0) {
      items.push({ tab: "lab", text: "Ship a model in the Lab to start a product", priority: 80 });
    }
  }

  // First hire: a strong early nudge once the team is unlocked.
  if (staffUnlocked(state) && state.employees.length === 0) {
    items.push({ tab: "employees", text: "Hire your first specialist", priority: 85 });
  }

  // A contract is met and waiting — a free Reputation reward sitting on the board.
  const readyContract = contractBoard(state).find((c) => c.ready);
  if (readyContract) {
    items.push({
      tab: "lab",
      text: `Claim the "${readyContract.def.title}" contract — +${readyContract.def.rep} Rep`,
      priority: 78,
    });
  }

  // Lab Reputation: a gentle nudge when a permanent perk is affordable (surfaces the
  // meta-layer, which lives in the Prestige panel and is easy to miss).
  if (reputationBalance.perks.some((p) => canBuyReputationPerk(state, p.id))) {
    items.push({ tab: "lab", text: "You can afford a Lab Reputation perk", priority: 40 });
  }

  return items.sort((a, b) => b.priority - a.priority);
}

/** The single most important thing to do right now (or null if all clear). */
export function nextAction(state: GameState): AdvisorItem | null {
  return advisorItems(state)[0] ?? null;
}

/** How many advisory items resolve on each tab — drives the small tab badges. */
export function attentionCounts(state: GameState): Record<AdvisorTab, number> {
  const counts: Record<AdvisorTab, number> = { lab: 0, products: 0, employees: 0 };
  for (const it of advisorItems(state)) counts[it.tab] += 1;
  return counts;
}
