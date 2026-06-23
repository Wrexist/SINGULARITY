import type { OfflineSummary } from "../engine/offline";
import { fmt, fmtTime } from "./format";

interface Props {
  summary: OfflineSummary;
  onClose: () => void;
}

/** The "while you were away" screen — a designed reward beat, not a dialog (§7). */
export function OfflineModal({ summary, onClose }: Props) {
  const { gained } = summary;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>While you were away</h2>
        <p className="modal-sub">
          The lab ran for {fmtTime(summary.appliedMs)}
          {summary.capped && " (capped)"}. Here's what stacked up:
        </p>
        <div className="wiwa-grid">
          <div className="wiwa-row" style={{ ["--c" as string]: "var(--compute)" }}>
            <span>Compute</span>
            <b>+{fmt(gained.compute)}</b>
          </div>
          <div className="wiwa-row" style={{ ["--c" as string]: "var(--data)" }}>
            <span>Data</span>
            <b>+{fmt(gained.data)}</b>
          </div>
          <div className="wiwa-row" style={{ ["--c" as string]: "var(--money)" }}>
            <span>$</span>
            <b>+{fmt(gained.money)}</b>
          </div>
        </div>
        <button className="btn btn-primary" onClick={onClose}>
          Collect
        </button>
      </div>
    </div>
  );
}
