import { useState } from "react";
import { balance } from "../engine/balance/config";
import { canBuyOfficePerk } from "../engine/actions";
import { officeMorale } from "../engine/derive";
import {
  roleDef, traitDef, employeePayroll, canTrain, trainCost, hireCost,
} from "../engine/employees";
import { Big } from "../engine/math/Big";
import type { GameState, Derived, Employee } from "../engine/types";
import type { Candidate } from "../state/store";
import { fmtMoney, m$, fmtDur } from "./format";
import { EmployeeBoard } from "./EmployeeBoard";

interface Props {
  game: GameState;
  derived: Derived;
  candidates: Candidate[] | null;
  onRecruit: () => void;
  onRefresh: () => void;
  onCloseRecruit: () => void;
  onHireCandidate: (index: number) => void;
  onTrain: (id: string) => void;
  onAssign: (id: string, productId: string | null) => void;
  onFire: (id: string) => void;
  onBuyPerk: (id: string) => void;
}

const TRAIT_TONE: Record<string, string> = { good: "var(--money)", bad: "var(--coral)", mixed: "#f97316" };
const hueOf = (name: string) => { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360; return h; };
const initialsOf = (name: string) => name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

function Avatar({ name }: { name: string }) {
  const h = hueOf(name);
  return <span className="emp-avatar" style={{ background: `hsl(${h} 60% 88%)`, color: `hsl(${h} 55% 32%)` }}>{initialsOf(name)}</span>;
}

/** A compact tappable chip (avatar + first name + level + trait dot). */
function Chip({ emp, selected, onTap }: { emp: Employee; selected: boolean; onTap: () => void }) {
  const trait = traitDef(emp.trait);
  return (
    <button className={`emp-chip ${selected ? "sel" : ""}`} onClick={onTap}>
      <span className="emp-chip-av" style={{ background: `hsl(${hueOf(emp.name)} 60% 88%)`, color: `hsl(${hueOf(emp.name)} 55% 32%)` }}>{initialsOf(emp.name)}</span>
      <span className="emp-chip-name">{emp.name.split(" ")[0]}</span>
      <span className="emp-chip-lvl">L{emp.level}</span>
      {emp.training && <span className="emp-chip-train">🎓</span>}
      {trait && <span className="emp-chip-dot" style={{ background: TRAIT_TONE[trait.tone] }} />}
    </button>
  );
}

/** Tap-to-manage bar for a selected person: train / fire / close. */
function ManageBar({ game, emp, onTrain, onFire, onClose }: {
  game: GameState; emp: Employee; onTrain: (id: string) => void; onFire: (id: string) => void; onClose: () => void;
}) {
  const role = roleDef(emp.roleId);
  const trait = traitDef(emp.trait);
  const trainable = canTrain(game, emp.id);
  const maxed = emp.level >= balance.staff.maxLevel;
  return (
    <div className="emp-selbar">
      <Avatar name={emp.name} />
      <div className="emp-selbar-main">
        <div className="emp-name-row"><span className="emp-name">{emp.name}</span><span className="emp-lvl">L{emp.level}</span></div>
        <div className="emp-role">{role?.name}{trait && <span className="emp-trait" style={{ color: TRAIT_TONE[trait.tone] }}> · {trait.name}</span>} · {m$(employeePayroll(emp))}/s</div>
      </div>
      {emp.training ? (
        <span className="emp-selbar-tr">Training ~{fmtDur(emp.training.remainingSec)}</span>
      ) : (
        <button className="btn btn-ghost btn-sm" disabled={!trainable} onClick={() => onTrain(emp.id)}>
          {maxed ? "Maxed" : `Train · ${m$(trainCost(emp))}`}
        </button>
      )}
      <button className="link-btn emp-fire" onClick={() => onFire(emp.id)}>fire</button>
      <button className="link-btn" onClick={onClose} aria-label="Close">✕</button>
    </div>
  );
}

type Tab = "team" | "hire" | "office";
const LAB_CHIP_CAP = 30; // don't render hundreds of chips at once

/**
 * Employees (Phase 3) — your team as individual people, organised into Team / Hire /
 * Office tabs so it stays clean even with a big roster. The lab crew collapses behind
 * a count; product folks live on a drag board; tap anyone to train/fire.
 */
export function EmployeesPanel({ game, derived, candidates, onRecruit, onRefresh, onCloseRecruit, onHireCandidate, onTrain, onAssign, onFire, onBuyPerk }: Props) {
  const [tab, setTab] = useState<Tab>("team");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [labOpen, setLabOpen] = useState(false);
  const team = game.employees;
  const infra = team.filter((e) => roleDef(e.roleId)?.team === "infra");
  const product = team.filter((e) => roleDef(e.roleId)?.team === "product");
  const selected = selectedId ? team.find((e) => e.id === selectedId) ?? null : null;

  const pm = derived.productMods;
  const buffs: string[] = [];
  if (pm.upgradeSpeed > 1) buffs.push(`+${Math.round((pm.upgradeSpeed - 1) * 100)}% research`);
  if (pm.acq > 1) buffs.push(`+${Math.round((pm.acq - 1) * 100)}% acq`);
  if (pm.arpu > 1) buffs.push(`+${Math.round((pm.arpu - 1) * 100)}% ARPU`);
  if (pm.serveCost < 1) buffs.push(`−${Math.round((1 - pm.serveCost) * 100)}% serve`);
  if (pm.churn < 1) buffs.push(`−${Math.round((1 - pm.churn) * 100)}% churn`);
  const labPay = infra.reduce((s, e) => s + employeePayroll(e), 0);

  return (
    <section className="panel">
      <h2 className="panel-title">Employees</h2>
      <p className={`floor-meter${derived.payrollPerSec.gt(0) ? " full" : ""}`}>
        👥 <b>{team.length}</b> · <b>{fmtMoney(derived.payrollPerSec)}/s</b> payroll · 😊 ×{officeMorale(game).toFixed(2)}
      </p>

      <div className="pd-tabs" role="tablist">
        {(["team", "hire", "office"] as Tab[]).map((id) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`pd-tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>
            {id === "team" ? "Team" : id === "hire" ? "Hire" : "Office"}
          </button>
        ))}
      </div>

      {tab === "team" && (
        <div className="pd-pane">
          {team.length === 0 && <p className="market-warn">No employees yet — head to <b>Hire</b> to recruit your first.</p>}
          {buffs.length > 0 && <p className="emp-buffs-line">Bonuses: {buffs.join(" · ")}</p>}
          {selected && <ManageBar game={game} emp={selected} onTrain={onTrain} onFire={(id) => { onFire(id); setSelectedId(null); }} onClose={() => setSelectedId(null)} />}

          {product.length > 0 && (
            <>
              <div className="emp-team-head">🚀 Product team — drag onto a product, or tap to manage</div>
              <EmployeeBoard
                employees={product}
                products={game.products.active.map((p) => ({ id: p.id, name: p.name }))}
                onAssign={onAssign} onSelect={setSelectedId} selectedId={selectedId}
              />
            </>
          )}

          {infra.length > 0 && (
            <div className="emp-labsec">
              <button className="emp-lab-head" onClick={() => setLabOpen((o) => !o)}>
                <span>🏗️ Lab team — works company-wide</span>
                <span className="emp-lab-meta">{infra.length} · {m$(labPay)}/s {labOpen ? "▾" : "▸"}</span>
              </button>
              {labOpen && (
                <div className="emp-zone-chips emp-lab-chips">
                  {infra.slice(0, LAB_CHIP_CAP).map((e) => (
                    <Chip key={e.id} emp={e} selected={selectedId === e.id} onTap={() => setSelectedId(e.id)} />
                  ))}
                  {infra.length > LAB_CHIP_CAP && <span className="emp-zone-empty">+{infra.length - LAB_CHIP_CAP} more</span>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "hire" && (
        <div className="pd-pane">
          {candidates ? (
            <>
              <div className="prod-release-head">
                <span>Pick a candidate</span>
                <span><button className="link-btn" onClick={onRefresh}>↻ refresh</button> · <button className="link-btn" onClick={onCloseRecruit}>close</button></span>
              </div>
              {candidates.map((c, i) => {
                const role = roleDef(c.roleId);
                const trait = traitDef(c.trait);
                const cost = hireCost(c.roleId) * derived.hireDiscount;
                const afford = game.resources.money.gte(cost);
                return (
                  <button key={i} className={`emp-cand ${afford ? "" : "maxed"}`} disabled={!afford} onClick={() => onHireCandidate(i)}>
                    <Avatar name={c.name} />
                    <div className="emp-cand-main">
                      <div className="emp-cand-name">{c.name}</div>
                      <div className="emp-cand-role">{role?.name}{trait && <span style={{ color: TRAIT_TONE[trait.tone] }}> · {trait.name}</span>}</div>
                    </div>
                    <div className="emp-cand-cost"><span>{m$(cost)}</span><span className="emp-cand-sal">{m$(role?.payroll ?? 0)}/s</span></div>
                  </button>
                );
              })}
            </>
          ) : (
            <>
              <p className="pd-pane-tip">Recruit specialists to scale the lab and your products. Each hire costs a one-time signing bonus + ongoing salary.</p>
              <button className="btn btn-primary" onClick={onRecruit}>+ Recruit talent</button>
            </>
          )}
        </div>
      )}

      {tab === "office" && balance.office.enabled && (
        <div className="pd-pane">
          <p className="pd-pane-tip">Perks boost every employee's output (morale) or trim the wage bill. Morale ×{officeMorale(game).toFixed(2)}.</p>
          <div className="list">
            {balance.office.perks.map((perk) => {
              const owned = (game.upgrades[perk.id] ?? 0) > 0;
              const afford = canBuyOfficePerk(game, perk.id);
              const fx = perk.morale > 0 ? `+${Math.round(perk.morale * 100)}% staff effectiveness` : `−${Math.round((1 - perk.payrollMult) * 100)}% payroll`;
              return (
                <button key={perk.id} className={`card ${owned ? "" : afford ? "affordable" : ""}`} disabled={owned || !afford} onClick={() => onBuyPerk(perk.id)}>
                  <div className="card-main">
                    <span className="card-name">{owned ? "✓ " : ""}{perk.name}</span>
                    <span className="card-desc">{perk.desc}</span>
                    <span className="card-note" style={{ color: "var(--money)" }}>{fx}</span>
                  </div>
                  <div className="card-cost"><span style={{ color: "var(--money)" }}>{owned ? "owned" : fmtMoney(Big.of(perk.cost))}</span></div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
