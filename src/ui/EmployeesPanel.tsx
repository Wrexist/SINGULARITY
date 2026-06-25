import { balance } from "../engine/balance/config";
import type { StaffRole } from "../engine/balance/config";
import { staffHireCost, canHireStaff } from "../engine/actions";
import type { GameState, Derived } from "../engine/types";
import { fmtMoney } from "./format";

interface Props {
  game: GameState;
  derived: Derived;
  onHire: (id: string) => void;
}

/** One-line, human description of what a hire does (and its lane colour). */
function effectLabel(role: StaffRole): { text: string; color: string } {
  const e = role.effect;
  if (e.kind === "lane") {
    const pct = Math.round(e.perLevel * 100);
    if (e.lane === "computeMult") return { text: `+${pct}% Compute, each`, color: "var(--compute)" };
    if (e.lane === "dataMult") return { text: `+${pct}% Data/run, each`, color: "var(--data)" };
    return { text: `+${pct}% Money/run, each`, color: "var(--money)" };
  }
  const pct = Math.round(e.perLevel * 100);
  switch (e.lane) {
    case "upgradeSpeed": return { text: `+${pct}% research speed, each`, color: "var(--data)" };
    case "serveCost": return { text: `−${pct}% serving cost, each`, color: "var(--compute)" };
    case "churn": return { text: `−${pct}% churn, each`, color: "var(--coral)" };
    case "acquisition": return { text: `+${pct}% acquisition, each`, color: "var(--money)" };
  }
}

function RoleCard({ game, role, onHire }: { game: GameState; role: StaffRole; onHire: (id: string) => void }) {
  const owned = game.upgrades[role.id] ?? 0;
  const cost = staffHireCost(role, owned);
  const affordable = canHireStaff(game, role.id);
  const fx = effectLabel(role);
  return (
    <button className={`card ${affordable ? "affordable" : ""}`} disabled={!affordable} onClick={() => onHire(role.id)}>
      <div className="card-main">
        <span className="card-name">
          {role.name}
          {owned > 0 && <span className="card-owned">×{owned}</span>}
        </span>
        <span className="card-desc">{role.desc}</span>
        <span className="card-note" style={{ color: fx.color }}>
          {fx.text} · ${role.payroll}/s payroll
        </span>
      </div>
      <div className="card-cost">
        <span style={{ color: "var(--money)" }}>{fmtMoney(cost)}</span>
      </div>
    </button>
  );
}

/**
 * Employees (Phase 3) — a dedicated team-building page. The Infrastructure team
 * multiplies lab production; the Product team buffs the live business (research
 * speed, serving cost, churn, acquisition). The headline is headcount + the live
 * payroll drain (the over-hire tension) plus the aggregate buffs you're getting.
 */
export function EmployeesPanel({ game, derived, onHire }: Props) {
  const roles = balance.staff.roles;
  const infra = roles.filter((r) => r.team === "infra");
  const product = roles.filter((r) => r.team === "product");
  const headcount = roles.reduce((n, r) => n + (game.upgrades[r.id] ?? 0), 0);
  const pm = derived.productMods;
  const buffs: string[] = [];
  if (pm.upgradeSpeed > 1) buffs.push(`+${Math.round((pm.upgradeSpeed - 1) * 100)}% research`);
  if (pm.acq > 1) buffs.push(`+${Math.round((pm.acq - 1) * 100)}% acquisition`);
  if (pm.serveCost < 1) buffs.push(`−${Math.round((1 - pm.serveCost) * 100)}% serve cost`);
  if (pm.churn < 1) buffs.push(`−${Math.round((1 - pm.churn) * 100)}% churn`);

  return (
    <section className="panel">
      <h2 className="panel-title">Employees</h2>
      <p className={`floor-meter${derived.payrollPerSec.gt(0) ? " full" : ""}`}>
        <b>{headcount}</b> on payroll · <b>{fmtMoney(derived.payrollPerSec)}/s</b>
        {derived.payrollPerSec.gt(0) && <span> — paid continuously from Money.</span>}
      </p>
      {buffs.length > 0 && (
        <p className="emp-buffs">Active team buffs: {buffs.join(" · ")}</p>
      )}

      <div className="emp-team-head">🏗️ Infrastructure — scales the lab</div>
      <div className="list">
        {infra.map((role) => <RoleCard key={role.id} game={game} role={role} onHire={onHire} />)}
      </div>

      <div className="emp-team-head">🚀 Product — scales the business</div>
      <div className="list">
        {product.map((role) => <RoleCard key={role.id} game={game} role={role} onHire={onHire} />)}
      </div>
    </section>
  );
}
