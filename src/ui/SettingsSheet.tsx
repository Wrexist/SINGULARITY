import { useState } from "react";
import { useSettings } from "./settings";
import { iap, PREMIUM_PRICE } from "./iap";
import { haptics as hpt } from "./haptics";
import { sound as snd } from "./sound";
import { balance } from "../engine/balance/config";
import { useGame } from "../state/store";
import { HALL_THEMES } from "./hallThemes";
import { PaletteIcon, DownloadIcon, LockIcon, CheckIcon } from "./Icons";
import { telemetryEnabled, setTelemetryEnabled, getTelemetryEvents, clearTelemetry } from "../state/telemetry";
import { summarize } from "../engine/telemetry";
import { eraName } from "../engine/eras";

/** mm:ss for a duration in seconds (telemetry display). */
function fmtDur(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}m${String(s % 60).padStart(2, "0")}s`;
}

type ToggleKey = "sound" | "music" | "haptics" | "reducedMotion";

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
  const { sound, music, haptics, reducedMotion, hallTheme, toggle, setHallTheme } = useSettings();
  const rows: { key: ToggleKey; label: string; hint: string; value: boolean }[] = [
    { key: "sound", label: "Sound effects", hint: "Synthesized taps, claims & ship chimes", value: sound },
    { key: "music", label: "Music", hint: "Ambient bed + era & ship swells", value: music },
    { key: "haptics", label: "Haptics", hint: "Vibration feedback on supported devices", value: haptics },
    { key: "reducedMotion", label: "Reduced motion", hint: "Calm the animations", value: reducedMotion },
  ];

  const [premium, setPremiumState] = useState(iap.isPremium());
  const [busy, setBusy] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [exportText, setExportText] = useState("");
  const [importText, setImportText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const [telemOn, setTelemOn] = useState(() => telemetryEnabled());
  // Recompute the on-device summary whenever the panel opens / the toggle flips / data is cleared.
  const [diagTick, setDiagTick] = useState(0);
  const diag = summarize(getTelemetryEvents());
  void diagTick; // diag is recomputed each render; diagTick just forces it after a mutation

  const doExport = async () => {
    const blob = useGame.getState().exportSave();
    setExportText(blob);
    try { await navigator.clipboard.writeText(blob); setStatus("Backup copied to clipboard — paste it somewhere safe."); }
    catch { setStatus("Select the text below and copy it."); }
  };
  const doImport = () => {
    if (!importText.trim()) return;
    if (!confirm("Replace your current progress with this backup? This can't be undone.")) return;
    if (useGame.getState().importSave(importText)) { location.reload(); }
    else { setStatus("That backup didn't look valid — check you copied all of it."); }
  };
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
            <div className="premium-owned-tag">Unlocked — thank you</div>
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
        {/* Hall theme — cosmetic only (never affects gameplay). */}
        <div className="set-theme">
          <div className="set-theme-head"><PaletteIcon size={16} /> Hall theme</div>
          <div className="set-theme-row">
            {HALL_THEMES.map((t) => {
              const locked = t.premium && !premium;
              const active = hallTheme === t.id;
              return (
                <button
                  key={t.id}
                  className={`set-theme-chip ${active ? "on" : ""} ${locked ? "locked" : ""}`}
                  onClick={() => { if (locked) return; snd.tap(); setHallTheme(t.id); }}
                  aria-pressed={active}
                  title={locked ? `${t.name} — unlock with Premium` : t.name}
                >
                  <span className="set-theme-swatch" style={{ background: t.swatch }}>{locked ? <LockIcon size={16} /> : active ? <CheckIcon size={16} /> : ""}</span>
                  <span className="set-theme-name">{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Save backup — local-only; protects a long run from a cleared cache. */}
        <div className="set-backup">
          <button className="set-backup-head" onClick={() => setBackupOpen((o) => !o)} aria-expanded={backupOpen}>
            <span className="set-backup-title"><DownloadIcon size={16} /> Back up &amp; restore save</span>
            <span className="set-backup-chev">{backupOpen ? "▾" : "▸"}</span>
          </button>
          {backupOpen && (
            <div className="set-backup-body">
              <p className="set-backup-tip">Your progress lives only on this device. Export a backup string and keep it safe; paste it back to restore (or move to a new device).</p>
              <div className="set-backup-actions">
                <button className="btn btn-ghost btn-sm" onClick={doExport}>Export backup</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setImportText(""); setStatus(null); setExportText(""); }}>Clear</button>
              </div>
              {exportText && <textarea className="set-backup-text" readOnly rows={3} value={exportText} onFocus={(e) => e.currentTarget.select()} />}
              <label className="set-backup-label">Restore from a backup</label>
              <textarea className="set-backup-text" rows={3} placeholder="Paste a backup string here…" value={importText} onChange={(e) => setImportText(e.target.value)} />
              <button className="btn btn-primary btn-sm" disabled={!importText.trim()} onClick={doImport}>Restore this backup</button>
              {status && <p className="set-backup-status">{status}</p>}
            </div>
          )}
        </div>

        {/* Diagnostics — on-device only (R8.1). Never leaves this device; shown to you. */}
        <div className="set-backup">
          <button className="set-backup-head" onClick={() => setDiagOpen((o) => !o)} aria-expanded={diagOpen}>
            <span className="set-backup-title">📊 Diagnostics (on-device)</span>
            <span className="set-backup-chev">{diagOpen ? "▾" : "▸"}</span>
          </button>
          {diagOpen && (
            <div className="set-backup-body">
              <ToggleRow
                label="Record play diagnostics"
                hint="Stays on this device — never sent anywhere. Helps tune balance."
                value={telemOn}
                onToggle={() => { const next = !telemOn; setTelemetryEnabled(next); setTelemOn(next); setDiagTick((t) => t + 1); }}
              />
              {telemOn ? (
                <div className="set-diag-grid">
                  <div className="set-diag-row"><span>Sessions played</span><span>{diag.sessions}</span></div>
                  <div className="set-diag-row"><span>Time to first ship</span><span>{diag.firstPrestigeSec != null ? fmtDur(diag.firstPrestigeSec) : "—"}</span></div>
                  <div className="set-diag-row"><span>Generations shipped</span><span>{diag.genTimes.length}</span></div>
                  {diag.genTimes.length > 0 && (
                    <div className="set-diag-row"><span>Run times</span><span>{diag.genTimes.slice(0, 6).map(fmtDur).join(" · ")}{diag.genTimes.length > 6 ? " …" : ""}</span></div>
                  )}
                  {Object.keys(diag.eraArrivalSec).length > 0 && (
                    <div className="set-diag-row"><span>Latest era reached</span><span>{eraName(Math.max(...Object.keys(diag.eraArrivalSec).map(Number)))}</span></div>
                  )}
                  <div className="set-diag-row"><span>Longest idle stretch</span><span>{diag.longestWallSec > 0 ? fmtDur(diag.longestWallSec) : "—"}</span></div>
                  {Object.keys(diag.tabCounts).length > 0 && (
                    <div className="set-diag-row"><span>Most-used tab</span><span>{Object.entries(diag.tabCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"}</span></div>
                  )}
                  <div className="set-backup-actions" style={{ marginTop: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => { clearTelemetry(); setDiagTick((t) => t + 1); }}>Clear diagnostics</button>
                  </div>
                </div>
              ) : (
                <p className="set-backup-tip">Diagnostics are off — nothing is being recorded.</p>
              )}
            </div>
          )}
        </div>

        <button className="btn btn-ghost" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
