/**
 * Rig Bay — rack component catalog (C1). Pure DATA; logic lives in
 * engine/components.ts. Design rules (see RIG_BAY_PLAN.md):
 * - Components apply per rack TIER (loadout templates), never per rack.
 * - Each part has exactly ONE stat (legibility is the feature).
 * - Fixed, fully visible catalog: price + fleet-size gated, never rotated or
 *   randomized. Money only — no new currency.
 * - Rarity ("grade") is magnitude + flair, never function gating.
 */

/** The three slot classes. Each rack tier exposes a subset (see SLOTS_BY_TIER). */
export type SlotClass = "accelerator" | "cooling" | "interconnect";

export type ComponentGrade = "standard" | "enterprise" | "prototype";

export interface ComponentDef {
  id: string;
  name: string;
  desc: string;
  class: SlotClass;
  grade: ComponentGrade;
  /** Money price for one physical copy (one copy fills one slot). */
  cost: number;
  /** Reveal in the catalog once the hall runs this many racks (waves, not dumps). */
  revealAtRacks: number;
  /**
   * The ONE stat, by class:
   * - accelerator: multiplier on Compute from racks of the slotted tier (e.g. 1.15)
   * - cooling: multiplier on that tier's power draw (e.g. 0.85 = −15%)
   * - interconnect: flat Data/sec PER RACK of the slotted tier (e.g. 0.2)
   */
  value: number;
}

/** Slot classes per rack tier (index = tier: 0 basic, 1 server, 2 tpu).
 *  Max 6 loadout decisions across the whole game — thumb-sized on purpose. */
export const SLOTS_BY_TIER: SlotClass[][] = [
  ["accelerator"],
  ["accelerator", "cooling"],
  ["accelerator", "cooling", "interconnect"],
];

export const components = {
  enabled: true,
  /** The Rig Bay reveals once the hall runs this many racks (~2 min in). */
  revealAtRacks: 3,
  catalog: [
    // ---- Accelerators (+% Compute for the slotted tier) ----
    { id: "acc_refurb", name: "Refurb Mining Cards", desc: "Previous owner: a very optimistic man in a garage.", class: "accelerator", grade: "standard", cost: 140, revealAtRacks: 3, value: 1.08 },
    { id: "acc_blower", name: "OEM Blower Stack", desc: "Sounds like a jet. Priced like a used car.", class: "accelerator", grade: "standard", cost: 1_200, revealAtRacks: 6, value: 1.12 },
    { id: "acc_hopperoo", name: "H400 'Hopperoo'", desc: "The waiting list had a waiting list.", class: "accelerator", grade: "enterprise", cost: 9_500, revealAtRacks: 10, value: 1.18 },
    { id: "acc_asic", name: "Liquid-Silicon ASIC", desc: "Does exactly one thing, terrifyingly fast.", class: "accelerator", grade: "enterprise", cost: 70_000, revealAtRacks: 16, value: 1.25 },
    { id: "acc_wafer", name: "Wafer-Scale Prototype", desc: "One chip. The whole wafer. Nobody said no.", class: "accelerator", grade: "prototype", cost: 450_000, revealAtRacks: 24, value: 1.35 },
    // ---- Cooling (−% power draw for the slotted tier) ----
    { id: "cool_boxfans", name: "Box Fans on Bricks", desc: "OSHA has questions. The thermals don't.", class: "cooling", grade: "standard", cost: 340, revealAtRacks: 5, value: 0.92 },
    { id: "cool_immersion", name: "Immersion Tub", desc: "Aquarium-grade. The fish were relocated.", class: "cooling", grade: "enterprise", cost: 7_000, revealAtRacks: 12, value: 0.82 },
    { id: "cool_cryo", name: "Cryo Loop Mk II", desc: "Colder than your investors' feet.", class: "cooling", grade: "prototype", cost: 90_000, revealAtRacks: 20, value: 0.7 },
    // ---- Interconnects (+flat Data/sec per rack of the slotted tier) ----
    { id: "net_cat5", name: "Cat5 and Prayers", desc: "The zip ties are load-bearing.", class: "interconnect", grade: "standard", cost: 1_400, revealAtRacks: 7, value: 0.1 },
    { id: "net_darkfiber", name: "Dark Fiber Lease", desc: "Someone buried this in the 90s. It's yours now.", class: "interconnect", grade: "enterprise", cost: 18_000, revealAtRacks: 14, value: 0.25 },
    { id: "net_quantum", name: "Quantum-ish Fabric", desc: "The 'ish' is doing heavy lifting. So is the fabric.", class: "interconnect", grade: "prototype", cost: 140_000, revealAtRacks: 22, value: 0.6 },
  ] as ComponentDef[],
};
