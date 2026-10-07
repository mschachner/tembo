import type { Quiz } from "./quiz/format";

// Everything later statistics are computed from. Keep this append-only:
// add fields, don't rename them.
export interface Attempt {
  version: 1;
  quiz: string;          // path of the quiz file
  title: string;
  mode: Quiz["mode"];
  startedAt: string;     // ISO timestamps
  endedAt: string;
  durationSeconds: number;
  timeLimitSeconds: number;
  total: number;
  score: number;
  cleared: boolean;      // score met the quiz's pass threshold
  found: string[];       // canonical answers, in the order found
  missed: string[];
}

export function makeAttempt(
  quiz: Quiz,
  startedAt: Date,
  endedAt: Date,
  foundOrder: number[],
): Attempt {
  const foundSet = new Set(foundOrder);
  const found = foundOrder.map((i) => quiz.items[i].canonical);
  const missed = quiz.items.filter((_, i) => !foundSet.has(i)).map((it) => it.canonical);
  const score = found.length;
  return {
    version: 1,
    quiz: quiz.path,
    title: quiz.title,
    mode: quiz.mode,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationSeconds: Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
    timeLimitSeconds: quiz.timeSeconds,
    total: quiz.items.length,
    score,
    cleared: score * 100 >= quiz.passPercent * quiz.items.length,
    found,
    missed,
  };
}
