import { useEffect, useRef, useState } from "react";
import { Big } from "../engine/math/Big";

const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Eases a displayed Big toward its target so resource counters roll up smoothly
 * (premium "odometer" feel) instead of snapping. Runs a local rAF loop and only
 * re-renders when the *formatted* string changes, so it's cheap. Works at any
 * scale because the easing is done in Big space, not native numbers.
 *
 * Honors prefers-reduced-motion by tracking the target exactly.
 */
export function useEasedBig(target: Big, smoothing = 0.16): Big {
  const targetRef = useRef(target);
  targetRef.current = target;
  const displayRef = useRef(target);
  const [, force] = useState(0);
  const lastStr = useRef(target.format());

  useEffect(() => {
    if (prefersReducedMotion) return;
    let raf = 0;
    const step = () => {
      const t = targetRef.current;
      const d = displayRef.current;
      const diff = t.sub(d);
      // Snap when within a tiny relative epsilon to avoid endless micro-updates.
      const eps = t.abs().mul(0.0005).max(0.5);
      let next: Big;
      if (diff.abs().lte(eps)) {
        next = t;
      } else {
        next = d.add(diff.mul(smoothing));
      }
      displayRef.current = next;
      const s = next.format();
      if (s !== lastStr.current) {
        lastStr.current = s;
        force((n) => n + 1);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [smoothing]);

  return prefersReducedMotion ? target : displayRef.current;
}
