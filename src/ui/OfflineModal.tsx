import type { OfflineSummary } from "../engine/offline";
import type { Big } from "../engine/math/Big";
import { fmt, fmtPerHour, fmtTime } from "./format";
import { achievementDefs } from "../engine/achievements";
import { productMilestones } from "../engine/balance/products";
import { eraName } from "../engine/eras";
import { LandmarkIcon, TrophyIcon } from "./Icons";

/** The story since last open, as at most `max` human lines (headlines first). */
function storyLines(story: OfflineSummary["story"], max = 4): string[] {
  const lines: string[] = [];
  if (story.eraAfter > story.eraBefore) {
    lines.push(`The lab crossed into the ${eraName(story.eraAfter)} era.`);
  }
  if (story.rankBefore != null && story.rankAfter != null && story.rankAfter !== story.rankBefore) {
    lines.push(
      story.rankAfter < story.rankBefore
        ? `You climbed the AI market: #${story.rankBefore} → #${story.rankAfter}.`
        : `Rivals pushed you down the market: #${story.rankBefore} → #${story.rankAfter}.`,
    );
  }
  for (const m of story.milestones) {
    const def = productMilestones.find((d) => d.id === m);
    if (def) lines.push(`Milestone reached: ${def.label}.`);
  }
  for (const u of story.upgradesFinished) lines.push(`${u.name} shipped v${u.version} — back at the frontier.`);
  for (const e of story.leveledUp) lines.push(`${e.name} finished training — now L${e.level}.`);
  if (lines.length > max) {
    const extra = lines.length - (max - 1);
    return [...lines.slice(0, max - 1), `…and ${extra} more things happened without you.`];
  }
  return lines;
}

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
  // Compute the story lines once per render (length check + list share them).
  const story = summary.story ? storyLines(summary.story) : [];

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
        {/* The story since last open (IMPROVEMENTS #16) — events, not numbers. */}
        {story.length > 0 && (
          <div className="wiwa-story">
            {story.map((line, i) => <p key={i}>{line}</p>)}
          </div>
        )}
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
