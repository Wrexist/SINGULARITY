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
}

/** A single resource readout with a number-pop on increase (micro-feedback, §7). */
function Resource({ label, cssVar, icon, value, rate }: ResourceProps) {
  const prev = useRef<Big>(value);
  const [pop, setPop] = useState<{ id: number; text: string } | null>(null);
  const popId = useRef(0);

  useEffect(() => {
    if (value.gt(prev.current)) {
      const delta = value.sub(prev.current);
      // Only pop on meaningful, discrete jumps (claims/buys), not the tick trickle.
      if (delta.gt(prev.current.mul(0.02)) || prev.current.eq(0)) {
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
    <div className="resource" style={{ ["--c" as string]: `var(${cssVar})` }}>
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
        {rate && <div className="resource-rate">{fmtRate(rate)}</div>}
      </div>
    </div>
  );
}

interface BarProps {
  compute: Big;
  data: Big;
  money: Big;
  computeRate: Big;
  moneyRate: Big;
}

export function ResourceBar({ compute, data, money, computeRate, moneyRate }: BarProps) {
  return (
    <div className="resource-bar">
      <Resource label="Compute" cssVar="--compute" icon={<ComputeIcon />} value={compute} rate={computeRate} />
      <Resource label="Data" cssVar="--data" icon={<DataIcon />} value={data} />
      <Resource
        label="$"
        cssVar="--money"
        icon={<MoneyIcon />}
        value={money}
        rate={moneyRate.gt(0) ? moneyRate : undefined}
      />
    </div>
  );
}
