import { useState, type ReactNode } from "react";
import { ChevronIcon } from "./Icons";

/**
 * A collapsible panel wrapper — a compact header you tap to expand. Reuses the same
 * treatment as the Recent-activity / Stats panels so the deep-endgame meta-panels
 * (Trials, Doctrine, the Institute) fold away by default instead of stacking into an
 * HQ wall. Chevrons are monochrome marks (house rule: no emoji). Collapsed by default;
 * `badge` surfaces an "N to claim / available" nudge so a folded panel can still call
 * for attention ambiently.
 */
export function Collapsible({ title, badge, defaultOpen = false, children }: {
  title: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // `defaultOpen` is the "something in here needs you" signal (a contract due, a
  // perk to claim). It used to count only at mount, so a fold already on screen
  // stayed shut when its need arrived, and the advisor chip pointing at it landed
  // on a closed header. Open it on the arrival; never close it when the need is met
  // (that would snap it shut under the player's thumb), and a player who folds it
  // again keeps it folded until the next need arrives.
  const [needed, setNeeded] = useState(defaultOpen);
  if (defaultOpen !== needed) {
    setNeeded(defaultOpen);
    if (defaultOpen) setOpen(true);
  }
  return (
    <section className={`panel collapsible ${open ? "open" : ""}`}>
      <button className="collapsible-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="panel-title" style={{ margin: 0 }}>{title}</span>
        {badge != null && <span className="collapsible-badge">{badge}</span>}
        <span className="chevron" aria-hidden="true"><ChevronIcon size={13} dir={open ? "up" : "down"} /></span>
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </section>
  );
}
