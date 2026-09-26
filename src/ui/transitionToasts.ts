import type { ToastData } from "./Toast";

/**
 * A transition toast: a keyed fact of the game state and the value that earns
 * its line. Rows can share a key (the two faction directions), and the line
 * fires when the fact CHANGES to `when` after hydration.
 */
export interface TransitionToast {
  key: string;
  fact: string | boolean;
  when: string | boolean;
  text: string;
  tone: ToastData["tone"];
  /** Re-arm each time the fact leaves `when` — for a status that can recur (the
   *  faction tilt, rising heat). Unlock lines leave it unset and fire once. */
  repeat?: boolean;
}

/** Session memory for the transition toasts. */
export interface TransitionMemory {
  /** The last value seen per key. */
  seen: Record<string, string | boolean>;
  /** One-time keys already told (or true at hydration) — never told again. */
  spent: Set<string>;
  /** False until the hydrated save has set the baseline. */
  synced: boolean;
}

export function newTransitionMemory(): TransitionMemory {
  return { seen: {}, spent: new Set(), synced: false };
}

/**
 * Advance the memory to this render's facts and return the rows that fire now.
 * The first call only records the baseline, so a returning save's existing
 * facts never toast on launch.
 *
 * Several unlock facts reset on a Ship (Data and research, upgrades such as
 * auto-train, the rack count behind the Rig Bay), so a row keyed only on the
 * last value used to fire again every generation. A one-time row is spent the
 * first time its fact is true — fired, or already true at hydration — and
 * stays quiet for the rest of the session.
 */
export function stepTransitionToasts(rows: readonly TransitionToast[], mem: TransitionMemory): TransitionToast[] {
  const fire: TransitionToast[] = [];
  // Check ALL rows before updating the seen-map — rows can share a key (the
  // two faction directions), and an interleaved write would mask the second.
  if (mem.synced) {
    for (const t of rows) {
      if (mem.seen[t.key] !== t.fact && t.fact === t.when && (t.repeat || !mem.spent.has(t.key))) fire.push(t);
    }
  }
  for (const t of rows) {
    mem.seen[t.key] = t.fact;
    if (!t.repeat && t.fact === t.when) mem.spent.add(t.key);
  }
  mem.synced = true;
  return fire;
}
