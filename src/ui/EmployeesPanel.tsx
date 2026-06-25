import { useState } from "react";
import { balance } from "../engine/balance/config";
import { canBuyOfficePerk } from "../engine/actions";
import { officeMorale } from "../engine/derive";
import {
  roleDef, traitDef, employeePayroll, canTrain, trainCost, trainDurationSec, hireCost,
} from "../engine/employees";
import { Big } from "../engine/math/Big";
import type { GameState, Derived, Employee } from "../engine/types";
import type { Candidate } from "../state/store";
import { fmtMoney } from "./format";
import { m$, fmtDur } from "./format";
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

/** A parametric avatar: initials on a hue derived from the name (no image assets). */
function Avatar({ name }: { name: string }) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className="emp-avatar" style={{ background: `hsl(${h} 60% 88%)`, color: `hsl(${h} 55% 32%)` }}>
      {initials}
    </span>
  );
}

function EmployeeCard({ game, emp, onTrain, onAssign, onFire }: {
  game: GameState; emp: Employee;
  onTrain: (id: string) => void; onAssign: (id: string, p: string | null) => void; onFire: (id: string) => void;
}) {
  const role = roleDef(emp.roleId);
  const trait = traitDef(emp.trait);
  const isProduct = role?.team === "product";
  const trainable = canTrain(game, emp.id);
  const maxed = emp.level >= balance.staff.maxLevel;
  return (
    <div className="emp-card">
      <Avatar name={emp.name} />
      <div className="emp-main">
        <div className="emp-name-row">
          <span className="emp-name">{emp.name}</span>
          <span className="emp-lvl">L{emp.level}</span>
        </div>
        <div className="emp-role">{role?.name ?? emp.roleId}{trait && <span className="emp-trait" style={{ color: TRAIT_TONE[trait.tone] }}> · {trait.name}</span>}</div>
        <div className="emp-pay">{m$(employeePayroll(emp))}/s salary</div>

        {emp.training ? (
          <div className="emp-training">
            <div className="prod-bar"><div className="prod-bar-fill prod-bar-research" style={{ width: `${(1 - emp.training.remainingSec / emp.training.totalSec) * 100}%` }} /></div>
            <span>Training… ~{fmtDur(emp.training.remainingSec)}</span>
          </div>
        ) : (
          <div className="emp-actions">
            {isProduct ? (
              <select className="emp-assign" value={emp.assignedProductId ?? ""} onChange={(e) => onAssign(emp.id, e.target.value || null)}>
                <option value="">Bench (all products)</option>
                {game.products.active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : (
              <span className="emp-lab">🏗️ Lab-wide</span>
            )}
            <button className="link-btn" disabled={!trainable}
              onClick={() => onTrain(emp.id)}
              title={maxed ? "Max level" : `Train to L${emp.level + 1}`}>
              {maxed ? "maxed" : `train · ${m$(trainCost(emp))} · ${fmtDur(trainDurationSec(emp.level))}`}
            </button>
            <button className="link-btn emp-fire" onClick={() => onFire(emp.id)} title="Let go">✕</button>
          </div>
        )}
      </div>
    </div>
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
          {maxed ? "Maxed" : `Train · ${m$(trainCost(emp))} · ${fmtDur(trainDurationSec(emp.level))}`}
        </button>
      )}
      <button className="link-btn emp-fire" onClick={() => onFire(emp.id)}>fire</button>
      <button className="link-btn" onClick={onClose} aria-label="Close">✕</button>
    </div>
  );
}

/**
 * Employees (Phase 3) — your team as individual people. Recruit candidates, assign
 * product-folks to products (or bench them company-wide), train them up over time,
 * and tune the office. Output folds into derive via computeStaffEffects.
 */
export function EmployeesPanel({ game, derived, candidates, onRecruit, onRefresh, onCloseRecruit, onHireCandidate, onTrain, onAssign, onFire, onBuyPerk }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const team = game.employees;
  const pm = derived.productMods;
  const buffs: string[] = [];
  if (pm.upgradeSpeed > 1) buffs.push(`+${Math.round((pm.upgradeSpeed - 1) * 100)}% research`);
  if (pm.acq > 1) buffs.push(`+${Math.round((pm.acq - 1) * 100)}% acquisition`);
  if (pm.arpu > 1) buffs.push(`+${Math.round((pm.arpu - 1) * 100)}% ARPU`);
  if (pm.serveCost < 1) buffs.push(`−${Math.round((1 - pm.serveCost) * 100)}% serve cost`);
  if (pm.churn < 1) buffs.push(`−${Math.round((1 - pm.churn) * 100)}% churn`);

  const infra = team.filter((e) => roleDef(e.roleId)?.team === "infra");
  const product = team.filter((e) => roleDef(e.roleId)?.team === "product");
  const selected = selectedId ? team.find((e) => e.id === selectedId) ?? null : null;

  return (
    <section className="panel">
      <h2 className="panel-title">Employees</h2>
      <p className={`floor-meter${derived.payrollPerSec.gt(0) ? " full" : ""}`}>
        <b>{team.length}</b> on staff · <b>{fmtMoney(derived.payrollPerSec)}/s</b> payroll · morale ×{officeMorale(game).toFixed(2)}
      </p>
      {buffs.length > 0 && <p className="emp-buffs">Active team buffs: {buffs.join(" · ")}</p>}

      {/* Recruiting */}
      {candidates ? (
        <div className="prod-release">
          <div className="prod-release-head">
            <span>Candidates</span>
            <span><button className="link-btn" onClick={onRefresh}>↻ refresh</button> · <button className="link-btn" onClick={onCloseRecruit}>close</button></span>
          </div>
          {candidates.map((c, i) => {
            const role = roleDef(c.roleId);
            const trait = traitDef(c.trait);
            const cost = hireCost(c.roleId) * derived.hireDiscount;
            const afford = game.resources.money.gte(cost);
            return (
              <button key={i} className={`prod-type ${afford ? "" : "maxed"}`} disabled={!afford} onClick={() => onHireCandidate(i)}>
                <span className="prod-type-name"><Avatar name={c.name} /> {c.name}</span>
                <span className="prod-type-blurb">
                  {role?.name}{trait && <span style={{ color: TRAIT_TONE[trait.tone] }}> · {trait.name} ({trait.desc})</span>} — hire {m$(cost)}, {m$(role?.payroll ?? 0)}/s salary
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <button className="btn btn-primary" onClick={onRecruit}>+ Recruit talent</button>
      )}

      {team.length === 0 && !candidates && <p className="market-warn">No employees yet — recruit your first hire.</p>}

      {/* Selected-person manage bar (tap a chip below to open). */}
      {selected && (
        <ManageBar game={game} emp={selected} onTrain={onTrain} onFire={(id) => { onFire(id); setSelectedId(null); }} onClose={() => setSelectedId(null)} />
      )}

      {product.length > 0 && <div className="emp-team-head">🚀 Product team — drag a person onto a product (or Bench)</div>}
      {product.length > 0 && (
        <EmployeeBoard
          employees={product}
          products={game.products.active.map((p) => ({ id: p.id, name: p.name }))}
          onAssign={onAssign}
          onSelect={setSelectedId}
          selectedId={selectedId}
        />
      )}

      {infra.length > 0 && <div className="emp-team-head">🏗️ Infrastructure — works lab-wide</div>}
      <div className="emp-list">
        {infra.map((e) => <EmployeeCard key={e.id} game={game} emp={e} onTrain={onTrain} onAssign={onAssign} onFire={onFire} />)}
      </div>

      {balance.office.enabled && (
        <>
          <div className="emp-team-head">🏢 Office &amp; perks — morale ×{officeMorale(game).toFixed(2)}</div>
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
        </>
      )}
    </section>
  );
}
