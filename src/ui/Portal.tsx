import { type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Renders children into <body>, so a fixed-position overlay always covers the
 *  true viewport — never trapped/clipped by an ancestor that establishes a
 *  containing block (transform, filter, backdrop-filter, contain, will-change).
 *  Use this for every full-screen modal/backdrop. */
export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
