import { create } from "zustand";

export interface Settings {
  sound: boolean;
  haptics: boolean;
  reducedMotion: boolean;
  /** First-run onboarding seen? Persisted so it shows exactly once. */
  onboarded: boolean;
}

const KEY = "singularity.settings.v1";
const DEFAULTS: Settings = { sound: true, haptics: true, reducedMotion: false, onboarded: false };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

function persist(s: Settings): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ sound: s.sound, haptics: s.haptics, reducedMotion: s.reducedMotion, onboarded: s.onboarded }),
    );
  } catch {
    /* ignore */
  }
}

interface SettingsStore extends Settings {
  toggle: (key: "sound" | "haptics" | "reducedMotion") => void;
  completeOnboarding: () => void;
}

/** Player feel preferences. Persisted locally; read by sound/haptics/motion. */
export const useSettings = create<SettingsStore>((set, get) => ({
  ...load(),
  toggle: (key) => {
    set((s) => ({ [key]: !s[key] }) as Partial<SettingsStore>);
    persist(get());
  },
  completeOnboarding: () => {
    set({ onboarded: true });
    persist(get());
  },
}));
