import { balance } from "../engine/balance/config";
import { staffHireCost, canHireStaff } from "../engine/actions";
import type { GameState, Derived } from "../engine/types";
import { fmtMoney } from "./format";

interface Props {
  game: GameState;
  derived: Derived;
  onHire: (id: string) => void;
}

const LANE_VAR: Record<string, string> = {
  computeMult: "--compute",
  dataMult: "--data",
  moneyMult: "--money",
};
const LANE_LABEL: Record<string, string> = {
  computeMult: "Compute",
  dataMult: "Data/run",
  moneyMult: "Money/run",
};

/**
 * Staff (Phase 2): hire specialists to multiply a lane, at the cost of ongoing
 * payroll. The headline is the live payroll number — the over-hire tension made
 * legible (GAMEPLAN §8). Counts live in the upgrades map (no extra state).
 */
export function StaffPanel({ game, derived, onHire }: Props) {
  return (
    <section className="panel">
      <h2 className="panel-title">Staff &amp; Payroll</h2>
      <p className={`floor-meter${derived.payrollPerSec.gt(0) ? " full" : ""}`}>
        Payroll: <b>{fmtMoney(derived.payrollPerSec)}/s</b>
        {derived.payrollPerSec.gt(0) && <span> — paid continuously from Money.</span>}
      </p>
      <div className="list">
        {balance.staff.roles.map((role) => {
          const owned = game.upgrades[role.id] ?? 0;
          const cost = staffHireCost(role, owned);
          const affordable = canHireStaff(game, role.id);
          const lane = role.effect.lane;
          return (
            <button
              key={role.id}
              className={`card ${affordable ? "affordable" : ""}`}
              disabled={!affordable}
              onClick={() => onHire(role.id)}
            >
              <div className="card-main">
                <span className="card-name">
                  {role.name}
                  {owned > 0 && <span className="card-owned">×{owned}</span>}
                </span>
                <span className="card-desc">{role.desc}</span>
                <span className="card-note" style={{ color: `var(${LANE_VAR[lane]})` }}>
                  +{Math.round(role.effect.perLevel * 100)}% {LANE_LABEL[lane]} · ${role.payroll}/s payroll
                </span>
              </div>
              <div className="card-cost">
                <span style={{ color: "var(--money)" }}>{fmtMoney(cost)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
