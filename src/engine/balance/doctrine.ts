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

/** "schism" is the third track — see the Schisms note below. It is a side you cannot
 *  commit to; you qualify for it by having committed to both of the others. */
export type DoctrineSide = "doomer" | "accel" | "schism";
export type DoctrineEffectKind = "computeMult" | "dataMult" | "moneyMult" | "allMult";

export interface DoctrinePerkDef {
  id: string;
  side: DoctrineSide;
  name: string;
  desc: string;
  /** Optional prerequisite perk id (same side). */
  requires?: string;
  /** Schism perks only: how many perks must be held on EACH of the two committed
   *  sides before this one opens. Undefined on a side perk. */
  minPerSide?: number;
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

    /**
     * Schisms (2026-08 depth pass). The two tracks were terminal: claim your side's
     * three perks and the doctrine system is finished forever, with the other half
     * visible-but-locked as a permanent reproach. Replaying the other way was framed
     * as the reward, but nothing ever ACKNOWLEDGED that you had — the second track
     * just filled in silently beside the first.
     *
     * The Schism track is that acknowledgement, and it is the only content in the game
     * you cannot reach by committing harder. Every rung requires perks held on BOTH
     * sides, so it can only be assembled across generations (alignment resets to
     * neutral on every ship), and it is claimable ONLY while uncommitted — you claim
     * the synthesis from the center, having earned the right to stand there.
     *
     * Curve-safe THREE times over, one more than the side tracks: claiming is a
     * player-only action the deploy-only sim never takes; the sim never fires a faction
     * event so it can never hold a side perk; and a Schism perk additionally requires
     * perks on both sides, which is unreachable without the first two. Note the neutral
     * gate is the one gate the sim WOULD pass — it sits at alignment 0 forever — which
     * is exactly why the both-sides prerequisite carries the real weight here.
     */
    { id: "doc_both_hands", side: "schism", name: "Both Hands", desc: "You have argued both cases in earnest. +8% to Compute, Data and Money, forever.", minPerSide: 1, effect: { kind: "allMult", value: 0.08 } },
    { id: "doc_dialectic", side: "schism", name: "The Dialectic", desc: "Neither camp trusts you; both cite you. +12% to Compute, Data and Money, forever.", requires: "doc_both_hands", minPerSide: 2, effect: { kind: "allMult", value: 0.12 } },
    { id: "doc_third_way", side: "schism", name: "The Third Way", desc: "The whole of both doctrines, held at once. +18% to Compute, Data and Money, forever.", requires: "doc_dialectic", minPerSide: 3, effect: { kind: "allMult", value: 0.18 } },
  ] satisfies DoctrinePerkDef[],
};

/** The two sides a player can actually COMMIT to. "schism" is qualified for, not
 *  chosen — single-sourced so the engine gate and the panel can't drift. */
export const COMMITTABLE_SIDES = ["doomer", "accel"] as const;
