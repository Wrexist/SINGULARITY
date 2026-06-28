/**
 * Contracts (Phase 4) — a rotating board of accept-and-fulfill objectives that
 * give the player directed goals and pace, rewarding the meta-currency
 * (Reputation) rather than in-run cash so the tuned economy curve is untouched.
 *
 * The board is DERIVED, not stored: it's always the first `slots` pool entries
 * the player hasn't completed yet, in order — a guided ladder. Only the
 * `completed` ids are persisted (like achievements), so the save surface is one
 * array and there's nothing to desync.
 *
 * Metrics are all read straight from state/stats (no `derive` needed), and the
 * monotonic peak-* stats are used where possible so a completed-looking goal
 * can't un-complete after a dip or a prestige reset.
 */

export type ContractMetric =
  | "peakComputePerSec"
  | "totalMoney"
  | "totalRacks"
  | "productsActive"
  | "employees"
  | "ships"
  | "research"
  | "peakMrr"
  | "peakMau"
  | "ascensions";

export interface ContractDef {
  id: string;
  title: string;
  desc: string;
  metric: ContractMetric;
  target: number;
  /** Reputation points granted on claim. */
  rep: number;
}

export const contracts = {
  enabled: true,
  /** How many contracts are on the board at once. */
  slots: 3,
  /** The ordered ladder. The board shows the first `slots` not-yet-completed. */
  pool: [
    { id: "boot", title: "Boot Sequence", desc: "Reach 50 Compute/sec.", metric: "peakComputePerSec", target: 50, rep: 1 },
    { id: "seed_round", title: "Seed Round", desc: "Earn $1,000 in total.", metric: "totalMoney", target: 1_000, rep: 1 },
    { id: "hello_science", title: "Hello, Science", desc: "Unlock your first research node.", metric: "research", target: 1, rep: 1 },
    { id: "headcount", title: "Headcount", desc: "Hire your first specialist.", metric: "employees", target: 1, rep: 2 },
    { id: "rack_em_up", title: "Rack 'em Up", desc: "Run 10 GPU racks.", metric: "totalRacks", target: 10, rep: 2 },
    { id: "ship_it", title: "Ship It", desc: "Ship your first model.", metric: "ships", target: 1, rep: 2 },
    { id: "going_commercial", title: "Going Commercial", desc: "Have a live product.", metric: "productsActive", target: 1, rep: 2 },
    { id: "rnd_dept", title: "R&D Department", desc: "Own 5 research nodes.", metric: "research", target: 5, rep: 3 },
    { id: "kilocluster", title: "Kilocluster", desc: "Reach 1,000 Compute/sec.", metric: "peakComputePerSec", target: 1_000, rep: 3 },
    { id: "seven_figures", title: "Seven Figures", desc: "Earn $1,000,000 in total.", metric: "totalMoney", target: 1_000_000, rep: 3 },
    { id: "densely_packed", title: "Densely Packed", desc: "Run 25 GPU racks.", metric: "totalRacks", target: 25, rep: 3 },
    { id: "recurring_revenue", title: "Recurring Revenue", desc: "Reach $500/sec product revenue.", metric: "peakMrr", target: 500, rep: 4 },
    { id: "serial_shipper", title: "Serial Shipper", desc: "Ship 5 models.", metric: "ships", target: 5, rep: 4 },
    { id: "org_chart", title: "Org Chart", desc: "Employ 10 specialists.", metric: "employees", target: 10, rep: 4 },
    { id: "megacluster", title: "Megacluster", desc: "Reach 1,000,000 Compute/sec.", metric: "peakComputePerSec", target: 1_000_000, rep: 5 },

    // ---- Endgame ladder: the board no longer runs dry mid-game ----
    { id: "household_name", title: "Household Name", desc: "Reach 10,000,000 total users.", metric: "peakMau", target: 10_000_000, rep: 5 },
    { id: "warehouse", title: "Warehouse Scale", desc: "Run 50 GPU racks.", metric: "totalRacks", target: 50, rep: 5 },
    { id: "cash_machine", title: "Cash Machine", desc: "Reach $10,000/sec product revenue.", metric: "peakMrr", target: 10_000, rep: 6 },
    { id: "five_nines", title: "Nine Figures", desc: "Earn $100,000,000 in total.", metric: "totalMoney", target: 100_000_000, rep: 6 },
    { id: "research_lab", title: "Frontier Lab", desc: "Own 10 research nodes.", metric: "research", target: 10, rep: 6 },
    { id: "veteran_shipper", title: "Veteran Shipper", desc: "Ship 15 models.", metric: "ships", target: 15, rep: 7 },
    { id: "gigacluster", title: "Gigacluster", desc: "Reach 1,000,000,000 Compute/sec.", metric: "peakComputePerSec", target: 1_000_000_000, rep: 7 },
    { id: "big_org", title: "Real Company Now", desc: "Employ 25 specialists.", metric: "employees", target: 25, rep: 7 },
    { id: "ten_figures", title: "Ten Figures", desc: "Earn $1,000,000,000 in total.", metric: "totalMoney", target: 1_000_000_000, rep: 8 },
    { id: "ascended", title: "Beyond Human", desc: "Ascend in the Post-Singularity era.", metric: "ascensions", target: 1, rep: 10 },
  ] as ContractDef[],
};
