import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Portal } from "./Portal";
import { EmptyState } from "./EmptyState";
import { balance } from "../engine/balance/config";
import { canBuyOfficePerk } from "../engine/actions";
import { officeMorale, totalMorale, payrollMultiplier } from "../engine/derive";
import {
  roleDef, traitDef, employeePayroll, canTrain, trainCost, hireCost,
  roleAffinity, roleMatchesSegment, rosterFull,
} from "../engine/employees";
import { typeDef, productMetrics, upgradeProgress, upgradeWallSec, productsUnlocked } from "../engine/products";
import { Big } from "../engine/math/Big";
import type { GameState, Derived, Employee } from "../engine/types";
import type { Candidate } from "../state/store";
import { fmtMoney, m$, fmtDur } from "./format";
import { TeamIcon, BanknoteIcon, SmileIcon, BarsIcon, BuildingIcon, GradCapIcon, AtomIcon, RepeatIcon, BoxIcon, ChevronIcon} from "./Icons";
import { burst } from "./fx";

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

// Pure presentational leaves with primitive props → memoized so a roster of N
// people doesn't reconcile N avatars/star-rows every 10Hz tick when only live
// numbers elsewhere changed (R0.1: cheapen the inherent per-tick re-render).
const Avatar = memo(function Avatar({ name, size = 38 }: { name: string; size?: number }) {
  const h = hueOf(name);
  return (
    <span className="emp-av" style={{ width: size, height: size, fontSize: size * 0.34, background: `hsl(${h} 62% 88%)`, color: `hsl(${h} 55% 32%)` }}>
      {initialsOf(name)}
    </span>
  );
});

/** Level shown as filled pips out of MAX_LEVEL (the mockup's star rating). */
const Stars = memo(function Stars({ level }: { level: number }) {
  return (
    <span className="emp-stars" role="img" aria-label={`Level ${level} of ${MAX_LEVEL}`}>
      {Array.from({ length: MAX_LEVEL }, (_, i) => (
        <span key={i} className={`emp-star ${i < level ? "on" : ""}`}>★</span>
      ))}
    </span>
  );
});

/** Quality tier badge from a product's competitiveness (qf 0..1). */
function tier(qf: number): { label: string; cls: string } {
  if (qf > 0.66) return { label: "High", cls: "high" };
  if (qf > 0.33) return { label: "Mid", cls: "mid" };
  return { label: "Low", cls: "low" };
}

type Seg = "people" | "projects";

/** A full person card (roster + available list). `action` renders the right side. */
function PersonCard({ e, sel, action, onTap }: { e: Employee; sel: boolean; action: ReactNode; onTap?: () => void }) {
  const role = roleDef(e.roleId);
  const trait = traitDef(e.trait);
  const affinity = roleAffinity(e.roleId);
  return (
    <div
      className={`emp-person ${sel ? "sel" : ""}`}
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
          {affinity.length > 0 && (
            <span className="emp-tag synergy" title={`Assign to a ${affinity.join(" or ")} product for a +${Math.round((balance.staff.segmentSynergy - 1) * 100)}% synergy bonus`}>★ {affinity.join(" · ")}</span>
          )}
          {e.training && <span className="emp-tag train"><GradCapIcon size={12} /> training</span>}
        </div>
      </div>
      <div className="emp-person-right">{action}</div>
    </div>
  );
}

// The rows are memoized on the Employee object itself: the engine keeps a person's
// object across ticks unless something about them changes (training, a level, an
// assignment), so at 10Hz a row re-renders only for its own person, its own
// open/selected state, or a pay perk, never because the Money ticked. Every callback
// a row gets is stable (see `stable` in the panel). Re-rendering every row on every
// tick kept a phone's main thread busy once the roster ran to a few hundred.

/** A row on the People pane. `trainable` is only read (and only computed) while open. */
const RosterRow = memo(function RosterRow({ e, open, payMult, trainable, canPlace, onToggle, onTrain, onPlace, onFire }: {
  e: Employee; open: boolean; payMult: number; trainable: boolean; canPlace: boolean;
  onToggle: (id: string) => void; onTrain: (id: string) => void; onPlace: (id: string) => void; onFire: (id: string) => void;
}) {
  const maxed = e.level >= MAX_LEVEL;
  return (
    <div className="emp-person-wrap">
      <PersonCard e={e} sel={open} onTap={() => onToggle(e.id)} action={
        <span className="emp-person-pay">{m$(employeePayroll(e) * payMult)}/s</span>
      } />
      {open && (
        <div className="emp-person-actions">
          {e.training ? (
            <span className="emp-act-train"><GradCapIcon size={13} /> Training · ~{fmtDur(e.training.remainingSec)}</span>
          ) : (
            <button className="emp-act" disabled={!trainable} onClick={() => onTrain(e.id)}>{maxed ? "Max level" : `Train → L${e.level + 1} · ${m$(trainCost(e))}`}</button>
          )}
          {/* Only with a project to place them on: before the first Ship there
              are none (and no Products tab), and Assign… was a dead end. */}
          {roleDef(e.roleId)?.team === "product" && canPlace && (
            <button className="emp-act" onClick={() => onPlace(e.id)}>Assign…</button>
          )}
          <button className="emp-act danger" onClick={() => onFire(e.id)}>Fire</button>
        </div>
      )}
    </div>
  );
});

type DragStart = (ev: { clientX: number; clientY: number; preventDefault: () => void }, id: string) => void;

/** A row in the Projects pane's Available list: pick to place, or drag by the grip. */
const AvailRow = memo(function AvailRow({ e, picking, controls, onPick, onDragStart }: {
  e: Employee; picking: boolean; controls: boolean; onPick: (id: string) => void; onDragStart: DragStart;
}) {
  return (
    <PersonCard e={e} sel={picking} action={controls ? (
      <div className="emp-avail-right">
        <button className="emp-assign-btn" onClick={() => onPick(e.id)}>{picking ? "Picking…" : "Assign"}</button>
        <span className="emp-grip" onPointerDown={(ev) => onDragStart(ev, e.id)} title="Drag onto a project" aria-label="Drag to assign">⠿</span>
      </div>
    ) : null} />
  );
});

/** A project's crew avatars + role chips. Memoized on the crew array, which only
 *  changes with the roster (the project card around it redraws every tick). */
const ProjectCrew = memo(function ProjectCrew({ crew, segment, emptyText, onUnassign }: {
  crew: Employee[]; segment: Parameters<typeof roleMatchesSegment>[1]; emptyText: string; onUnassign: (id: string) => void;
}) {
  // Group crew by role for the "2 Engineers · 1 Growth" chips in the mockup.
  const roleCounts = new Map<string, number>();
  for (const e of crew) roleCounts.set(e.roleId, (roleCounts.get(e.roleId) ?? 0) + 1);
  return (
    <div className="emp-proj-crew">
      {crew.length === 0 && <span className="emp-proj-empty">{emptyText}</span>}
      {crew.map((e) => {
        const syn = roleMatchesSegment(e.roleId, segment);
        return (
          <button key={e.id} className={`emp-crew-av ${syn ? "synergy" : ""}`} title={`${e.name}${syn ? " · ★ segment synergy" : ""} · unassign`} onClick={(ev) => { ev.stopPropagation(); onUnassign(e.id); }}>
            <Avatar name={e.name} size={30} />
            {syn && <span className="emp-crew-star" aria-hidden="true">★</span>}
          </button>
        );
      })}
      {[...roleCounts].map(([rid, n]) => (
        <span className="emp-role-chip" key={rid}>{n} {roleDef(rid)?.name ?? rid}</span>
      ))}
    </div>
  );
});

const NO_CREW: Employee[] = [];

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
  // At the roster cap hiring is refused (the save keeps no more), so the buttons say so.
  const full = rosterFull(game);
  // The morale derive() actually applies = office perks + Mentor traits. Showing only
  // officeMorale hid the Mentor contribution entirely (B2 fix).
  const morale = totalMorale(game);
  const mentorBoost = morale - officeMorale(game); // Mentor-trait share, for the breakdown
  const mentorMaxed = mentorBoost >= balance.staff.maxTeamMorale - 1e-9; // Mentors stop stacking here
  // Office and Reputation payroll perks trim every salary before it is charged, so the
  // pay a card quotes carries them too (the Payroll /s KPI always did).
  const payMult = payrollMultiplier(game);
  const moraleHint = mentorBoost > 0.0001
    ? `Office perks ×${officeMorale(game).toFixed(2)} + mentors +${Math.round(mentorBoost * 100)}%${mentorMaxed ? " (max)" : ""}`
    : "From office perks (hire a Mentor to lift it further)";

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

  // One metrics pass per product; crew grouped by assignment. Mods-aware so the
  // revenue shown next to a project reflects the very crew assigned to it — the
  // whole point of this panel (assigning staff must visibly change the number).
  const frontier = game.products.frontier;
  const modsById = derived.productModsById;
  // The crews only change with the roster; the products (and their metrics) change
  // every tick. Grouped once per roster, so a tick does not re-filter the whole team
  // per product, and each ProjectCrew keeps its array (and skips) across ticks.
  const crewById = useMemo(() => {
    const m = new Map<string, Employee[]>();
    for (const e of team) {
      if (!e.assignedProductId) continue;
      const list = m.get(e.assignedProductId);
      if (list) list.push(e); else m.set(e.assignedProductId, [e]);
    }
    return m;
  }, [team]);
  const projects = useMemo(() => game.products.active.map((p) => ({
    p, me: productMetrics(p, frontier, modsById[p.id]),
    crew: crewById.get(p.id) ?? NO_CREW,
  })), [game.products.active, frontier, crewById, modsById]);
  const totalMrr = projects.reduce((s, x) => s + x.me.mrr, 0);

  const selected = selectedId ? team.find((e) => e.id === selectedId) ?? null : null;

  // Tap-to-assign: when a person is selected in the Projects pane, tapping a
  // project staffs them there; tapping their current chip un-assigns.
  const place = (productId: string | null) => {
    if (!selected) return;
    onAssign(selected.id, productId);
    setSelectedId(null);
  };

  // Stable handlers for the memoized rows. They call through to the latest props and
  // closures, so a row that skipped a render still acts on the current lab.
  const latest = useRef({ onTrain, onAssign, onFire, startDrag });
  latest.current = { onTrain, onAssign, onFire, startDrag };
  const stable = useMemo(() => ({
    toggle: (id: string) => setSelectedId((cur) => (cur === id ? null : id)),
    train: (id: string) => latest.current.onTrain(id),
    placeFromRoster: (id: string) => { setSeg("projects"); setSelectedId(id); },
    fire: (id: string) => { latest.current.onFire(id); setSelectedId(null); },
    unassign: (id: string) => latest.current.onAssign(id, null),
    dragStart: ((ev, id) => latest.current.startDrag(ev, id)) as DragStart,
  }), []);
  // Only the open row shows a Train button, so only it needs canTrain (a roster scan).
  const openTrainable = selectedId !== null && canTrain(game, selectedId);

  // Projects pane: the idle product crew and its role filter, once per roster.
  const avail = useMemo(() => product.filter((e) => !e.assignedProductId), [product]);
  const roleOpts = useMemo(() => [...new Set(avail.map((e) => e.roleId))], [avail]);
  // Fall back to "all" if the selected role no longer exists (e.g. that
  // person got assigned away and the dropdown hid) — never show an empty list.
  const effRoleFilter = roleFilter === "all" || roleOpts.includes(roleFilter) ? roleFilter : "all";
  const shown = useMemo(() => (effRoleFilter === "all" ? avail : avail.filter((e) => e.roleId === effRoleFilter)), [avail, effRoleFilter]);

  const kpis = (
    <div className="emp-kpis">
      <div className="emp-kpi">
        <span className="emp-kpi-ic people"><TeamIcon size={19} /></span>
        <div><div className="emp-kpi-v">{team.length}</div><div className="emp-kpi-l">{idle > 0 ? `${idle} idle` : "Employees"}</div></div>
      </div>
      <div className="emp-kpi">
        <span className="emp-kpi-ic pay"><BanknoteIcon size={19} /></span>
        <div><div className="emp-kpi-v">{fmtMoney(derived.payrollPerSec)}</div><div className="emp-kpi-l">Payroll /s</div></div>
      </div>
      <div className="emp-kpi" title={moraleHint}>
        <span className="emp-kpi-ic mood"><SmileIcon size={19} /></span>
        <div><div className="emp-kpi-v">×{morale.toFixed(2)}</div><div className="emp-kpi-l">Morale</div></div>
      </div>
      <div className="emp-kpi">
        <span className="emp-kpi-ic rev"><BarsIcon size={19} /></span>
        <div><div className="emp-kpi-v">{m$(totalMrr)}</div><div className="emp-kpi-l">Revenue /s</div></div>
      </div>
    </div>
  );

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
                <span><button className="link-btn link-btn-ic" onClick={onRefresh}><RepeatIcon size={12} />refresh</button> · <button className="link-btn" onClick={onCloseRecruit}>close</button></span>
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
                        {/* The salary this person will draw (role × level × trait, after the
                            payroll perks), the same number the roster shows once hired. */}
                        <span className="emp-tag muted">{m$(employeePayroll({ roleId: c.roleId, level: c.level ?? 1, trait: c.trait }) * payMult)}/s</span>
                      </div>
                    </div>
                    <button className="emp-hire-btn" disabled={!afford || full} onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      burst(r.left + r.width / 2, r.top + r.height / 2, { count: c.rare ? 26 : 16, power: c.rare ? 1.4 : 1, colors: c.rare ? ["#ffd60a", "#ff9f0a", "#7c5cff"] : ["#16b364", "#2f7bf6"] });
                      onHireCandidate(i);
                    }}>{m$(cost)}</button>
                  </div>
                );
              })}
            </>
          ) : (
            <>
              <div className="emp-section-head">
                <span>Your team · {team.length}</span>
                <button className="emp-recruit" disabled={full} onClick={onRecruit}>{full ? "Team full" : "+ Recruit"}</button>
              </div>
              {team.length === 0 && <EmptyState icon={<TeamIcon size={20} />} text="The lab floor is quiet — no specialists yet." hint={<>Tap <b>+ Recruit</b> to hire your first specialist.</>} />}
              {team.map((e) => (
                <RosterRow
                  key={e.id} e={e} open={selectedId === e.id} payMult={payMult}
                  trainable={selectedId === e.id && openTrainable} canPlace={projects.length > 0}
                  onToggle={stable.toggle} onTrain={stable.train} onPlace={stable.placeFromRoster} onFire={stable.fire}
                />
              ))}

              {balance.office.enabled && (
                <div className="emp-perks">
                  <button className="emp-section-head emp-perks-head" onClick={() => setPerksOpen((o) => !o)} aria-expanded={perksOpen}>
                    <span className="emp-perks-title"><BuildingIcon size={16} /> Office perks</span>
                    <span className="emp-perks-meta">morale ×{morale.toFixed(2)} <ChevronIcon size={12} dir={perksOpen ? "down" : "right"} /></span>
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
        return (
        <div className="pd-pane">
          {selected && (
            <div className="emp-place-hint">
              Placing <b>{selected.name.split(" ")[0]}</b> — tap a project below, or <button className="link-btn" onClick={() => place(null)}>send to Lab</button> · <button className="link-btn" onClick={() => setSelectedId(null)}>cancel</button>
            </div>
          )}
          {projects.length === 0 && <EmptyState icon={<BoxIcon size={20} />} text="No products in development." hint={productsUnlocked(game)
            ? <>Launch one in the <b>Products</b> tab to staff a team.</>
            : <>Products open with your first Ship. Staff them here then.</>} />}

          {projects.map(({ p, me, crew }) => {
            const t = typeDef(p.type);
            const up = p.upgrade;
            const pct = up ? upgradeProgress(up) * 100 : me.qf * 100;
            const tg = tier(me.qf);
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
                    <span className="emp-proj-sub">{t.name} · {t.segment} · v{p.version}</span>
                  </div>
                  {/* When staffing, a ★ marks projects this specialist synergizes with. */}
                  {selected && roleMatchesSegment(selected.roleId, t.segment)
                    ? <span className="emp-proj-synergy" title={`Synergy: a ${roleDef(selected.roleId)?.name} on a ${t.segment} product earns +${Math.round((balance.staff.segmentSynergy - 1) * 100)}%`}>★ synergy</span>
                    : <span className={`emp-proj-badge ${tg.cls}`}>{tg.label}</span>}
                </div>
                <div className="emp-proj-bar"><div className="emp-proj-fill" style={{ width: `${Math.min(100, pct)}%`, background: up ? "#7c5cff" : "var(--money)" }} /></div>
                <div className="emp-proj-meta">
                  <span>{m$(me.mrr)}/s revenue</span>
                  {up ? <span className="emp-inline-ic"><AtomIcon size={12} /> v{up.targetVersion} · ~{fmtDur(upgradeWallSec(up.remainingSec, modsById[p.id]))}</span> : <span>{Math.round(me.qf * 100)}% competitive</span>}
                </div>
                <ProjectCrew crew={crew} segment={t.segment} emptyText={selected || drag ? "Drop / tap to assign here" : "No crew assigned"} onUnassign={stable.unassign} />
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
          {shown.map((e) => (
            <AvailRow key={e.id} e={e} picking={selectedId === e.id} controls={projects.length > 0} onPick={stable.toggle} onDragStart={stable.dragStart} />
          ))}
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
