import { useEffect, useMemo, useRef, useState } from "react";
import { traitDef } from "../engine/employees";
import type { Employee } from "../engine/types";

interface Props {
  /** Product-team employees (the draggable ones). */
  employees: Employee[];
  /** Active products → drop zones (plus an implicit Bench). */
  products: { id: string; name: string }[];
  onAssign: (id: string, productId: string | null) => void;
  /** Tap (no drag) selects a person for the manage bar. */
  onSelect: (id: string) => void;
  selectedId: string | null;
}

const TRAIT_TONE: Record<string, string> = { good: "var(--money)", bad: "var(--coral)", mixed: "#f97316" };
const ZONE_CAP = 24; // don't render hundreds of chips in one zone

function initials(name: string) { return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase(); }
function hue(name: string) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360; return h; }

/** A draggable employee assignment board. Pointer-based so it's identical on touch
 *  and mouse: drag a person between the Bench and product zones; a ghost follows the
 *  finger and the hovered zone highlights. A tap (no movement) selects instead. */
export function EmployeeBoard({ employees, products, onAssign, onSelect, selectedId }: Props) {
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; over: string | null } | null>(null);

  // Latest props/handlers, read by the stable pointer handlers (avoids stale closures
  // when the parent re-renders at 10Hz mid-drag).
  const live = useRef({ onAssign, onSelect });
  live.current = { onAssign, onSelect };
  const gesture = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null);

  // Stable handlers (created once); registered on pointerdown, removed by the SAME
  // identity on pointerup or unmount — no leak, no per-render churn.
  const handlers = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null>(null);
  if (!handlers.current) {
    const zoneAt = (x: number, y: number): string | null => {
      const el = document.elementFromPoint(x, y)?.closest("[data-empzone]");
      return el ? el.getAttribute("data-empzone") : null;
    };
    const move = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g) return;
      if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < 6) return; // tap threshold
      g.moved = true;
      e.preventDefault();
      setDrag({ id: g.id, x: e.clientX, y: e.clientY, over: zoneAt(e.clientX, e.clientY) });
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const g = gesture.current;
      gesture.current = null;
      if (g && g.moved) {
        const over = zoneAt(e.clientX, e.clientY);
        if (over) live.current.onAssign(g.id, over === "bench" ? null : over);
      } else if (g) {
        live.current.onSelect(g.id); // it was a tap
      }
      setDrag(null);
    };
    handlers.current = { move, up };
  }

  // Remove any lingering listeners only on unmount.
  useEffect(() => () => {
    if (handlers.current) {
      window.removeEventListener("pointermove", handlers.current.move);
      window.removeEventListener("pointerup", handlers.current.up);
    }
  }, []);

  function onPointerDown(e: React.PointerEvent, id: string) {
    gesture.current = { id, startX: e.clientX, startY: e.clientY, moved: false };
    window.addEventListener("pointermove", handlers.current!.move, { passive: false });
    window.addEventListener("pointerup", handlers.current!.up);
  }

  // Group employees by zone once per roster/product change (not every tick).
  const { zones, byZone } = useMemo(() => {
    const zs = [{ id: "bench", label: "🪑 Bench · helps every product a little" }, ...products.map((p) => ({ id: p.id, label: `🚀 ${p.name} · 2× focus` }))];
    const map: Record<string, Employee[]> = {};
    for (const z of zs) map[z.id] = [];
    for (const e of employees) (map[e.assignedProductId ?? "bench"] ?? map.bench!).push(e);
    return { zones: zs, byZone: map };
  }, [employees, products]);

  const dragName = drag ? employees.find((e) => e.id === drag.id)?.name ?? "" : "";

  return (
    <div className="emp-board">
      {zones.map((z) => {
        const here = byZone[z.id] ?? [];
        return (
          <div key={z.id} data-empzone={z.id} className={`emp-zone ${drag?.over === z.id ? "over" : ""}`}>
            <div className="emp-zone-head">{z.label} <span className="emp-zone-n">{here.length}</span></div>
            <div className="emp-zone-chips">
              {here.length === 0 && <span className="emp-zone-empty">drop here</span>}
              {here.slice(0, ZONE_CAP).map((e) => {
                const trait = traitDef(e.trait);
                return (
                  <button
                    key={e.id}
                    className={`emp-chip ${selectedId === e.id ? "sel" : ""} ${drag?.id === e.id ? "dragging" : ""}`}
                    style={{ touchAction: "none" }}
                    onPointerDown={(ev) => onPointerDown(ev, e.id)}
                  >
                    <span className="emp-chip-av" style={{ background: `hsl(${hue(e.name)} 60% 88%)`, color: `hsl(${hue(e.name)} 55% 32%)` }}>{initials(e.name)}</span>
                    <span className="emp-chip-name">{e.name.split(" ")[0]}</span>
                    <span className="emp-chip-lvl">L{e.level}</span>
                    {e.training && <span className="emp-chip-train" title="In training">🎓</span>}
                    {trait && <span className="emp-chip-dot" style={{ background: TRAIT_TONE[trait.tone] }} title={trait.name} />}
                  </button>
                );
              })}
              {here.length > ZONE_CAP && <span className="emp-zone-empty">+{here.length - ZONE_CAP} more</span>}
            </div>
          </div>
        );
      })}
      {drag && (
        <span className="emp-drag-ghost" style={{ left: drag.x, top: drag.y, background: `hsl(${hue(dragName)} 60% 88%)`, color: `hsl(${hue(dragName)} 55% 32%)` }}>
          {initials(dragName)}
        </span>
      )}
    </div>
  );
}
