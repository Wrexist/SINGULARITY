import { useState } from "react";
import { ToneIcon, type ToastData } from "./Toast";

/** "14:32"-style clock stamp for a log entry (locale-aware, no seconds). */
function stamp(at?: number): string | null {
  if (!at) return null;
  try {
    return new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return null;
  }
}

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
              <span className="log-ic" aria-hidden="true"><ToneIcon tone={e.tone} /></span>
              <span className="log-text">{e.text}</span>
              {stamp(e.at) && <span className="log-time">{stamp(e.at)}</span>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
