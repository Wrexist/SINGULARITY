import { useEffect } from "react";

export interface ToastData {
  id: number;
  text: string;
  /** Visual weight: plain unlock vs. a regulatory event. */
  tone?: "neutral" | "bad" | "good";
}

function Toast({ toast, onDone }: { toast: ToastData; onDone: (id: number) => void }) {
  const lasting = toast.tone === "bad" || toast.tone === "good";
  useEffect(() => {
    const t = window.setTimeout(() => onDone(toast.id), lasting ? 4200 : 2800);
    return () => window.clearTimeout(t);
  }, [toast.id, onDone, lasting]);

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
