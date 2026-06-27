import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Portal } from "./Portal";
import { balance } from "../engine/balance/config";
import { canBuyOfficePerk } from "../engine/actions";
import { officeMorale } from "../engine/derive";
import {
  roleDef, traitDef, employeePayroll, canTrain, trainCost, hireCost,
} from "../engine/employees";
import { typeDef, productMetrics, upgradeProgress } from "../engine/products";
import { Big } from "../engine/math/Big";
import type { GameState, Derived, Employee } from "../engine/types";
import type { Candidate } from "../state/store";
import { fmtMoney, m$, fmtDur } from "./format";

interface Props {
  game: GameState;
  derived: Derived;
  candidates: Candidate[] | null;
  onRecruit: () => void;
  onRefresh: () => void;
  onCloseRecruit: () => void;
  onHireCandidate: (index: number) => void;
  onTrain: (id: string) => void;
  onAssign: (id: string, productId: string | null) => void;
  onFire: (id: string) => void;
  onBuyPerk: (id: string) => void;
}

const MAX_LEVEL = balance.staff.maxLevel;
const TRAIT_TONE: Record<string, string> = { good: "var(--money)", bad: "var(--coral)", mixed: "#f97316" };
const hueOf = (name: string) => { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360; return h; };
const initialsOf = (name: string) => name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

function Avatar({ name, size = 38 }: { name: string; size?: number }) {
  const h = hueOf(name);
  return (
    <span className="emp-av" style={{ width: size, height: size, fontSize: size * 0.34, background: `hsl(${h} 62% 88%)`, color: `hsl(${h} 55% 32%)` }}>
      {initialsOf(name)}
    </span>
  );
}

/** Level shown as filled pips out of MAX_LEVEL (the mockup's star rating). */
function Stars({ level }: { level: number }) {
  return (
    <span className="emp-stars" aria-label={`Level ${level} of ${MAX_LEVEL}`}>
      {Array.from({ length: MAX_LEVEL }, (_, i) => (
        <span key={i} className={`emp-star ${i < level ? "on" : ""}`}>★</span>
      ))}
    </span>
  );
}

/** Quality tier badge from a product's competitiveness (qf 0..1). */
function tier(qf: number): { label: string; cls: string } {
  if (qf > 0.66) return { label: "High", cls: "high" };
  if (qf > 0.33) return { label: "Mid", cls: "mid" };
  return { label: "Low", cls: "low" };
}

type Seg = "people" | "projects";

/**
 * Employees (Phase 3, redesigned to the owner's mockup) — a KPI header, a
 * People / Projects toggle, project cards that show their assigned crew, and
 * available-staff cards with level + trait + salary. Assignment is tap-driven
 * (pick a person → tap a project): reliable on mobile, same look as the design.
 */
export function EmployeesPanel({ game, derived, candidates, onRecruit, onRefresh, onCloseRecruit, onHireCandidate, onTrain, onAssign, onFire, onBuyPerk }: Props) {
  const [seg, setSeg] = useState<Seg>("people");
  const [selectedId, setSelectedId] = useState<string | null>(null); // person being managed / placed
  const [perksOpen, setPerksOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const team = game.employees;
  const morale = officeMorale(game);

  // Drag-to-assign (from a grip handle so list scrolling isn't hijacked). Hit-tests
  // pointer position against the project-card rects on drop.
  const projectEls = useRef(new Map<string, HTMLElement>());
  const dragRef = useRef<{ id: string; sx: number; sy: number; active: boolean } | null>(null);
  const cleanupDragRef = useRef<(() => void) | null>(null);
  const [drag, setDrag] = useState<{ id: string; name: string; x: number; y: number; over: string | null } | null>(null);
  const hitTest = (x: number, y: number): string | null => {
    for (const [id, el] of projectEls.current) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
    }
    return null;
  };
  const onDragMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.active && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
    d.active = true;
    const emp = team.find((x) => x.id === d.id);
    setDrag({ id: d.id, name: emp?.name ?? "", x: e.clientX, y: e.clientY, over: hitTest(e.clientX, e.clientY) });
  };
  // Tear down all drag listeners + state. Used on drop, pointercancel, blur, unmount.
  const cleanupDrag = () => {
    cleanupDragRef.current?.();
    cleanupDragRef.current = null;
    dragRef.current = null;
    setDrag(null);
  };
  useEffect(() => cleanupDrag, []); // never leak listeners if we unmount mid-drag
  const onDragUp = (e: PointerEvent) => {
    const d = dragRef.current;
    cleanupDragRef.current?.();
    cleanupDragRef.current = null;
    if (d?.active) { const over = hitTest(e.clientX, e.clientY); if (over) onAssign(d.id, over); }
    dragRef.current = null;
    setDrag(null);
  };
  const startDrag = (e: { clientX: number; clientY: number; preventDefault: () => void }, id: string) => {
    e.preventDefault();
    dragRef.current = { id, sx: e.clientX, sy: e.clientY, active: false };
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragUp);
    window.addEventListener("pointercancel", cleanupDrag);
    window.addEventListener("blur", cleanupDrag);
    cleanupDragRef.current = () => {
      window.removeEventListener("pointermove", onDragMove);
      window.removeEventListener("pointerup", onDragUp);
      window.removeEventListener("pointercancel", cleanupDrag);
      window.removeEventListener("blur", cleanupDrag);
    };
  };

  const { product, idle } = useMemo(() => {
    const prod = team.filter((e) => roleDef(e.roleId)?.team === "product");
    return { product: prod, idle: prod.filter((e) => !e.assignedProductId).length };
  }, [team]);

  // One metrics pass per product; crew grouped by assignment.
  const frontier = game.products.frontier;
  const projects = useMemo(() => game.products.active.map((p) => ({
    p, me: productMetrics(p, frontier),
    crew: team.filter((e) => e.assignedProductId === p.id),
  })), [game.products.active, frontier, team]);
  const totalMrr = projects.reduce((s, x) => s + x.me.mrr, 0);

  const selected = selectedId ? team.find((e) => e.id === selectedId) ?? null : null;

  // Tap-to-assign: when a person is selected in the Projects pane, tapping a
  // project staffs them there; tapping their current chip un-assigns.
  const place = (productId: string | null) => {
    if (!selected) return;
    onAssign(selected.id, productId);
    setSelectedId(null);
  };

  const kpis = (
    <div className="emp-kpis">
      <div className="emp-kpi">
        <span className="emp-kpi-ic people">👥</span>
        <div><div className="emp-kpi-v">{team.length}</div><div className="emp-kpi-l">{idle > 0 ? `${idle} idle` : "Employees"}</div></div>
      </div>
      <div className="emp-kpi">
        <span className="emp-kpi-ic pay">💸</span>
        <div><div className="emp-kpi-v">{fmtMoney(derived.payrollPerSec)}</div><div className="emp-kpi-l">Payroll /s</div></div>
      </div>
      <div className="emp-kpi">
        <span className="emp-kpi-ic mood">😊</span>
        <div><div className="emp-kpi-v">×{morale.toFixed(2)}</div><div className="emp-kpi-l">Morale</div></div>
      </div>
      <div className="emp-kpi">
        <span className="emp-kpi-ic rev">📈</span>
        <div><div className="emp-kpi-v">{m$(totalMrr)}</div><div className="emp-kpi-l">Revenue /s</div></div>
      </div>
    </div>
  );

  /** A full person card (roster + available list). `action` renders the right side. */
  const personCard = (e: Employee, action: ReactNode, onTap?: () => void) => {
    const role = roleDef(e.roleId);
    const trait = traitDef(e.trait);
    return (
      <div
        className={`emp-person ${selectedId === e.id ? "sel" : ""}`}
        key={e.id}
        onClick={onTap}
        role={onTap ? "button" : undefined}
        tabIndex={onTap ? 0 : undefined}
        onKeyDown={onTap ? (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onTap(); } } : undefined}
      >
        <Avatar name={e.name} />
        <div className="emp-person-main">
          <div className="emp-person-top">
            <span className="emp-person-name">{e.name}</span>
            <Stars level={e.level} />
          </div>
          <div className="emp-person-tags">
            <span className="emp-tag role">{role?.name}</span>
            {trait && <span className="emp-tag" style={{ color: TRAIT_TONE[trait.tone], background: `color-mix(in srgb, ${TRAIT_TONE[trait.tone]} 12%, #fff)` }}>{trait.name}</span>}
            {e.training && <span className="emp-tag train">🎓 training</span>}
          </div>
        </div>
        <div className="emp-person-right">{action}</div>
      </div>
    );
  };

  return (
    <section className="panel">
      <h2 className="panel-title">Employees</h2>
      {kpis}

      <div className="emp-seg" role="tablist">
        <button role="tab" aria-selected={seg === "people"} className={`emp-seg-btn ${seg === "people" ? "on" : ""}`} onClick={() => { setSeg("people"); setSelectedId(null); }}>People</button>
        <button role="tab" aria-selected={seg === "projects"} className={`emp-seg-btn ${seg === "projects" ? "on" : ""}`} onClick={() => { setSeg("projects"); setSelectedId(null); }}>
          Projects{projects.length > 0 && <span className="emp-seg-badge">{projects.length}</span>}
        </button>
      </div>

      {/* ---------------- PEOPLE ---------------- */}
      {seg === "people" && (
        <div className="pd-pane">
          {candidates ? (
            <>
              <div className="emp-section-head">
                <span>Pick a candidate</span>
                <span><button className="link-btn" onClick={onRefresh}>↻ refresh</button> · <button className="link-btn" onClick={onCloseRecruit}>close</button></span>
              </div>
              {candidates.map((c, i) => {
                const role = roleDef(c.roleId);
                const trait = traitDef(c.trait);
                const cost = hireCost(c.roleId) * derived.hireDiscount;
                const afford = game.resources.money.gte(cost);
                return (
                  <div className={`emp-person ${c.rare ? "rare" : ""}`} key={i}>
                    <Avatar name={c.name} />
                    <div className="emp-person-main">
                      <div className="emp-person-top">
                        <span className="emp-person-name">{c.name}</span>
                        {c.rare && <span className="emp-rare-badge">✦ Legendary</span>}
                        {c.rare && <Stars level={c.level ?? 1} />}
                      </div>
                      <div className="emp-person-tags">
                        <span className="emp-tag role">{role?.name}</span>
                        {trait && <span className="emp-tag" style={{ color: TRAIT_TONE[trait.tone], background: `color-mix(in srgb, ${TRAIT_TONE[trait.tone]} 12%, #fff)` }}>{trait.name}</span>}
                        <span className="emp-tag muted">{m$(role?.payroll ?? 0)}/s</span>
                      </div>
                    </div>
                    <button className="emp-hire-btn" disabled={!afford} onClick={() => onHireCandidate(i)}>{m$(cost)}</button>
                  </div>
                );
              })}
            </>
          ) : (
            <>
              <div className="emp-section-head">
                <span>Your team · {team.length}</span>
                <button className="emp-recruit" onClick={onRecruit}>+ Recruit</button>
              </div>
              {team.length === 0 && <p className="market-warn">No employees yet — tap <b>Recruit</b> to hire your first specialist.</p>}
              {team.map((e) => {
                const trainable = canTrain(game, e.id);
                const maxed = e.level >= MAX_LEVEL;
                const open = selectedId === e.id;
                return (
                  <div className="emp-person-wrap" key={e.id}>
                    {personCard(e, (
                      <span className="emp-person-pay">{m$(employeePayroll(e))}/s</span>
                    ), () => setSelectedId(open ? null : e.id))}
                    {open && (
                      <div className="emp-person-actions">
                        {e.training ? (
                          <span className="emp-act-train">🎓 Training · ~{fmtDur(e.training.remainingSec)}</span>
                        ) : (
                          <button className="emp-act" disabled={!trainable} onClick={() => onTrain(e.id)}>{maxed ? "Max level" : `Train → L${e.level + 1} · ${m$(trainCost(e))}`}</button>
                        )}
                        {roleDef(e.roleId)?.team === "product" && (
                          <button className="emp-act" onClick={() => { setSeg("projects"); setSelectedId(e.id); }}>Assign…</button>
                        )}
                        <button className="emp-act danger" onClick={() => { onFire(e.id); setSelectedId(null); }}>Fire</button>
                      </div>
                    )}
                  </div>
                );
              })}

              {balance.office.enabled && (
                <div className="emp-perks">
                  <button className="emp-section-head emp-perks-head" onClick={() => setPerksOpen((o) => !o)}>
                    <span>🏢 Office perks</span>
                    <span className="emp-perks-meta">morale ×{morale.toFixed(2)} {perksOpen ? "▾" : "▸"}</span>
                  </button>
                  {perksOpen && balance.office.perks.map((perk) => {
                    const owned = (game.upgrades[perk.id] ?? 0) > 0;
                    const afford = canBuyOfficePerk(game, perk.id);
                    const fx = perk.morale > 0 ? `+${Math.round(perk.morale * 100)}% effectiveness` : `−${Math.round((1 - perk.payrollMult) * 100)}% payroll`;
                    return (
                      <button key={perk.id} className={`emp-perk ${owned ? "owned" : ""}`} disabled={owned || !afford} onClick={() => onBuyPerk(perk.id)}>
                        <div className="emp-perk-main">
                          <span className="emp-perk-name">{owned ? "✓ " : ""}{perk.name}</span>
                          <span className="emp-perk-desc">{perk.desc}</span>
                          <span className="emp-perk-fx">{fx}</span>
                        </div>
                        <span className="emp-perk-cost">{owned ? "owned" : fmtMoney(Big.of(perk.cost))}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ---------------- PROJECTS ---------------- */}
      {seg === "projects" && (() => {
        const avail = product.filter((e) => !e.assignedProductId);
        const roleOpts = [...new Set(avail.map((e) => e.roleId))];
        // Fall back to "all" if the selected role no longer exists (e.g. that
        // person got assigned away and the dropdown hid) — never show an empty list.
        const effRoleFilter = roleFilter === "all" || roleOpts.includes(roleFilter) ? roleFilter : "all";
        const shown = effRoleFilter === "all" ? avail : avail.filter((e) => e.roleId === effRoleFilter);
        return (
        <div className="pd-pane">
          {selected && (
            <div className="emp-place-hint">
              Placing <b>{selected.name.split(" ")[0]}</b> — tap a project below, or <button className="link-btn" onClick={() => place(null)}>send to Lab</button> · <button className="link-btn" onClick={() => setSelectedId(null)}>cancel</button>
            </div>
          )}
          {projects.length === 0 && <p className="market-warn">No products yet — launch one in the <b>Products</b> tab to staff a team.</p>}

          {projects.map(({ p, me, crew }) => {
            const t = typeDef(p.type);
            const up = p.upgrade;
            const pct = up ? upgradeProgress(up) * 100 : me.qf * 100;
            const tg = tier(me.qf);
            // Group crew by role for the "2 Engineers · 1 Growth" chips in the mockup.
            const roleCounts = new Map<string, number>();
            for (const e of crew) roleCounts.set(e.roleId, (roleCounts.get(e.roleId) ?? 0) + 1);
            return (
              <div
                className={`emp-proj ${selected || drag ? "targetable" : ""} ${drag?.over === p.id ? "dragover" : ""}`}
                key={p.id}
                ref={(el) => { if (el) projectEls.current.set(p.id, el); else projectEls.current.delete(p.id); }}
                onClick={() => selected && place(p.id)}
                role={selected ? "button" : undefined}
                tabIndex={selected ? 0 : undefined}
                onKeyDown={selected ? (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); place(p.id); } } : undefined}
              >
                <div className="emp-proj-head">
                  <div className="emp-proj-id">
                    <span className="emp-proj-name">{p.name}</span>
                    <span className="emp-proj-sub">{t.name} · v{p.version}</span>
                  </div>
                  <span className={`emp-proj-badge ${tg.cls}`}>{tg.label}</span>
                </div>
                <div className="emp-proj-bar"><div className="emp-proj-fill" style={{ width: `${Math.min(100, pct)}%`, background: up ? "#7c5cff" : "var(--money)" }} /></div>
                <div className="emp-proj-meta">
                  <span>{m$(me.mrr)}/s revenue</span>
                  {up ? <span>🔬 v{up.targetVersion} · ~{fmtDur(up.remainingSec)}</span> : <span>{Math.round(me.qf * 100)}% competitive</span>}
                </div>
                <div className="emp-proj-crew">
                  {crew.length === 0 && <span className="emp-proj-empty">{selected || drag ? "Drop / tap to assign here" : "No crew assigned"}</span>}
                  {crew.map((e) => (
                    <button key={e.id} className="emp-crew-av" title={`${e.name} · unassign`} onClick={(ev) => { ev.stopPropagation(); onAssign(e.id, null); }}>
                      <Avatar name={e.name} size={30} />
                    </button>
                  ))}
                  {[...roleCounts].map(([rid, n]) => (
                    <span className="emp-role-chip" key={rid}>{n} {roleDef(rid)?.name ?? rid}</span>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="emp-section-head">
            <span>Available {product.length > 0 ? `· ${idle} idle` : ""}</span>
            {roleOpts.length > 1 && (
              <select className="emp-filter" value={effRoleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                <option value="all">All roles</option>
                {roleOpts.map((rid) => <option key={rid} value={rid}>{roleDef(rid)?.name ?? rid}</option>)}
              </select>
            )}
          </div>
          {product.length === 0 && <p className="pd-pane-tip">Hire product-team roles (engineers, growth, sales…) in <b>People</b> to staff your projects.</p>}
          {shown.map((e) =>
            personCard(e, (
              <div className="emp-avail-right">
                <button className="emp-assign-btn" onClick={() => setSelectedId(selectedId === e.id ? null : e.id)}>{selectedId === e.id ? "Picking…" : "Assign"}</button>
                <span className="emp-grip" onPointerDown={(ev) => startDrag(ev, e.id)} title="Drag onto a project" aria-label="Drag to assign">⠿</span>
              </div>
            )),
          )}
          {idle === 0 && product.length > 0 && <p className="pd-pane-tip">Everyone's assigned. Tap a crew avatar on a project to free them up.</p>}
        </div>
        );
      })()}

      {drag && (
        <Portal>
          <div className="emp-drag-ghost" style={{ left: drag.x, top: drag.y }}>
            <Avatar name={drag.name} size={34} />
          </div>
        </Portal>
      )}
    </section>
  );
}
