import type { OfflineSummary } from "../engine/offline";
import type { Big } from "../engine/math/Big";
import { fmt, fmtPerHour, fmtTime } from "./format";

interface Props {
  summary: OfflineSummary;
  onClose: () => void;
}

/** The "while you were away" screen — a designed reward beat, not a dialog (§7). */
export function OfflineModal({ summary, onClose }: Props) {
  const { gained } = summary;
  // Projected hourly rate, so the player can reason about leaving the lab running.
  const hours = summary.appliedMs / 3_600_000;
  const perHour = (v: Big, prefix = "") =>
    hours > 0 ? fmtPerHour(v.div(hours), prefix) : null;

  const rows = [
    { label: "Compute", cssVar: "--compute", value: gained.compute, prefix: "" },
    { label: "Data", cssVar: "--data", value: gained.data, prefix: "" },
    { label: "$", cssVar: "--money", value: gained.money, prefix: "$" },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>While you were away</h2>
        <p className="modal-sub">
          The lab ran for {fmtTime(summary.appliedMs)}
          {summary.capped && " (capped)"}. Here's what stacked up:
        </p>
        <div className="wiwa-grid">
          {rows.map((r) => {
            const rate = perHour(r.value, r.prefix);
            return (
              <div key={r.label} className="wiwa-row" style={{ ["--c" as string]: `var(${r.cssVar})` }}>
                <span>{r.label}</span>
                <div className="wiwa-amount">
                  <b>+{r.prefix}{fmt(r.value)}</b>
                  {rate && <small>{rate}</small>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="wiwa-tip">
          {summary.capped
            ? "Offline earnings are capped — even robots need a weekend."
            : "The lab keeps running while you're gone. No standups required."}
        </p>
        <button className="btn btn-primary" onClick={onClose}>
          Collect
        </button>
      </div>
    </div>
  );
}
