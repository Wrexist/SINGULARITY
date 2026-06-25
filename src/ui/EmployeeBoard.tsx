import { useEffect, useRef, useState } from "react";
import { traitDef } from "../engine/employees";
import type { Employee } from "../engine/types";

interface Zone { id: string; label: string }
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

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}
function hue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

/** A draggable employee assignment board. Pointer-based so it's identical on touch
 *  and mouse: drag a person between the Bench and product zones; a ghost follows the
 *  finger and the hovered zone highlights. A tap (no movement) selects instead. */
export function EmployeeBoard({ employees, products, onAssign, onSelect, selectedId }: Props) {
  const zones: Zone[] = [{ id: "bench", label: "🪑 Bench · buffs all products" }, ...products.map((p) => ({ id: p.id, label: `🚀 ${p.name}` }))];
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; over: string | null } | null>(null);
  const gesture = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null);

  // Clean up any window listeners if we unmount mid-drag.
  useEffect(() => () => {
    window.removeEventListener("pointermove", onMove as never);
    window.removeEventListener("pointerup", onUp as never);
  });

  function zoneAt(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y)?.closest("[data-empzone]");
    return el ? el.getAttribute("data-empzone") : null;
  }
  function onMove(e: PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.startX, dy = e.clientY - g.startY;
    if (!g.moved && Math.hypot(dx, dy) < 6) return; // tap threshold
    g.moved = true;
    e.preventDefault();
    setDrag({ id: g.id, x: e.clientX, y: e.clientY, over: zoneAt(e.clientX, e.clientY) });
  }
  function onUp(e: PointerEvent) {
    window.removeEventListener("pointermove", onMove as never);
    window.removeEventListener("pointerup", onUp as never);
    const g = gesture.current;
    gesture.current = null;
    if (g && g.moved) {
      const over = zoneAt(e.clientX, e.clientY);
      if (over) onAssign(g.id, over === "bench" ? null : over);
    } else if (g) {
      onSelect(g.id); // it was a tap
    }
    setDrag(null);
  }
  function onPointerDown(e: React.PointerEvent, id: string) {
    gesture.current = { id, startX: e.clientX, startY: e.clientY, moved: false };
    window.addEventListener("pointermove", onMove as never, { passive: false });
    window.addEventListener("pointerup", onUp as never);
  }

  const dragName = drag ? employees.find((e) => e.id === drag.id)?.name ?? "" : "";

  return (
    <div className="emp-board">
      {zones.map((z) => {
        const here = employees.filter((e) => (e.assignedProductId ?? "bench") === z.id);
        return (
          <div key={z.id} data-empzone={z.id} className={`emp-zone ${drag?.over === z.id ? "over" : ""}`}>
            <div className="emp-zone-head">{z.label} <span className="emp-zone-n">{here.length}</span></div>
            <div className="emp-zone-chips">
              {here.length === 0 && <span className="emp-zone-empty">drop here</span>}
              {here.map((e) => {
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
