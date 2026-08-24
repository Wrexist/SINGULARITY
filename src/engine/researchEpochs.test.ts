import { describe, it, expect } from "vitest";
import { balance } from "./balance/config";
import { researchEpochs } from "./balance/researchEpochs";
import { ALL_RESEARCH, researchTree, unlockedEpochs, epochUnlocked, isEpochNode } from "./researchTree";
import { researchAvailable, canBuyResearch, buyResearch, applyAutoResearch } from "./actions";
import { derive } from "./derive";
import { createInitialState } from "./state";
import { serialize, deserialize } from "./save";
import { preprintsUnlocked } from "./preprints";
import { Big } from "./math/Big";

const rich = () => {
  const s = createInitialState();
  return { ...s, resources: { compute: Big.of(1e12), data: Big.of(1e12), money: Big.of(1e12) } };
};

/**
 * Research Epochs (2026-08 audit, Part 5 §3). Prestige clears research, so every
 * generation replays the identical base tree; an Epoch is a branch that exists only
 * once its Paradigm is owned, so Paradigms become a key rather than a percentage.
 *
 * This is the only feature on that list which touches research at all, and the sim
 * buys research greedily — so the separation below is the whole safety argument.
 */
describe("Research Epochs — curve safety", () => {
  it("keeps epoch nodes OUT of balance.research, where the sim would buy them", () => {
    // The structural lock: the sim iterates balance.research. If an epoch node ever
    // appears there, it is bought greedily and the tuned curve moves.
    const baseIds = new Set(balance.research.map((r) => r.id));
    for (const e of researchEpochs) expect(baseIds.has(e.id)).toBe(false);
  });

  it("is unreachable for a state that owns no paradigm — however rich", () => {
    const s = rich(); // paradigms: [] — exactly the sim's condition, forever
    expect(s.paradigms).toEqual([]);
    for (const e of researchEpochs) {
      expect(epochUnlocked(s, e.id)).toBe(false);
      expect(researchAvailable(s, e.id)).toBe(false);
      expect(canBuyResearch(s, e.id)).toBe(false);
      expect(buyResearch(s, e.id)).toBe(s); // a no-op, not a purchase
    }
    expect(researchTree(s)).toEqual(balance.research);
    expect(unlockedEpochs(s)).toEqual([]);
  });

  it("gates on paradigm OWNERSHIP only — never on ships or era, which the sim reaches", () => {
    const deep = { ...rich(), prestige: { legacyWeights: Big.of(1e6), ships: 500 } };
    for (const e of researchEpochs) expect(researchAvailable(deep, e.id)).toBe(false);
  });

  it("does not let the research auto-buyer reach an epoch without the paradigm", () => {
    // applyAutoResearch is off until a deep perk is owned, but pin it anyway: the
    // greedy buyer must not be a back door around the paradigm gate.
    const s = rich();
    const after = applyAutoResearch(s);
    for (const e of researchEpochs) expect(after.research.includes(e.id)).toBe(false);
  });

  it("leaves derive identical for a state with no paradigms", () => {
    const s = rich();
    const d = derive(s);
    expect(d.computePerSec.toString()).toBe(derive({ ...s }).computePerSec.toString());
    // No epoch id can be in state.research without the gate, so effects are identity.
    expect(researchTree(s).length).toBe(balance.research.length);
  });
});

describe("Research Epochs — behaviour once the paradigm is owned", () => {
  const withParadigm = (id: string) => ({ ...rich(), paradigms: [id] });

  it("grows the tree with exactly that paradigm's branch", () => {
    const s = withParadigm("para_neuromorphic");
    const tree = researchTree(s);
    expect(tree.length).toBeGreaterThan(balance.research.length);
    const added = tree.filter((d) => isEpochNode(d.id));
    expect(added.length).toBeGreaterThan(0);
    for (const d of added) expect(researchEpochs.find((e) => e.id === d.id)!.requiresParadigm).toBe("para_neuromorphic");
    // Another paradigm's branch stays hidden.
    expect(added.some((d) => d.id === "epoch_self_curation")).toBe(false);
  });

  it("makes the branch's ROOT buyable and its children prerequisite-gated", () => {
    const s = withParadigm("para_neuromorphic");
    expect(researchAvailable(s, "epoch_spiking_kernels")).toBe(true);
    expect(researchAvailable(s, "epoch_event_batching")).toBe(false); // needs the root
    const after = buyResearch(s, "epoch_spiking_kernels");
    expect(after.research).toContain("epoch_spiking_kernels");
    expect(researchAvailable(after, "epoch_event_batching")).toBe(true);
  });

  it("applies an owned epoch node's effect in derive", () => {
    const s = withParadigm("para_neuromorphic");
    const before = derive(s).computePerSec;
    const after = derive(buyResearch(s, "epoch_spiking_kernels"));
    expect(after.computePerSec.gt(before)).toBe(true);
  });

  it("honours mutually-exclusive epoch nodes", () => {
    const s = { ...withParadigm("para_recursive"), research: ["epoch_self_rewriting"] };
    expect(researchAvailable(s, "epoch_wide_search")).toBe(true);
    expect(researchAvailable(s, "epoch_deep_search")).toBe(true);
    const picked = buyResearch(s, "epoch_wide_search");
    expect(picked.research).toContain("epoch_wide_search");
    expect(researchAvailable(picked, "epoch_deep_search")).toBe(false); // sibling locked out
  });

  it("groups the unlocked branches for the panel", () => {
    const s = { ...rich(), paradigms: ["para_neuromorphic", "para_synthetic"] };
    const groups = unlockedEpochs(s);
    expect(groups.map((g) => g.epoch)).toEqual(["Neuromorphic", "Synthetic"]);
    for (const g of groups) expect(g.nodes.length).toBeGreaterThan(0);
  });
});

describe("Research Epochs — the base-only scans stay base-only", () => {
  it("never delays the Preprints unlock", () => {
    // Preprints open when the BASE tree is done. Owning a paradigm must not punish
    // the player by adding nodes they must also finish first.
    const s = {
      ...rich(),
      paradigms: ["para_neuromorphic", "para_synthetic", "para_recursive"],
      research: balance.research.map((r) => r.id),
    };
    expect(preprintsUnlocked(s)).toBe(true);
  });

  it("keeps an owned epoch node through a save round-trip", () => {
    const s = { ...rich(), paradigms: ["para_synthetic"], research: ["epoch_self_curation"] };
    const back = deserialize(serialize(s));
    expect(back.research).toContain("epoch_self_curation");
  });

  it("still filters research ids that exist nowhere", () => {
    const s0 = rich();
    const raw = JSON.parse(serialize(s0));
    raw.research = ["epoch_self_curation", "not_a_node"];
    const back = deserialize(JSON.stringify(raw));
    expect(back.research).toEqual(["epoch_self_curation"]);
  });

  it("exposes every node exactly once in ALL_RESEARCH", () => {
    const ids = ALL_RESEARCH.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(balance.research.length + researchEpochs.length);
  });

  it("has coherent epoch data: known paradigms and in-branch prerequisites", () => {
    const paradigmIds = new Set(["para_scaling", "para_neuromorphic", "para_synthetic", "para_quantum", "para_biological", "para_recursive"]);
    const epochIds = new Set(researchEpochs.map((e) => e.id));
    for (const e of researchEpochs) {
      expect(paradigmIds.has(e.requiresParadigm)).toBe(true);
      // A prerequisite must be another node in the SAME branch, or the node could
      // be permanently unreachable for someone who owns only this paradigm.
      for (const req of e.requires) {
        expect(epochIds.has(req)).toBe(true);
        expect(researchEpochs.find((x) => x.id === req)!.requiresParadigm).toBe(e.requiresParadigm);
      }
    }
  });
});
