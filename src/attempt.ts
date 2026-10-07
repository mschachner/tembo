import type { Quiz } from "./quiz/format";

// Everything later statistics are computed from. Append-only: add fields,
// don't rename them. version 1 records had no per-item timing and a
// timeLimitSeconds field.
export interface ItemResult {
  answer: string;        // canonical
  found: boolean;
  acceptedMs?: number;   // since the attempt started
  focusedMs?: number;    // prompt mode: last time the card's box took focus before accept
  typedChars?: number;   // length of the accepted input
  wrong: number;         // rejected submissions on this item (always 0 in list mode)
}

export interface Attempt {
  version: 2;
  quiz: string;          // path of the quiz file (kept for continuity with older records)
  quizId?: string;       // stable key; absent on records written before ids existed
  title: string;
  mode: Quiz["mode"];
  kind: Quiz["kind"];
  startedAt: string;     // ISO timestamps
  endedAt: string;
  durationSeconds: number;
  total: number;
  score: number;
  cleared: boolean;      // score met the quiz's pass threshold
  found: string[];       // canonical answers, in the order found
  missed: string[];
  rejected: number;      // rejected submissions in total (list mode can't attribute them to items)
  items: ItemResult[];   // file order
}

export interface ItemTiming {
  acceptedMs?: number;
  focusedMs?: number;
  typedChars?: number;
  wrong: number;
}

export function makeAttempt(
  quiz: Quiz,
  startedAt: Date,
  endedAt: Date,
  foundOrder: number[],
  timing: ItemTiming[],
  rejected: number,
): Attempt {
  const foundSet = new Set(foundOrder);
  const found = foundOrder.map((i) => quiz.items[i].canonical);
  const missed = quiz.items.filter((_, i) => !foundSet.has(i)).map((it) => it.canonical);
  const items: ItemResult[] = quiz.items.map((it, i) => ({
    answer: it.canonical,
    found: foundSet.has(i),
    ...timing[i],
  }));
  const score = found.length;
  return {
    version: 2,
    quiz: quiz.path,
    quizId: quiz.id,
    title: quiz.title,
    mode: quiz.mode,
    kind: quiz.kind,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationSeconds: Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
    total: quiz.items.length,
    score,
    cleared: score * 100 >= quiz.passPercent * quiz.items.length,
    found,
    missed,
    rejected,
    items,
  };
}
