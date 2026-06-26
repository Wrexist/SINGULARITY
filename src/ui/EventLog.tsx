import { useState } from "react";
import type { ToastData } from "./Toast";

/** Collapsible "Recent activity" — a session log of everything that toasted
 *  (events, unlocks, milestones, achievements, ops). Toasts fade fast; this lets a
 *  player scroll back and read what happened. Session-only (resets on reload). */
export function EventLog({ log }: { log: ToastData[] }) {
  const [open, setOpen] = useState(false);
  if (log.length === 0) return null;

  return (
    <section className={`panel stats ${open ? "open" : ""}`}>
      <button className="stats-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="panel-title" style={{ margin: 0 }}>Recent activity</span>
        <span className="log-count">{log.length}</span>
        <span className="chevron">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="log-list">
          {log.map((e) => (
            <div key={e.id} className={`log-row log-${e.tone}`}>
              <span className="log-dot" aria-hidden="true" />
              <span className="log-text">{e.text}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
