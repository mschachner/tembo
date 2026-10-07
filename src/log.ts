import type { Attempt } from "./attempt";

// Older records lack per-item timing; the grader treats them as score-only.
export interface AttemptV1 {
  version: 1;
  quiz: string;
  title: string;
  mode: "list" | "prompt";
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  timeLimitSeconds: number;
  total: number;
  score: number;
  cleared: boolean;
  found: string[];
  missed: string[];
}

export type AnyAttempt = Attempt | AttemptV1;

export function parseLog(text: string): AnyAttempt[] {
  const out: AnyAttempt[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      out.push(JSON.parse(line) as AnyAttempt);
    } catch (e) {
      console.warn("skipping bad attempt line", line, e);
    }
  }
  out.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return out;
}
