import { useEffect } from "react";

export interface ToastData {
  id: number;
  text: string;
}

function Toast({ toast, onDone }: { toast: ToastData; onDone: (id: number) => void }) {
  useEffect(() => {
    const t = window.setTimeout(() => onDone(toast.id), 2800);
    return () => window.clearTimeout(t);
  }, [toast.id, onDone]);

  return (
    <div className="toast" onClick={() => onDone(toast.id)}>
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
