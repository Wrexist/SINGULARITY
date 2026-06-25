import { useEffect, useRef } from "react";

export interface ToastData {
  id: number;
  text: string;
  /** Visual weight: plain unlock vs. a regulatory event. */
  tone?: "neutral" | "bad" | "good";
}

function Toast({ toast, onDone }: { toast: ToastData; onDone: (id: number) => void }) {
  const lasting = toast.tone === "bad" || toast.tone === "good";
  // Keep onDone in a ref so the dismiss timer depends ONLY on the toast id.
  // The game re-renders many times per second; if the timer effect depended on
  // onDone's identity it would be cleared+restarted every render and never fire
  // — which is exactly why toasts were getting stuck on screen forever.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => {
    const t = window.setTimeout(() => onDoneRef.current(toast.id), lasting ? 4200 : 2800);
    return () => window.clearTimeout(t);
  }, [toast.id, lasting]);

  return (
    <div className={`toast toast-${toast.tone ?? "neutral"}`} onClick={() => onDone(toast.id)}>
      {toast.text}
    </div>
  );
}

/** Transient unlock/availability notifications (anticipation + feedback, §7). */
export function ToastStack({ toasts, onDone }: { toasts: ToastData[]; onDone: (id: number) => void }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDone={onDone} />
      ))}
    </div>
  );
}
