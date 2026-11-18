import type { Attempt } from "./attempt";
import { bucketOf, itemLatency, type Bucket } from "./grade";
import type { AnyAttempt } from "./log";
import type { Quiz } from "./quiz/format";

export interface ItemStats {
  answer: string;
  seen: number;      // attempts in which the item appeared
  instant: number;
  slow: number;
  missed: number;
  untimed: number;   // found in a record without timing (version 1)
  latencies: number[];
  last: Bucket | "untimed" | null;
}

export interface AttemptSummary {
  attempt: AnyAttempt;
  grade: number;
}

// A quiz can ask for the same answer more than once (Grover Cleveland, 22nd
// and 24th president). The k-th item with an answer goes with the k-th
// result with that answer in an attempt; these keys say which is which.
export function occurrenceKeys(answers: string[]): string[] {
  const count = new Map<string, number>();
  return answers.map((answer) => {
    const k = count.get(answer) ?? 0;
    count.set(answer, k + 1);
    return `${k}\u0000${answer}`;
  });
}

// Per-item history across all of a quiz's attempts, in file order.
export function itemStats(quiz: Quiz, attempts: AnyAttempt[], cps: number): ItemStats[] {
  const keys = occurrenceKeys(quiz.items.map((it) => it.canonical));
  const byAnswer = new Map<string, ItemStats>();
  quiz.items.forEach((it, i) => {
    byAnswer.set(keys[i], {
      answer: it.canonical, seen: 0, instant: 0, slow: 0, missed: 0, untimed: 0, latencies: [], last: null,
    });
  });
  for (const a of attempts) {
    if (a.version === 2) {
      const own = occurrenceKeys(a.items.map((r) => r.answer));
      for (let i = 0; i < a.items.length; i++) {
        const st = byAnswer.get(own[i]);
        if (!st) continue; // item since removed from the quiz
        st.seen++;
        const b = bucketOf(a as Attempt, i, cps);
        st[b]++;
        st.last = b;
        const lat = itemLatency(a as Attempt, i, cps);
        if (lat !== null) st.latencies.push(lat);
      }
    } else {
      for (const key of occurrenceKeys(a.found)) {
        const st = byAnswer.get(key);
        if (st) { st.seen++; st.untimed++; st.last = "untimed"; }
      }
      for (const key of occurrenceKeys(a.missed)) {
        const st = byAnswer.get(key);
        if (st) { st.seen++; st.missed++; st.last = "missed"; }
      }
    }
  }
  return keys.map((key) => byAnswer.get(key)!);
}

// Higher is worse: misses count double, slows single, per appearance.
export function trouble(st: ItemStats): number {
  return st.seen === 0 ? 0 : (2 * st.missed + st.slow) / st.seen;
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
