import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./motion";

/**
 * Native-number sibling of useEasedBig: renders a number that rolls toward its
 * target instead of snapping every 10Hz tick (product MRR/users jittered line by
 * line). A component rather than a hook so it can sit inside list maps. Runs a
 * local rAF loop and re-renders only when the FORMATTED string changes — cheap.
 * Reduced motion tracks the target exactly.
 */
export function EasedNumber({ value, format, smoothing = 0.18 }: { value: number; format: (n: number) => string; smoothing?: number }) {
  const reduced = useReducedMotion();
  const targetRef = useRef(value);
  targetRef.current = value;
  const displayRef = useRef(value);
  const formatRef = useRef(format);
  formatRef.current = format;
  const [, force] = useState(0);
  const lastStr = useRef(format(value));
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    if (reduced) {
      displayRef.current = targetRef.current;
      return;
    }
    let raf = 0;
    const step = () => {
      const t = targetRef.current;
      const d = displayRef.current;
      const diff = t - d;
      // Snap within a small relative epsilon so the loop settles, not micro-hunts.
      const eps = Math.max(Math.abs(t) * 0.0005, 0.5);
      const next = Math.abs(diff) <= eps ? t : d + diff * smoothing;
      displayRef.current = next;
      const s = formatRef.current(next);
      if (s !== lastStr.current) {
        lastStr.current = s;
        force((n) => n + 1);
      }
      // Settled: stop the loop instead of waking every frame (battery). A new
      // value restarts it through `kick` below.
      raf = next === t ? 0 : requestAnimationFrame(step);
    };
    kick.current = () => { if (!raf) raf = requestAnimationFrame(step); };
    kick.current();
    return () => { cancelAnimationFrame(raf); raf = 0; kick.current = () => {}; };
  }, [smoothing, reduced]);
  // Any change of value wakes a settled loop.
  useEffect(() => { kick.current(); }, [value]);

  const shown = reduced ? value : displayRef.current;
  return <>{format(shown)}</>;
}
