import { useLayoutEffect, useState } from "react";

/**
 * iPad split: pin the hall column (hall + ticker + training dock) just below the
 * sticky resource bar while the shop column scrolls — but only when the whole column
 * fits between the bar and the bottom nav, so nothing ever sits under either.
 *
 * This used to be a CSS guess: a `min-height: 940px` media gate and a hardcoded
 * 129px offset (8px + ~105px bar + 16px gap). Only 12.9"/13" iPads passed the gate, so
 * an 11" iPad in landscape (1180×820, 1194×834) never pinned. Now the bar and the nav
 * are measured (ResizeObserver) and the fit is computed from real heights. On a shorter
 * screen the split hall gives back some of its extra height (never below the phone
 * hall's 292px) to make the column fit; if it still can't, the column scrolls.
 */

/** The split layout's hall height (styles.css `.app-split .stage-left .hall`). */
export const SPLIT_HALL_H = 372;
/** The smallest hall the pin may shrink it to: the phone hall's own height. */
export const MIN_PIN_HALL_H = 292;
/** Space between the pinned bar and the pinned column (the stage gap). */
export const PIN_GAP = 16;

export interface HallPinMeasure {
  /** Viewport y where the pinned column's top sits (bar's sticky top + bar + gap). */
  pinTop: number;
  /** Viewport y of the bottom nav's top edge. */
  navTop: number;
  /** Current column height, and the hall's current height inside it. */
  columnH: number;
  hallH: number;
}

/** Should the column pin, and at what hall height? Pure, so it is tested unrendered. */
export function hallPinFit(m: HallPinMeasure): { pin: boolean; hallH: number } {
  const off = { pin: false, hallH: SPLIT_HALL_H };
  if (![m.pinTop, m.navTop, m.columnH, m.hallH].every(Number.isFinite)) return off;
  // Everything in the column that is not the hall (ticker, dock, checklist, gaps):
  // independent of the hall height we pick, so the fit cannot oscillate.
  const rest = Math.max(0, m.columnH - m.hallH);
  const room = Math.floor(m.navTop - m.pinTop - rest);
  const hallH = Math.min(SPLIT_HALL_H, room);
  return hallH >= MIN_PIN_HALL_H ? { pin: true, hallH } : off;
}

/**
 * The page's bottom padding while the column is pinned: exactly the strip the bottom
 * nav covers. A sticky column cannot leave the stage, so at the very end of the page
 * the stage's bottom edge is the column's floor. With the phone padding (84px, 22px
 * more than the nav) that floor sat 22px above the nav, and the column hallPinFit
 * fitted down to the nav was shoved 22px up at the end of the scroll: the hall slid
 * under the resource bar and the footer line was drawn over the Training dock.
 * Padding the page by the nav's own height puts the floor at the nav, where the fit
 * assumed it. Junk measures fall back to the stylesheet (null).
 */
export function hallPinBottomPad(viewportH: number, navTop: number): number | null {
  if (!Number.isFinite(viewportH) || !Number.isFinite(navTop)) return null;
  return Math.max(0, Math.round(viewportH - navTop));
}

/**
 * Measure the resource bar, the bottom nav and the hall column, publish
 * `--resbar-h`, `--hall-pin-h` and `--hall-pin-pad` on the root, and say whether the
 * column pins.
 * `active` is the Lab Build pane (the only split layout).
 */
export function useHallPin(active: boolean): boolean {
  const [pin, setPin] = useState(false);
  useLayoutEffect(() => {
    if (!active || typeof ResizeObserver === "undefined") {
      setPin(false);
      return;
    }
    const root = document.documentElement;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const bar = document.querySelector<HTMLElement>(".resource-bar");
      const nav = document.querySelector<HTMLElement>(".botnav");
      const col = document.querySelector<HTMLElement>(".app-split .stage-left");
      const hall = col?.querySelector<HTMLElement>(".hall");
      // Phones: the column is display: contents (no split), so there is nothing to pin.
      if (!bar || !nav || !col || !hall || getComputedStyle(col).display === "contents") {
        setPin(false);
        return;
      }
      const barH = bar.offsetHeight;
      root.style.setProperty("--resbar-h", `${barH}px`);
      const pinTop = (parseFloat(getComputedStyle(bar).top) || 0) + barH + PIN_GAP;
      const navTop = nav.getBoundingClientRect().top;
      const fit = hallPinFit({ pinTop, navTop, columnH: col.offsetHeight, hallH: hall.offsetHeight });
      root.style.setProperty("--hall-pin-h", `${fit.hallH}px`);
      const pad = hallPinBottomPad(window.innerHeight, navTop);
      if (pad === null) root.style.removeProperty("--hall-pin-pad");
      else root.style.setProperty("--hall-pin-pad", `${pad}px`);
      setPin(fit.pin);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(schedule);
    for (const sel of [".resource-bar", ".botnav", ".app-split .stage-left"]) {
      const el = document.querySelector(sel);
      if (el) ro.observe(el);
    }
    window.addEventListener("resize", schedule);
    measure();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [active]);
  return active && pin;
}
