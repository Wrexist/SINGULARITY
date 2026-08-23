import type { ReactNode } from "react";

/**
 * Intentional empty state — a calm composition (dashed frame, muted line icon,
 * one line of copy, optional hint) replacing the bare "No X" strings that read
 * as dead UI. Purely presentational; every screen decides its own icon + copy.
 */
export function EmptyState({ icon, text, hint }: { icon: ReactNode; text: ReactNode; hint?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-ic" aria-hidden="true">{icon}</span>
      <div className="empty-copy">
        <div className="empty-text">{text}</div>
        {hint && <div className="empty-hint">{hint}</div>}
      </div>
    </div>
  );
}
