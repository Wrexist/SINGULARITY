import { useRef, useState } from "react";

/**
 * Tap-to-rename in place. Replaces window.prompt (which is unreliable / ugly on
 * iOS): tapping the name swaps it for a text field that commits on Enter or blur
 * and cancels on Escape. The committed value is trimmed and length-capped.
 */
export function EditableName({ value, onCommit, className, max = 32 }: {
  value: string;
  onCommit: (next: string) => void;
  className?: string;
  max?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  // Guard so the edit resolves exactly once: Escape (cancel) must not be undone by
  // a blur committing the stale draft, and Enter+blur can't double-commit.
  const done = useRef(false);

  if (editing) {
    const commit = () => { if (done.current) return; done.current = true; const v = draft.trim(); if (v) onCommit(v); setEditing(false); };
    const cancel = () => { done.current = true; setDraft(value); setEditing(false); };
    return (
      <input
        className={`inline-edit ${className ?? ""}`}
        value={draft}
        autoFocus
        maxLength={max}
        aria-label="Rename"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") cancel();
        }}
      />
    );
  }
  return (
    <button className={className} title="Rename" onClick={() => { done.current = false; setDraft(value); setEditing(true); }}>
      {value} <span className="prod-rename">✎</span>
    </button>
  );
}
