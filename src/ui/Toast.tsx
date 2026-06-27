import { useEffect, useRef, useState } from "react";
import { InfoIcon, CheckCircleIcon, AlertTriangleIcon } from "./Icons";

export interface ToastData {
  id: number;
  text: string;
  /** Visual weight: plain unlock vs. a regulatory event. */
  tone?: "neutral" | "bad" | "good";
}

function ToneIcon({ tone }: { tone: ToastData["tone"] }) {
  if (tone === "good") return <CheckCircleIcon size={17} />;
  if (tone === "bad") return <AlertTriangleIcon size={17} />;
  return <InfoIcon size={17} />;
}

const EXIT_MS = 280;

function Toast({ toast, onDone }: { toast: ToastData; onDone: (id: number) => void }) {
  const lasting = toast.tone === "bad" || toast.tone === "good";
  const [exiting, setExiting] = useState(false);
  // Keep onDone in a ref so the dismiss timer depends ONLY on the toast id.
  // The game re-renders many times per second; if the timer effect depended on
  // onDone's identity it would be cleared+restarted every render and never fire
  // — which is exactly why toasts were getting stuck on screen forever.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  // Dismiss in two beats: trigger the exit animation, then remove from the DOM so
  // toasts slide/fade away instead of popping out.
  const dismiss = useRef(() => {});
  dismiss.current = () => {
    setExiting(true);
    window.setTimeout(() => onDoneRef.current(toast.id), EXIT_MS);
  };
  useEffect(() => {
    const t = window.setTimeout(() => dismiss.current(), lasting ? 4200 : 2800);
    return () => window.clearTimeout(t);
  }, [toast.id, lasting]);

  return (
    <div
      className={`toast toast-${toast.tone ?? "neutral"}${exiting ? " exiting" : ""}`}
      onClick={() => dismiss.current()}
    >
      <span className="toast-ic"><ToneIcon tone={toast.tone} /></span>
      <span className="toast-text">{toast.text}</span>
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
