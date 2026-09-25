import { useEffect, useRef, type RefObject } from "react";

/**
 * Focus management shared by every overlay (sheet, modal, full-screen moment).
 *
 * On mount it remembers what had focus and moves focus INTO the dialog — onto its
 * heading (made programmatically focusable with tabindex=-1, never a Tab stop),
 * or the dialog box itself when it has no heading. A control is never the first
 * target: on iOS a programmatic focus can paint a focus ring, and a heading reads
 * the dialog's name first, which is what VoiceOver users need.
 *
 * While mounted, Tab / Shift+Tab cycle within the dialog, and Escape calls
 * `onClose` when one is given. Leave `onClose` out where the player MUST choose
 * (a world-event decision): Escape then does nothing. Only the TOPMOST open dialog
 * reacts, so a confirm stacked on a sheet traps and escapes on its own.
 *
 * On unmount focus goes back to where it was, if that element is still in the
 * document and focus has not already moved somewhere deliberate.
 */
export interface DialogOptions {
  /** Escape dismisses via this. Omit when a choice is required. */
  onClose?: (() => void) | undefined;
  /** Id of the element naming the dialog; it receives the initial focus. */
  labelledBy?: string | undefined;
}

const TABBABLE = [
  "a[href]", "area[href]", "button", "input:not([type=\"hidden\"])", "select", "textarea",
  "iframe", "summary", "[contenteditable=\"\"]", "[contenteditable=\"true\"]", "[tabindex]",
].join(",");

/** Keyboard-reachable descendants, in document order. */
function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter((el) =>
    el.tabIndex >= 0 &&
    !(el as HTMLButtonElement).disabled &&
    el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility !== "hidden",
  );
}

/** Heading (or the dialog box) that takes focus on open. */
function initialTarget(dialog: HTMLElement, labelledBy: string | undefined): HTMLElement {
  const named = labelledBy ? document.getElementById(labelledBy) : null;
  const heading = named && dialog.contains(named) ? named : dialog.querySelector<HTMLElement>("h1, h2, h3");
  const target = heading ?? dialog;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  return target;
}

// Open dialogs, oldest first. Only the last one handles keys.
const stack: object[] = [];

export function useDialog(ref: RefObject<HTMLElement | null>, { onClose, labelledBy }: DialogOptions = {}): void {
  // Read through refs: App re-renders at 10Hz with fresh callback identities, and
  // the dialog must not re-run its mount effect (and re-steal focus) on each one.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const labelRef = useRef(labelledBy);
  labelRef.current = labelledBy;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const token = {};
    stack.push(token);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const start = initialTarget(dialog, labelRef.current);
    if (!dialog.contains(document.activeElement)) start.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === "Escape" || e.key === "Esc") {
        const close = onCloseRef.current;
        // A handler inside the dialog (an inline rename) already consumed it.
        if (!close || e.defaultPrevented) return;
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      e.preventDefault();
      const items = tabbables(dialog);
      if (items.length === 0) { start.focus({ preventScroll: true }); return; }
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const back = e.shiftKey;
      const at = active ? items.indexOf(active) : -1;
      let next: HTMLElement | undefined;
      if (at >= 0) {
        next = items[(at + (back ? -1 : 1) + items.length) % items.length];
      } else if (active && dialog.contains(active)) {
        // Focus sits on a non-Tab-stop inside (the heading): step to its neighbour.
        next = back
          ? items.filter((el) => el.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING).pop()
          : items.find((el) => active.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
      }
      (next ?? (back ? items[items.length - 1] : items[0]))!.focus();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      const i = stack.indexOf(token);
      if (i >= 0) stack.splice(i, 1);
      const now = document.activeElement;
      const lost = !now || now === document.body || dialog.contains(now);
      if (lost && previous && previous !== document.body && previous.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
    // Mount-only by design: see the refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
