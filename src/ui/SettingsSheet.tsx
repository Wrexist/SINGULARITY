import { useSettings, type Settings } from "./settings";

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
  const rows: { key: keyof Settings; label: string; hint: string; value: boolean }[] = [
    { key: "sound", label: "Sound", hint: "Synthesized taps, claims & ship chimes", value: sound },
    { key: "haptics", label: "Haptics", hint: "Vibration feedback on supported devices", value: haptics },
    { key: "reducedMotion", label: "Reduced motion", hint: "Calm the animations", value: reducedMotion },
  ];

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <h2 className="sheet-title">Settings</h2>
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
