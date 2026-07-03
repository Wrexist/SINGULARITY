import { create } from "zustand";

export interface Settings {
  sound: boolean;
  /** Ambient music bed + era/ship stingers (separate from SFX so each is opt-out). */
  music: boolean;
  haptics: boolean;
  reducedMotion: boolean;
  /** Cosmetic hall theme id (purely visual; never affects gameplay). */
  hallTheme: string;
  /** Cosmetic rack skin id (R6.3; recolours the racks, never affects gameplay). */
  rackSkin: string;
  /** First-run onboarding seen? Persisted so it shows exactly once. */
  onboarded: boolean;
  /** One-time "what does Shipping do" explainer seen? (shows at first ship-ready). */
  shipExplained: boolean;
  /** Endgame number display: scientific (1.23e9) instead of suffixes (1.23B). */
  scientificNotation: boolean;
  /** Last successful save backup (export/share), ms epoch — null = never.
   *  Drives the one-time gentle backup nudge; no timers, no urgency. */
  lastBackupAt: number | null;
}

const KEY = "singularity.settings.v1";
const DEFAULTS: Settings = { sound: true, music: true, haptics: true, reducedMotion: false, hallTheme: "classic", rackSkin: "classic", onboarded: false, shipExplained: false, scientificNotation: false, lastBackupAt: null };

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
      JSON.stringify({ sound: s.sound, music: s.music, haptics: s.haptics, reducedMotion: s.reducedMotion, hallTheme: s.hallTheme, rackSkin: s.rackSkin, onboarded: s.onboarded, shipExplained: s.shipExplained, scientificNotation: s.scientificNotation, lastBackupAt: s.lastBackupAt }),
    );
  } catch {
    /* ignore */
  }
}

interface SettingsStore extends Settings {
  toggle: (key: "sound" | "music" | "haptics" | "reducedMotion" | "scientificNotation") => void;
  setHallTheme: (id: string) => void;
  setRackSkin: (id: string) => void;
  completeOnboarding: () => void;
  markShipExplained: () => void;
  markBackedUp: () => void;
}

/** Player feel preferences. Persisted locally; read by sound/haptics/motion. */
export const useSettings = create<SettingsStore>((set, get) => ({
  ...load(),
  toggle: (key) => {
    set((s) => ({ [key]: !s[key] }) as Partial<SettingsStore>);
    persist(get());
  },
  setHallTheme: (id) => {
    set({ hallTheme: id });
    persist(get());
  },
  setRackSkin: (id) => {
    set({ rackSkin: id });
    persist(get());
  },
  completeOnboarding: () => {
    set({ onboarded: true });
    persist(get());
  },
  markShipExplained: () => {
    set({ shipExplained: true });
    persist(get());
  },
  markBackedUp: () => {
    set({ lastBackupAt: Date.now() });
    persist(get());
  },
}));
