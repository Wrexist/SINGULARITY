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
  /** Softer haptics: every vibration pulse at half strength (same rhythm). */
  hapticsLight: boolean;
  /** Endgame number display: scientific (1.23e9) instead of suffixes (1.23B). */
  scientificNotation: boolean;
  /** Return reminders: one honest local notification when the offline cap fills.
   *  Opt-in (default off) and OS-permission gated; native only. */
  notifyReminders: boolean;
  /** Last successful save backup (export/share), ms epoch — null = never.
   *  Drives the one-time gentle backup nudge; no timers, no urgency. */
  lastBackupAt: number | null;
  /** Achievements earned when the Awards modal was last opened — the nav badge
   *  shows only NEW unlocks since, so it matches the other badges' "needs you"
   *  semantics instead of being a permanently-large lifetime total. */
  achievementsSeen: number;
}

const KEY = "singularity.settings.v1";

/** Seed the in-app reduced-motion toggle from the OS preference on FIRST run
 *  (a saved choice always wins). The canvas/FX layers read the setting, not the
 *  media query, so without this seed an OS-level preference was ignored. */
function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

const DEFAULTS: Settings = { sound: true, music: true, haptics: true, reducedMotion: prefersReducedMotion(), hallTheme: "classic", rackSkin: "classic", onboarded: false, shipExplained: false, hapticsLight: false, scientificNotation: false, lastBackupAt: null, achievementsSeen: 0, notifyReminders: false };

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
      JSON.stringify({ sound: s.sound, music: s.music, haptics: s.haptics, reducedMotion: s.reducedMotion, hallTheme: s.hallTheme, rackSkin: s.rackSkin, onboarded: s.onboarded, shipExplained: s.shipExplained, hapticsLight: s.hapticsLight, scientificNotation: s.scientificNotation, lastBackupAt: s.lastBackupAt, achievementsSeen: s.achievementsSeen, notifyReminders: s.notifyReminders }),
    );
  } catch {
    /* ignore */
  }
}

interface SettingsStore extends Settings {
  toggle: (key: "sound" | "music" | "haptics" | "hapticsLight" | "reducedMotion" | "scientificNotation") => void;
  setHallTheme: (id: string) => void;
  setRackSkin: (id: string) => void;
  /** Return-reminder toggle (permission handling lives in the UI before this is set). */
  setNotifyReminders: (on: boolean) => void;
  completeOnboarding: () => void;
  markShipExplained: () => void;
  markBackedUp: () => void;
  markAchievementsSeen: (count: number) => void;
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
  setNotifyReminders: (on) => {
    set({ notifyReminders: on });
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
  markAchievementsSeen: (count) => {
    // Monotonic — a stale smaller count (e.g. from a second tab) never re-badges.
    if (count <= get().achievementsSeen) return;
    set({ achievementsSeen: count });
    persist(get());
  },
}));
