import { invoke } from "@tauri-apps/api/core";

export interface QuizFile {
  path: string;
  source: string;
}

export function listQuizzes(): Promise<QuizFile[]> {
  return invoke<QuizFile[]>("list_quizzes");
}

// One JSON line appended to data/attempts.jsonl.
export function appendAttempt(record: unknown): Promise<void> {
  return invoke("append_attempt", { line: JSON.stringify(record) });
}
