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

// Per-item history across all of a quiz's attempts, in file order.
export function itemStats(quiz: Quiz, attempts: AnyAttempt[], cps: number): ItemStats[] {
  const byAnswer = new Map<string, ItemStats>();
  for (const it of quiz.items) {
    byAnswer.set(it.canonical, {
      answer: it.canonical, seen: 0, instant: 0, slow: 0, missed: 0, untimed: 0, latencies: [], last: null,
    });
  }
  for (const a of attempts) {
    if (a.version === 2) {
      for (let i = 0; i < a.items.length; i++) {
        const st = byAnswer.get(a.items[i].answer);
        if (!st) continue; // item since removed from the quiz
        st.seen++;
        const b = bucketOf(a as Attempt, i, cps);
        st[b]++;
        st.last = b;
        const lat = itemLatency(a as Attempt, i, cps);
        if (lat !== null) st.latencies.push(lat);
      }
    } else {
      for (const ans of a.found) {
        const st = byAnswer.get(ans);
        if (st) { st.seen++; st.untimed++; st.last = "untimed"; }
      }
      for (const ans of a.missed) {
        const st = byAnswer.get(ans);
        if (st) { st.seen++; st.missed++; st.last = "missed"; }
      }
    }
  }
  return quiz.items.map((it) => byAnswer.get(it.canonical)!);
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
