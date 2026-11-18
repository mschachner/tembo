import { invoke as tauriInvoke } from "@tauri-apps/api/core";

// Outside Tauri (plain `vite` in a browser) a mock backend serves the
// repo's quizzes and themes read-only, so screens can be previewed.
const inTauri = "__TAURI_INTERNALS__" in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (inTauri) return tauriInvoke<T>(cmd, args);
  const { mockInvoke } = await import("./mock");
  return mockInvoke<T>(cmd, args);
}

export interface QuizFile {
  dir: string;
  path: string;
  source: string;
}

// A series folder: series.txt (null when missing) and its quiz folders.
export interface SeriesFile {
  dir: string;
  path: string;
  source: string | null;
  quizzes: QuizFile[];
}

export function listSeries(): Promise<SeriesFile[]> {
  return invoke<SeriesFile[]>("list_series");
}

// Image inside a quiz directory, as a data URL.
export function readAsset(dir: string, rel: string): Promise<string> {
  return invoke<string>("read_asset", { dir, rel });
}

// The whole of data/attempts.jsonl ("" if absent).
export function readAttempts(): Promise<string> {
  return invoke<string>("read_attempts");
}

// One JSON line appended to data/attempts.jsonl.
export function appendAttempt(record: unknown): Promise<void> {
  return invoke("append_attempt", { line: JSON.stringify(record) });
}

export function rootDir(): Promise<string> {
  return invoke<string>("root_dir");
}

export interface ThemeFile {
  name: string;
  json: string;
  custom: boolean;   // saved by you (themes/custom/), as opposed to a default
}

export function listThemes(): Promise<ThemeFile[]> {
  return invoke<ThemeFile[]>("list_themes");
}

export function writeTheme(name: string, json: string): Promise<void> {
  return invoke("write_theme", { name, json });
}

export function deleteTheme(name: string): Promise<void> {
  return invoke("delete_theme", { name });
}

export function readSettings(): Promise<string> {
  return invoke<string>("read_settings");
}

export function writeSettings(json: string): Promise<void> {
  return invoke("write_settings", { json });
}

// Ids of the series imported from the Watering Hole (data/library.txt).
export function readLibrary(): Promise<string> {
  return invoke<string>("read_library");
}

// Replace the imported ids; the change is committed with `message` and pushed.
export function writeLibrary(ids: string[], message: string): Promise<void> {
  return invoke("write_library", { ids, message });
}

export function openPath(path: string): Promise<void> {
  return invoke("open_path", { path });
}

// Open a Wikipedia article (an https://en.wikipedia.org/wiki/ URL) in the
// default browser.
export function openUrl(url: string): Promise<void> {
  return invoke("open_url", { url });
}

// Moves data/attempts.jsonl to a dated backup; returns the backup's path
// ("" if there was no log).
export function clearAttempts(): Promise<string> {
  return invoke<string>("clear_attempts");
}

export interface SyncStatus {
  remote: string | null;     // origin URL; null when sync isn't set up
  last_ok: number | null;    // unix seconds of the last successful sync
  error: string | null;
}

// Pull from the remote in the background; a "synced" message follows if anything changed.
export function syncNow(): Promise<void> {
  return invoke("sync_now");
}

export function syncStatus(): Promise<SyncStatus> {
  return invoke<SyncStatus>("sync_status");
}

// Replace the Dock icon of the running app (base64 PNG). macOS only; the
// bundle's own icon returns when the app quits.
export async function setDockIcon(png: string): Promise<void> {
  if (!inTauri) return;
  await invoke("set_dock_icon", { png });
}
