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

export function listQuizzes(): Promise<QuizFile[]> {
  return invoke<QuizFile[]>("list_quizzes");
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

export function listDrafts(): Promise<QuizFile[]> {
  return invoke<QuizFile[]>("list_drafts");
}

export function approveDraft(name: string): Promise<void> {
  return invoke("approve_draft", { name });
}

// Creates a draft from a template; returns the path of its quiz.txt.
export function newDraft(): Promise<string> {
  return invoke<string>("new_draft");
}

export function openPath(path: string): Promise<void> {
  return invoke("open_path", { path });
}

// Moves data/attempts.jsonl to a dated backup; returns the backup's path
// ("" if there was no log).
export function clearAttempts(): Promise<string> {
  return invoke<string>("clear_attempts");
}
