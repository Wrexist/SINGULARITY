import { useState } from "react";
import { Portal } from "./Portal";
import { Big } from "../engine/math/Big";
import {
  SLOTS_BY_TIER, componentDef, visibleCatalog, canBuyComponent, equippedCount,
} from "../engine/components";
import type { SlotClass, ComponentDef, ComponentGrade } from "../engine/balance/components";
import { RACK_IDS } from "../engine/hall";
import { balance } from "../engine/balance/config";
import { fmtMoney } from "./format";
import { ChipIcon, SnowIcon, LinkIcon } from "./Icons";
import type { GameState } from "../engine/types";
import type { ReactNode } from "react";

interface Props {
  game: GameState;
  /** Buy one copy (store action; no-op when unaffordable). */
  onBuy: (id: string) => void;
  /** Equip an owned copy into a tier slot (null clears). */
  onEquip: (tier: number, slot: SlotClass, id: string | null) => void;
}

const SLOT_META: Record<SlotClass, { label: string; icon: ReactNode }> = {
  accelerator: { label: "Accelerator", icon: <ChipIcon size={14} /> },
  cooling: { label: "Cooling", icon: <SnowIcon size={14} /> },
  interconnect: { label: "Interconnect", icon: <LinkIcon size={14} /> },
};

const GRADE_LABEL: Record<ComponentGrade, string> = {
  standard: "STD", enterprise: "ENT", prototype: "PROTO",
};

/** The part's ONE stat, human-readable. */
function fmtEffect(def: ComponentDef): string {
  if (def.class === "accelerator") return `+${Math.round((def.value - 1) * 100)}% Compute`;
  if (def.class === "cooling") return `−${Math.round((1 - def.value) * 100)}% power draw`;
  return `+${def.value}/s Data per rack`;
}

/** Rack-tier display name from the upgrade def (single source of truth). */
function tierName(tier: number): string {
  return balance.upgrades.find((u) => u.id === RACK_IDS[tier])?.name ?? RACK_IDS[tier]!;
}

/**
 * Rig Bay (C1) — per-rack-TIER component loadouts with a slot-first store:
 * tap a slot, pick a part; owned parts equip instantly, unowned buy-and-equip
 * in one tap. Fixed catalog, one stat per part (see RIG_BAY_PLAN.md).
 */
export function RigBayPanel({ game, onBuy, onEquip }: Props) {
  // Which slot's chooser is open, if any.
  const [picking, setPicking] = useState<{ tier: number; slot: SlotClass } | null>(null);

  const tiersWithRacks = SLOTS_BY_TIER.map((_, t) => t).filter((t) => (game.upgrades[RACK_IDS[t]!] ?? 0) > 0);
  const catalog = visibleCatalog(game);

  const chooser = picking && (() => {
    const { tier, slot } = picking;
    const current = game.components.loadout[tier]?.[slot] ?? null;
    const options = catalog.filter((d) => d.class === slot);
    return (
      <Portal>
        <div className="modal-backdrop" onClick={() => setPicking(null)}>
          <div className="modal rig-chooser" role="dialog" aria-modal="true" aria-label={`${SLOT_META[slot].label} for ${tierName(tier)}`} onClick={(e) => e.stopPropagation()}>
            <div className="rig-chooser-head">
              <span className="rig-chooser-title">{SLOT_META[slot].icon} {SLOT_META[slot].label} — {tierName(tier)}s</span>
              <button className="link-btn" onClick={() => setPicking(null)}>close</button>
            </div>
            {current && (
              <button className="rig-option rig-clear" onClick={() => { onEquip(tier, slot, null); setPicking(null); }}>
                Remove {componentDef(current)?.name ?? "part"} — run this tier stock
              </button>
            )}
            {options.map((def) => {
              const owned = game.components.owned[def.id] ?? 0;
              const inUse = equippedCount(game, def.id);
              const isCurrent = current === def.id;
              const hasFree = owned - inUse + (isCurrent ? 1 : 0) > 0;
              const affordable = canBuyComponent(game, def.id);
              const action = isCurrent ? "equipped" : hasFree ? "equip" : affordable ? "buy" : "poor";
              return (
                <button
                  key={def.id}
                  className={`rig-option grade-${def.grade} ${isCurrent ? "current" : ""}`}
                  disabled={action === "equipped" || action === "poor"}
                  onClick={() => {
                    if (action === "buy") onBuy(def.id);
                    onEquip(tier, slot, def.id);
                    setPicking(null);
                  }}
                >
                  <div className="rig-option-main">
                    <span className="rig-option-name">
                      {def.name} <em className={`rig-grade grade-${def.grade}`}>{GRADE_LABEL[def.grade]}</em>
                    </span>
                    <span className="rig-option-stat">{fmtEffect(def)}</span>
                    <span className="rig-option-desc">{def.desc}</span>
                    {owned > 0 && <span className="rig-option-owned">{owned} owned · {inUse} slotted</span>}
                  </div>
                  <span className="rig-option-go">
                    {action === "equipped" ? "✓ fitted" : action === "equip" ? "Fit it" : fmtMoney(Big.of(def.cost))}
                  </span>
                </button>
              );
            })}
            <p className="rig-chooser-tip">Parts are yours forever — swap freely. One copy fits one tier.</p>
          </div>
        </div>
      </Portal>
    );
  })();

  return (
    <section className="panel rigbay">
      <h2 className="panel-title">Rig Bay</h2>
      <p className="rig-blurb">Fit components per rack tier — one part upgrades every rack of that tier.</p>
      {tiersWithRacks.map((tier) => (
        <div className="rig-tier" key={tier}>
          <div className="rig-tier-head">
            <span className="rig-tier-name">{tierName(tier)}s</span>
            <span className="rig-tier-count">×{game.upgrades[RACK_IDS[tier]!] ?? 0}</span>
          </div>
          <div className="rig-slots">
            {SLOTS_BY_TIER[tier]!.map((slot) => {
              const id = game.components.loadout[tier]?.[slot];
              const def = id ? componentDef(id) : undefined;
              return (
                <button key={slot} className={`rig-slot ${def ? `filled grade-${def.grade}` : ""}`} onClick={() => setPicking({ tier, slot })}>
                  <span className="rig-slot-ic">{SLOT_META[slot].icon}</span>
                  <span className="rig-slot-text">
                    <span className="rig-slot-label">{def ? def.name : SLOT_META[slot].label}</span>
                    <span className="rig-slot-sub">{def ? fmtEffect(def) : "empty — tap to fit"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {chooser}
    </section>
  );
}
