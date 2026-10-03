import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Portal } from "./Portal";
import { useDialog } from "./useDialog";
import { iap, type Plan, type PlanId } from "./iap";
import { useHasPro } from "./pro";
import { haptics } from "./haptics";
import { sound } from "./sound";
import { motionReduced } from "./settings";
import { balance } from "../engine/balance/config";
import { CrownIcon, FastForwardIcon, ClockIcon, RocketIcon, PaletteIcon } from "./Icons";

/** Apple's standard EULA (Terms of Use) and the app's privacy policy. */
export const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
export const PRIVACY_URL = "https://wrexist.github.io/SINGULARITY/privacy/";

const PLAN_NAME: Record<PlanId, string> = { annual: "Yearly", weekly: "Weekly", lifetime: "Lifetime" };

/** The primary button's words for a plan. */
export function ctaLabel(p: Plan | undefined): string {
  if (!p) return "Continue";
  if (p.id === "lifetime") return "Unlock forever";
  if (p.trialDays) return `Start ${p.trialDays}-day free trial`;
  return "Subscribe";
}

/** The exact terms under the button (Apple 3.1.2: length, price, renewal, how to cancel). */
export function termsLine(p: Plan | undefined): string {
  if (!p) return "";
  if (p.id === "lifetime") return `One-time purchase of ${p.priceString}. No subscription.`;
  const unit = p.periodLabel === "year" ? "year" : "week";
  if (p.trialDays) {
    return `${p.trialDays} days free, then ${p.priceString}/${unit}. Auto-renews until cancelled. Cancel anytime in Settings › Apple ID at least 24 hours before the trial ends.`;
  }
  return `${p.priceString}/${unit}, auto-renews until cancelled. Cancel anytime in Settings › Apple ID at least 24 hours before the period ends.`;
}

const PERKS = [
  { icon: <FastForwardIcon size={18} />, title: "Offline earnings ×2", sub: "Time away runs the lab at double speed" },
  { icon: <ClockIcon size={18} />, title: `${balance.offline.premiumMaxHours}-hour offline cap`, sub: `Up from ${balance.offline.maxHours} hours` },
  { icon: <RocketIcon size={18} />, title: "Autopilots one Ship sooner", sub: "Automate the chores a generation early" },
  { icon: <PaletteIcon size={18} />, title: "Pro-only hall themes & rack skins", sub: "New drops regularly" },
];

type Phase = "idle" | "buying" | "restoring" | "done";

interface Props {
  onClose: () => void;
}

/**
 * The Pro paywall: calm, honest, closable at once. Prices come from the store
 * (iap.plans) and the exact renewal terms sit right under the button. Cancelling the
 * App Store sheet is silent; a failure is one calm line. A purchase ends on a quiet
 * check and closes itself.
 */
export function ProPaywall({ onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [selected, setSelected] = useState<PlanId>("annual");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);
  const busy = phase !== "idle";
  // Escape / ✕ are always available — except for the last beat of a finished purchase.
  const close = () => { if (phase !== "buying" && phase !== "restoring") onClose(); };
  useDialog(ref, { onClose: close, labelledBy: "pro-title" });

  useEffect(() => {
    live.current = true;
    void iap.plans().then((p) => {
      if (!live.current) return;
      setPlans(p);
      if (p.length > 0 && !p.some((x) => x.id === "annual")) setSelected(p[0]!.id);
    });
    return () => { live.current = false; };
  }, []);

  const plan = plans?.find((p) => p.id === selected);

  // Pro can arrive by another route than buy()'s own answer: on the direct StoreKit
  // path a purchase that confirms after its short settle wait resolves false (the
  // sheet went back to idle while the player was charged), and the store grants it a
  // moment later. Pro turning on while this is open ends it the same way, once.
  const finished = useRef(false);
  const pro = useHasPro();
  const proAtOpen = useRef(pro);
  useEffect(() => {
    if (pro && !proAtOpen.current) finish();
  }, [pro]);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    setPhase("done");
    setError(null);
    haptics.celebrate();
    sound.success();
    window.setTimeout(() => { if (live.current) onClose(); }, motionReduced() ? 900 : 1300);
  };

  const buy = async () => {
    if (!plan || busy) return;
    setError(null);
    setPhase("buying");
    try {
      const ok = await iap.purchasePlan(plan.id);
      if (!live.current) return;
      if (ok) finish();
      else setPhase("idle"); // a cancelled App Store sheet: silent
    } catch {
      if (!live.current) return;
      setPhase("idle");
      setError("Couldn't reach the App Store. Check your connection and try again.");
    }
  };

  const restore = async () => {
    if (busy) return;
    setError(null);
    setPhase("restoring");
    try {
      const ok = await iap.restore();
      if (!live.current) return;
      if (ok) finish();
      else { setPhase("idle"); setError("No Pro purchase found for this Apple ID."); }
    } catch {
      if (!live.current) return;
      setPhase("idle");
      setError("Couldn't reach the App Store. Check your connection and try again.");
    }
  };

  // Radio group keyboard model: arrows move AND select; only the checked one is a Tab stop.
  const onPlanKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!plans || plans.length === 0) return;
    const i = plans.findIndex((p) => p.id === selected);
    let next = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (i + 1) % plans.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (i - 1 + plans.length) % plans.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = plans.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const id = plans[next]!.id;
    setSelected(id);
    ref.current?.querySelector<HTMLElement>(`[data-plan="${id}"]`)?.focus();
  };

  return (
    <Portal>
      <div className="pro-backdrop" onClick={(e) => { e.stopPropagation(); close(); }}>
        <div
          ref={ref}
          className={`pro-sheet${phase === "done" ? " pro-done" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pro-title"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Outside the scroller, so it never scrolls away. */}
          <button className="pro-close" onClick={close} aria-label="Close" disabled={phase === "buying" || phase === "restoring"}>✕</button>
          <div className="pro-body">
          <div className="pro-hero" aria-hidden="true">
            <span className="pro-hero-glow" />
            <span className="pro-hero-ic"><CrownIcon size={40} /></span>
          </div>
          <div className="pro-kicker">SINGULARITY PRO</div>
          <h2 id="pro-title" className="pro-title" tabIndex={-1}>Run the lab at full power</h2>
          <p className="pro-sub">More done while you're away, less busywork while you're here.</p>

          <ul className="pro-perks">
            {PERKS.map((p) => (
              <li key={p.title} className="pro-perk">
                <span className="pro-perk-ic" aria-hidden="true">{p.icon}</span>
                <span className="pro-perk-text">
                  <b>{p.title}</b>
                  <span>{p.sub}</span>
                </span>
              </li>
            ))}
          </ul>

          {plans === null ? (
            <div className="pro-plans" aria-busy="true" aria-label="Loading plans">
              {[0, 1, 2].map((i) => <div key={i} className="pro-plan pro-plan-skel" />)}
            </div>
          ) : plans.length === 0 ? (
            <p className="pro-error" role="status">Plans are unavailable right now. Try again in a moment.</p>
          ) : (
            <div className="pro-plans" role="radiogroup" aria-label="Choose a plan" onKeyDown={onPlanKey}>
              {plans.map((p) => {
                const on = p.id === selected;
                return (
                  <button
                    key={p.id}
                    data-plan={p.id}
                    className={`pro-plan${on ? " on" : ""}`}
                    role="radio"
                    aria-checked={on}
                    tabIndex={on ? 0 : -1}
                    disabled={busy}
                    onClick={() => { if (!on) { sound.tap(); setSelected(p.id); } }}
                  >
                    <span className={`pro-radio${on ? " on" : ""}`} aria-hidden="true" />
                    <span className="pro-plan-main">
                      <span className="pro-plan-name">
                        {PLAN_NAME[p.id]}
                        {p.id === "annual" && <span className="pro-tag">Best value</span>}
                      </span>
                      <span className="pro-plan-note">
                        {p.id === "lifetime" ? "Pay once" : p.id === "annual" ? "Billed yearly" : p.trialDays ? `${p.trialDays} days free, then weekly` : "Billed weekly"}
                      </span>
                    </span>
                    <span className="pro-plan-price">
                      <span className="pro-plan-amt"><b>{p.priceString}</b>{p.id !== "lifetime" && <span>/{p.periodLabel}</span>}</span>
                      {p.perWeekString && <span className="pro-plan-pm">{p.perWeekString}/wk</span>}
                    </span>
                    {p.id === "annual" && p.trialDays ? <span className="pro-badge">{p.trialDays} days free</span> : null}
                  </button>
                );
              })}
            </div>
          )}

          <button
            className={`btn btn-primary pro-cta${phase === "done" ? " is-done" : ""}`}
            onClick={buy}
            disabled={!plan || busy}
            aria-live="polite"
          >
            {phase === "buying" ? <><span className="pro-spinner" aria-hidden="true" /><span className="sr-only">Purchasing…</span></>
              : phase === "done" ? <span className="pro-check">✓ You're Pro</span>
              : ctaLabel(plan)}
          </button>
          <p className="pro-terms">{termsLine(plan)}</p>
          {error && <p className="pro-error" role="alert">{error}</p>}

          <div className="pro-foot">
            <button className="pro-link" onClick={restore} disabled={busy}>
              {phase === "restoring" ? "Restoring…" : "Restore Purchases"}
            </button>
            <span aria-hidden="true">·</span>
            <a className="pro-link" href={TERMS_URL} target="_blank" rel="noreferrer">Terms of Use</a>
            <span aria-hidden="true">·</span>
            <a className="pro-link" href={PRIVACY_URL} target="_blank" rel="noreferrer">Privacy</a>
          </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
