import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Big } from "../engine/math/Big";
import { fmt, fmtRate } from "./format";
import { useEasedBig } from "./useEasedBig";
import { ComputeIcon, DataIcon, MoneyIcon } from "./Icons";

interface ResourceProps {
  label: string;
  cssVar: string;
  icon: ReactNode;
  value: Big;
  rate?: Big | undefined;
  /** Suppress the "+X" jump pop (see the effect below). */
  quiet?: boolean;
  ratePrefix?: string;
}

/** A single resource readout with a number-pop on increase (micro-feedback, §7). */
function Resource({ label, cssVar, icon, value, rate, ratePrefix = "", quiet = false }: ResourceProps) {
  const prev = useRef<Big>(value);
  const [pop, setPop] = useState<{ id: number; text: string } | null>(null);
  const popId = useRef(0);

  useEffect(() => {
    if (value.gt(prev.current)) {
      const delta = value.sub(prev.current);
      // Only pop on meaningful, discrete jumps (claims/buys), not the tick trickle.
      // `quiet` once runs restart themselves: auto-claims land every few seconds,
      // and a "+X" rising over the label that often was constant flicker on the
      // most-watched row. The rate line already says the same thing, calmly.
      if (!quiet && (delta.gt(prev.current.mul(0.02)) || prev.current.eq(0))) {
        popId.current += 1;
        setPop({ id: popId.current, text: `+${fmt(delta)}` });
      }
    }
    prev.current = value;
  }, [value]);

  // Roll the displayed number toward its target for a premium odometer feel;
  // the pop/delta logic above still uses the exact value.
  const display = useEasedBig(value);

  return (
    <div className="resource" style={{ ["--c" as string]: `var(${cssVar})`, ["--ci" as string]: `var(${cssVar}-ink)` }}>
      <div className="resource-icon">{icon}</div>
      <div className="resource-body">
        <div className="resource-label">{label}</div>
        <div className="resource-value">
          {fmt(display)}
          {pop && (
            <span key={pop.id} className="pop" onAnimationEnd={() => setPop(null)}>
              {pop.text}
            </span>
          )}
        </div>
        {/* The rate row is ALWAYS rendered, even when there's no rate to show. Compute
            always has one but Data and Money don't, so a conditional row left the three
            cards' contents sitting at different heights inside equal-height cards — the
            app's most-looked-at row, visibly crooked for the whole early game.
            An empty row reserves the space and keeps the three baselines aligned. */}
        <div className="resource-rate">{rate ? `${ratePrefix}${fmtRate(rate)}` : " "}</div>
      </div>
    </div>
  );
}

interface BarProps {
  compute: Big;
  data: Big;
  money: Big;
  computeRate: Big;
  dataRate: Big;
  moneyRate: Big;
  /** Auto-train is on: payouts are routine, so the jump pops stay quiet. */
  quiet?: boolean;
}

export function ResourceBar({ compute, data, money, computeRate, dataRate, moneyRate, quiet = false }: BarProps) {
  return (
    <div className="resource-bar">
      <Resource label="Compute" cssVar="--compute" icon={<ComputeIcon />} value={compute} rate={computeRate} quiet={quiet} />
      <Resource
        label="Data"
        cssVar="--data"
        icon={<DataIcon />}
        value={data}
        rate={dataRate.gt(0) ? dataRate : undefined}
        quiet={quiet}
      />
      <Resource
        /* "Money", not "$" — the other two micro-labels are words, and a lone glyph in
           the third slot made the trio read as unfinished. The green tint, the icon and
           the "$/s" rate all still mark it as currency. */
        label="Money"
        cssVar="--money"
        icon={<MoneyIcon />}
        value={money}
        rate={moneyRate.gt(0) ? moneyRate : undefined}
        ratePrefix="$"
        quiet={quiet}
      />
    </div>
  );
}
