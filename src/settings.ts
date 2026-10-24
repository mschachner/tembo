import { readSettings, writeSettings } from "./backend";
import type { Theme } from "./theme";
import { DEFAULT_MOTION, type Motion } from "./motion";

export interface Settings {
  preset: string;            // name of the theme preset in themes/
  overrides: Theme;          // per-variable overrides on top of the preset
  sound: { enabled: boolean; volume: number };
  grading: { instantSeconds: number };   // latency below this counts as instant
  motion: Motion;
  views: Record<string, "cards" | "list">;   // prompt quizzes: last view, by quiz id
  groupBy: "status" | "topic";             // Library and Watering Hole lists
}

export const DEFAULT_SETTINGS: Settings = {
  preset: "wheat",
  overrides: {},
  sound: { enabled: true, volume: 0.5 },
  grading: { instantSeconds: 1.5 },
  motion: DEFAULT_MOTION,
  views: {},
  groupBy: "status",
};

export async function loadSettings(): Promise<Settings> {
  const text = await readSettings();
  if (!text.trim()) return structuredClone(DEFAULT_SETTINGS);
  try {
    const raw = JSON.parse(text) as Partial<Settings>;
    return {
      preset: raw.preset ?? DEFAULT_SETTINGS.preset,
      overrides: raw.overrides ?? {},
      sound: { ...DEFAULT_SETTINGS.sound, ...(raw.sound ?? {}) },
      grading: { ...DEFAULT_SETTINGS.grading, ...(raw.grading ?? {}) },
      motion: {
        enabled: raw.motion?.enabled ?? DEFAULT_MOTION.enabled,
        speed: raw.motion?.speed ?? DEFAULT_MOTION.speed,
      },
      views: raw.views ?? {},
      groupBy: raw.groupBy === "topic" ? "topic" : "status",
    };
  } catch (e) {
    console.warn("bad settings.json, using defaults", e);
    return structuredClone(DEFAULT_SETTINGS);
  }
}

let pending: number | null = null;
export function saveSettings(s: Settings): void {
  // Coalesce rapid slider changes into one write.
  if (pending !== null) window.clearTimeout(pending);
  pending = window.setTimeout(() => {
    pending = null;
    writeSettings(JSON.stringify(s, null, 2)).catch((e) => console.error("could not save settings", e));
  }, 300);
}
