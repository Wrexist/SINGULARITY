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
  /** C3 fusion: `fuseCount` copies of THIS part combine into one of that part.
   *  Ladder-adjacent by cost within the class; earned parts never fuse. */
  fusesInto?: string;
  /** C2 trophy parts: granted (never sold) when a specific milestone completes.
   *  Deterministic and visible in the catalog from the start — a chase, not a
   *  slot pull. One copy per source, auto re-granted (sources persist). */
  earnedBy?: { kind: "contract" | "achievement"; id: string; label: string };
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
  /** C3 fusion: this many copies of a part combine into one of `fusesInto`. */
  fuseCount: 3,
  /** C4 matched rig: a tier whose EVERY slot (2+) is filled with parts of the
   *  SAME grade draws this fraction of its power — "the parts hum in harmony".
   *  Efficiency, deliberately NOT income: a compute-side set bonus compounded
   *  through the economy loop and moved first prestige ~10 minutes (sim). */
  setBonusPowerMult: 0.88,
  catalog: [
    // ---- Accelerators (+% Compute for the slotted tier) ----
    { id: "acc_refurb", name: "Refurb Mining Cards", desc: "Previous owner: a very optimistic man in a garage.", class: "accelerator", grade: "standard", cost: 140, revealAtRacks: 3, value: 1.08, fusesInto: "acc_blower" },
    { id: "acc_blower", name: "OEM Blower Stack", desc: "Sounds like a jet. Priced like a used car.", class: "accelerator", grade: "standard", cost: 1_200, revealAtRacks: 6, value: 1.12, fusesInto: "acc_hopperoo" },
    { id: "acc_hopperoo", name: "H400 'Hopperoo'", desc: "The waiting list had a waiting list.", class: "accelerator", grade: "enterprise", cost: 9_500, revealAtRacks: 10, value: 1.18, fusesInto: "acc_asic" },
    { id: "acc_asic", name: "Liquid-Silicon ASIC", desc: "Does exactly one thing, terrifyingly fast.", class: "accelerator", grade: "enterprise", cost: 70_000, revealAtRacks: 16, value: 1.25, fusesInto: "acc_wafer" },
    { id: "acc_wafer", name: "Wafer-Scale Prototype", desc: "One chip. The whole wafer. Nobody said no.", class: "accelerator", grade: "prototype", cost: 450_000, revealAtRacks: 24, value: 1.35, fusesInto: "acc_dyson" },
    { id: "acc_dyson", name: "Dyson-Adjacent Cluster", desc: "Legally distinct from a megastructure.", class: "accelerator", grade: "prototype", cost: 2_800_000, revealAtRacks: 32, value: 1.45 },
    // ---- Cooling (−% power draw for the slotted tier) ----
    { id: "cool_boxfans", name: "Box Fans on Bricks", desc: "OSHA has questions. The thermals don't.", class: "cooling", grade: "standard", cost: 340, revealAtRacks: 5, value: 0.92, fusesInto: "cool_swamp" },
    { id: "cool_swamp", name: "Swamp Cooler Special", desc: "Humidity is tomorrow's problem.", class: "cooling", grade: "standard", cost: 1_900, revealAtRacks: 8, value: 0.88, fusesInto: "cool_immersion" },
    { id: "cool_immersion", name: "Immersion Tub", desc: "Aquarium-grade. The fish were relocated.", class: "cooling", grade: "enterprise", cost: 7_000, revealAtRacks: 12, value: 0.82, fusesInto: "cool_cryo" },
    { id: "cool_cryo", name: "Cryo Loop Mk II", desc: "Colder than your investors' feet.", class: "cooling", grade: "prototype", cost: 90_000, revealAtRacks: 20, value: 0.7, fusesInto: "cool_zerok" },
    { id: "cool_zerok", name: "Zero-Kelvin-ish Chamber", desc: "The physicists said 'ish' very firmly.", class: "cooling", grade: "prototype", cost: 600_000, revealAtRacks: 28, value: 0.55 },
    // ---- Interconnects (+flat Data/sec per rack of the slotted tier) ----
    { id: "net_cat5", name: "Cat5 and Prayers", desc: "The zip ties are load-bearing.", class: "interconnect", grade: "standard", cost: 1_400, revealAtRacks: 7, value: 0.1, fusesInto: "net_darkfiber" },
    { id: "net_darkfiber", name: "Dark Fiber Lease", desc: "Someone buried this in the 90s. It's yours now.", class: "interconnect", grade: "enterprise", cost: 18_000, revealAtRacks: 14, value: 0.25, fusesInto: "net_quantum" },
    { id: "net_quantum", name: "Quantum-ish Fabric", desc: "The 'ish' is doing heavy lifting. So is the fabric.", class: "interconnect", grade: "prototype", cost: 140_000, revealAtRacks: 22, value: 0.6, fusesInto: "net_orbital" },
    { id: "net_orbital", name: "Orbital Laser Mesh", desc: "Latency measured in guilt.", class: "interconnect", grade: "prototype", cost: 950_000, revealAtRacks: 30, value: 1.1 },

    // ---- Trophy hardware (C2): earned, never sold. Deterministic and visible
    //      from the start — specific named parts from specific milestones. ----
    { id: "trophy_founders", name: "Founders' Edition Card", desc: "Employee #0 of your GPU fleet. Sentimental. Fast.", class: "accelerator", grade: "enterprise", cost: 0, revealAtRacks: 0, value: 1.2, earnedBy: { kind: "contract", id: "ship_it", label: "Ship your first model" } },
    { id: "trophy_benchmark", name: "Binned Golden Sample", desc: "One in a thousand. The bin was deep.", class: "accelerator", grade: "prototype", cost: 0, revealAtRacks: 0, value: 1.3, earnedBy: { kind: "achievement", id: "compute_1m", label: "Reach 1M Compute/sec" } },
    { id: "trophy_lansweeper", name: "Conference Swag Switch", desc: "Free with every keynote badge. Somehow excellent.", class: "interconnect", grade: "enterprise", cost: 0, revealAtRacks: 0, value: 0.35, earnedBy: { kind: "contract", id: "megacluster", label: "Reach 1M Compute/sec (contract)" } },
    { id: "trophy_cryo3", name: "Cryo Loop Mk III", desc: "Runs so cold it voids thermodynamics' warranty.", class: "cooling", grade: "prototype", cost: 0, revealAtRacks: 0, value: 0.5, earnedBy: { kind: "contract", id: "ascended", label: "Ascend in the Post-Singularity era" } },
  ] as ComponentDef[],
};
