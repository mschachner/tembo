import { invoke } from "@tauri-apps/api/core";

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
