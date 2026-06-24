import { useState } from "react";
import { useSettings } from "./settings";
import { iap, PREMIUM_PRICE } from "./iap";
import { haptics as hpt } from "./haptics";
import { sound as snd } from "./sound";
import { balance } from "../engine/balance/config";

type ToggleKey = "sound" | "haptics" | "reducedMotion";

interface RowProps {
  label: string;
  hint: string;
  value: boolean;
  onToggle: () => void;
}

function ToggleRow({ label, hint, value, onToggle }: RowProps) {
  return (
    <button className="set-row" onClick={onToggle} role="switch" aria-checked={value}>
      <span className="set-text">
        <span className="set-label">{label}</span>
        <span className="set-hint">{hint}</span>
      </span>
      <span className={`switch ${value ? "on" : ""}`} aria-hidden="true">
        <span className="knob" />
      </span>
    </button>
  );
}

interface Props {
  onClose: () => void;
}

/** iOS-style bottom sheet for feel preferences (clean-to-play, GAMEPLAN §8). */
export function SettingsSheet({ onClose }: Props) {
  const { sound, haptics, reducedMotion, toggle } = useSettings();
  const rows: { key: ToggleKey; label: string; hint: string; value: boolean }[] = [
    { key: "sound", label: "Sound", hint: "Synthesized taps, claims & ship chimes", value: sound },
    { key: "haptics", label: "Haptics", hint: "Vibration feedback on supported devices", value: haptics },
    { key: "reducedMotion", label: "Reduced motion", hint: "Calm the animations", value: reducedMotion },
  ];

  const [premium, setPremiumState] = useState(iap.isPremium());
  const [busy, setBusy] = useState(false);
  const buy = async () => {
    setBusy(true);
    try {
      const ok = await iap.purchasePremium();
      if (ok) { setPremiumState(true); hpt.celebrate(); snd.ship(); }
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    setBusy(true);
    try {
      const ok = await iap.restore();
      setPremiumState(ok);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <h2 className="sheet-title">Settings</h2>

        {/* Premium: one generous, cosmetic/QoL unlock (GDD §9 — never power). */}
        <div className={`premium-card ${premium ? "owned" : ""}`}>
          <div className="premium-head">
            <span className="premium-title">✦ Premium {premium && <span className="premium-badge">Founder</span>}</span>
            {!premium && <span className="premium-price">{PREMIUM_PRICE}</span>}
          </div>
          <ul className="premium-perks">
            <li>{balance.offline.premiumMaxHours}-hour offline cap (up from {balance.offline.maxHours}h)</li>
            <li>“Founder” status &amp; future hall themes</li>
            <li>One-time unlock — no ads, ever, no pay-to-win</li>
          </ul>
          {premium ? (
            <div className="premium-owned-tag">Unlocked — thank you 💚</div>
          ) : (
            <div className="premium-actions">
              <button className="btn btn-primary" disabled={busy} onClick={buy}>
                {busy ? "…" : `Unlock ${PREMIUM_PRICE}`}
              </button>
              <button className="link-btn" disabled={busy} onClick={restore}>
                Restore
              </button>
            </div>
          )}
        </div>

        <div className="set-list">
          {rows.map((r) => (
            <ToggleRow
              key={r.key}
              label={r.label}
              hint={r.hint}
              value={r.value}
              onToggle={() => toggle(r.key)}
            />
          ))}
        </div>
        <button className="btn btn-ghost" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
