import type { OfflineSummary } from "../engine/offline";
import type { Big } from "../engine/math/Big";
import { fmt, fmtPerHour, fmtTime } from "./format";
import { achievementDefs } from "../engine/achievements";
import { LandmarkIcon, TrophyIcon } from "./Icons";

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

  // Phase 3 — meta progress that landed while away (achievements + reputation).
  const unlocked = (summary.achievementsUnlocked ?? [])
    .map((id) => achievementDefs.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => !!d);
  const repEarned = summary.reputationEarned ?? 0;

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
        {(unlocked.length > 0 || repEarned > 0) && (
          <div className="wiwa-meta">
            {repEarned > 0 && (
              <div className="wiwa-meta-row"><LandmarkIcon size={16} /> <b>+{repEarned}</b> Lab Reputation earned</div>
            )}
            {unlocked.length > 0 && (
              <div className="wiwa-meta-row">
                <TrophyIcon size={16} /> <b>{unlocked.length}</b> achievement{unlocked.length === 1 ? "" : "s"} unlocked
                <span className="wiwa-ach-names">
                  {unlocked.slice(0, 3).map((d) => d.label).join(", ")}{unlocked.length > 3 ? `, +${unlocked.length - 3} more` : ""}
                </span>
              </div>
            )}
          </div>
        )}
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
