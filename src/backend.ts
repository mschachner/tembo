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

// The whole of attempts.jsonl in the data folder ("" if absent).
export function readAttempts(): Promise<string> {
  return invoke<string>("read_attempts");
}

// One JSON line appended to attempts.jsonl.
export function appendAttempt(record: unknown): Promise<void> {
  return invoke("append_attempt", { line: JSON.stringify(record) });
}

// A theme's banner image as a data URL: `rel` in the data folder (your own
// images), else among the banners that come with the app.
export function readBanner(rel: string): Promise<string> {
  return invoke<string>("read_banner", { rel });
}

// Where the data folder and the Watering Hole are on disk, for display.
export interface Folders {
  data: string;
  hole: string;
}

export function folders(): Promise<Folders> {
  return invoke<Folders>("folders");
}

export interface ThemeFile {
  name: string;
  json: string;
  custom: boolean;   // saved by you (themes/ in the data folder), as opposed to a default
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

// Ids of the series imported from the Watering Hole (library.txt in the data folder).
export function readLibrary(): Promise<string> {
  return invoke<string>("read_library");
}

// Replace the imported ids; synced data commits the change with `message` and pushes it.
export function writeLibrary(ids: string[], message: string): Promise<void> {
  return invoke("write_library", { ids, message });
}

// Open one of Tembo's folders in Finder ("themes": your saved presets).
export function openFolder(which: "data" | "themes" | "watering-hole"): Promise<void> {
  return invoke("open_folder", { which });
}

// Open a Wikipedia article (an https://en.wikipedia.org/wiki/ URL) in the
// default browser.
export function openUrl(url: string): Promise<void> {
  return invoke("open_url", { url });
}

// Moves attempts.jsonl to a dated backup; returns the backup's path
// ("" if there was no log).
export function clearAttempts(): Promise<string> {
  return invoke<string>("clear_attempts");
}

export interface SyncState {
  source: string | null;     // where it syncs with; null when it doesn't
  last_ok: number | null;    // unix seconds of the last success
  error: string | null;
}

// `hole`: the Watering Hole, downloaded from the Tembo repository (source is
// null when running from a checkout, which reads its own folder). `data`:
// the data folder, synced when it is a git repository with a remote.
export interface SyncStatus {
  data: SyncState;
  hole: SyncState;
}

// In the background: check for a newer Watering Hole and pull the data
// folder's remote; a "synced" message follows if anything changed.
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
