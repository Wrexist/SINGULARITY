import { useState, type CSSProperties } from "react";

/** One confetti piece's flight: sideways drift, start delay, spin, start column. */
export interface ConfettiPiece {
  x: string;
  d: string;
  r: string;
  left: string;
}

/** Roll a burst of `count` pieces. `rand` is injectable for tests. */
export function rollConfetti(count: number, rand: () => number = Math.random): ConfettiPiece[] {
  return Array.from({ length: count }, () => ({
    x: (rand() * 2 - 1).toFixed(2),
    d: `${(rand() * 0.5).toFixed(2)}s`,
    r: `${Math.floor(rand() * 360)}deg`,
    left: `${Math.floor(rand() * 100)}%`,
  }));
}

/**
 * A burst's pieces, rolled ONCE when the moment mounts. App re-renders at ~10Hz
 * and the moment components are not memoized, so rolling in render gave every
 * piece a new column and delay ten times a second: the confetti teleported
 * instead of falling. Each burst is its own mount, so each still looks fresh.
 */
export function useConfetti(count: number): ConfettiPiece[] {
  const [pieces] = useState(() => rollConfetti(count));
  return pieces;
}

/** The inline style that drives one piece's CSS fall animation. */
export function confettiStyle(p: ConfettiPiece, background: string): CSSProperties {
  return {
    ["--x" as string]: p.x,
    ["--d" as string]: p.d,
    ["--r" as string]: p.r,
    left: p.left,
    background,
  };
}
