/**
 * Doctrine Consequences (2026-07 depth pass) — the doctrine/alignment fork was the
 * tree's thematic heart but mechanically a flat lane-tilt. This turns your STANCE into
 * exclusive content: commit to Safety (doomer) or Acceleration (accel) and you can claim
 * that side's permanent perks — a build you replay the other way to see the other half of.
 *
 * Deliberately POSITIVE-SUM: both tracks are sidegrades (no punishing regulator minigame —
 * the audit flagged that as off-tone for a "calm, premium" game). Curve-safe TWICE over:
 * (1) perks are claim-gated (a player-only action the deploy-only sim never takes), and
 * (2) claiming requires alignment past the commit threshold, and the sim never fires a
 * faction event so it stays exactly neutral. `doctrines` is empty through the whole tuned
 * run → doctrineMods is identity.
 */

export type DoctrineSide = "doomer" | "accel";
export type DoctrineEffectKind = "computeMult" | "dataMult" | "moneyMult";

export interface DoctrinePerkDef {
  id: string;
  side: DoctrineSide;
  name: string;
  desc: string;
  /** Optional prerequisite perk id (same side). */
  requires?: string;
  effect: { kind: DoctrineEffectKind; value: number };
}

export const doctrine = {
  enabled: true,
  /** Reveals once factions are a live mid-game concern. */
  revealAtShips: 4,
  /** |alignment| must reach this to have "committed" to a side (mirrors factionThreshold). */
  threshold: 0.4,
  perks: [
    // Safety (doomer) track — trust, care, the long view.
    { id: "doc_trust", side: "doomer", name: "Enterprise Trust", desc: "A reputation for safety wins the big contracts. +12% Money, forever.", effect: { kind: "moneyMult", value: 0.12 } },
    { id: "doc_clean", side: "doomer", name: "Clean Operation", desc: "You never cut a corner — and the data quality shows. +12% Data, forever.", effect: { kind: "dataMult", value: 0.12 } },
    { id: "doc_longview", side: "doomer", name: "The Long View", desc: "History will be kind, and so will procurement. +18% Money, forever.", requires: "doc_trust", effect: { kind: "moneyMult", value: 0.18 } },
    // Acceleration (accel) track — scale, speed, the frontier.
    { id: "doc_scale", side: "accel", name: "Scale Is All You Need", desc: "More compute, no apologies. +12% Compute, forever.", effect: { kind: "computeMult", value: 0.12 } },
    { id: "doc_ship", side: "accel", name: "Ship It", desc: "Move fast; the data piles up behind you. +12% Data, forever.", effect: { kind: "dataMult", value: 0.12 } },
    { id: "doc_frontier", side: "accel", name: "Frontier Supremacy", desc: "First or nothing. +18% Compute, forever.", requires: "doc_scale", effect: { kind: "computeMult", value: 0.18 } },
  ] satisfies DoctrinePerkDef[],
};
