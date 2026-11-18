// Statistics computed from the attempt log for the detail views and the
// Stats tab. Pure functions over quizzes and attempts; nothing here reads
// app state.
import type { Attempt } from "./attempt";
import { bucketOf, gradeOf, INSTANT_SECONDS, itemLatency, type Bucket } from "./grade";
import { isCalibration, type AnyAttempt } from "./log";
import { topicOf, type Quiz } from "./quiz/format";
import { addDays, daysBetween, localDate, type QuizState } from "./schedule";
import { itemStats, median, occurrenceKeys, type ItemStats } from "./stats";

export const dayOf = (a: AnyAttempt) => localDate(new Date(a.endedAt));

export interface Buckets { instant: number; slow: number; missed: number }

export function emptyBuckets(): Buckets {
  return { instant: 0, slow: 0, missed: 0 };
}

// Per-item results of one attempt, bucketed (version 1 records: found items
// count as slow, since they carry no timing).
export function bucketsOf(a: AnyAttempt, cps: number, into = emptyBuckets()): Buckets {
  if (a.version === 2) {
    for (let i = 0; i < a.items.length; i++) into[bucketOf(a as Attempt, i, cps)]++;
  } else {
    into.slow += a.found.length;
    into.missed += a.missed.length;
  }
  return into;
}

export function latenciesOf(a: AnyAttempt, cps: number): number[] {
  if (a.version !== 2) return [];
  const out: number[] = [];
  for (let i = 0; i < a.items.length; i++) {
    const lat = itemLatency(a as Attempt, i, cps);
    if (lat !== null) out.push(lat);
  }
  return out;
}

// ---------- one quiz ----------

export interface QuizSummary {
  attempts: number;
  clears: number;
  bestScore: number | null;       // items
  bestTime: number | null;        // seconds, among cleared attempts
  meanTime: number | null;
  firstPlayed: string | null;     // YYYY-MM-DD
  lastPlayed: string | null;
  daysPlayed: number;
  scores: number[];               // fraction per attempt, chronological
  grades: number[];
  times: number[];                // seconds per attempt
  buckets: Buckets;               // across all attempts
  lastBuckets: Buckets | null;    // the latest attempt
  latencies: number[];
  medianLatency: number | null;
  known: number;                  // items instant on their last appearance
  shaky: number;                  // items slow on their last appearance
  unknown: number;                // items missed on their last appearance (or never seen)
}

export function quizSummary(quiz: Quiz, attempts: AnyAttempt[], cps: number): QuizSummary {
  const cleared = attempts.filter((a) => a.cleared);
  const times = attempts.map((a) => a.durationSeconds);
  const buckets = emptyBuckets();
  const latencies: number[] = [];
  for (const a of attempts) { bucketsOf(a, cps, buckets); latencies.push(...latenciesOf(a, cps)); }
  const stats = itemStats(quiz, attempts, cps);
  const last = attempts.at(-1);
  return {
    attempts: attempts.length,
    clears: cleared.length,
    bestScore: attempts.length ? Math.max(...attempts.map((a) => a.score)) : null,
    bestTime: cleared.length ? Math.min(...cleared.map((a) => a.durationSeconds)) : null,
    meanTime: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
    firstPlayed: attempts.length ? dayOf(attempts[0]) : null,
    lastPlayed: last ? dayOf(last) : null,
    daysPlayed: new Set(attempts.map(dayOf)).size,
    scores: attempts.map((a) => (a.total ? a.score / a.total : 0)),
    grades: attempts.map((a) => gradeOf(a, cps)),
    times,
    buckets,
    lastBuckets: last ? bucketsOf(last, cps) : null,
    latencies,
    medianLatency: median(latencies),
    known: stats.filter((s) => s.last === "instant").length,
    shaky: stats.filter((s) => s.last === "slow" || s.last === "untimed").length,
    unknown: stats.filter((s) => s.last === "missed" || s.last === null).length,
  };
}

// Items × attempts: each item's bucket in each attempt (null where the
// item wasn't in the quiz yet). Rows in the given item order.
export function itemHistory(attempts: AnyAttempt[], cps: number, answers: string[]): (Bucket | "untimed" | null)[][] {
  // An answer asked for twice has two rows: the k-th goes with the k-th
  // result with that answer in each attempt.
  const keys = occurrenceKeys(answers);
  const own = attempts.map((a) => (a.version === 2 ? occurrenceKeys(a.items.map((r) => r.answer)) : []));
  return answers.map((answer, row) => attempts.map((a, col) => {
    if (a.version === 2) {
      const idx = own[col].indexOf(keys[row]);
      return idx < 0 ? null : bucketOf(a as Attempt, idx, cps);
    }
    if (a.found.includes(answer)) return "untimed";
    if (a.missed.includes(answer)) return "missed";
    return null;
  }));
}

// ---------- the whole log ----------

export interface DayActivity { attempts: number; cleared: number; seconds: number; grades: number[] }

export function activityByDay(attempts: AnyAttempt[], cps: number): Map<string, DayActivity> {
  const out = new Map<string, DayActivity>();
  for (const a of attempts) {
    const d = dayOf(a);
    const row = out.get(d) ?? { attempts: 0, cleared: 0, seconds: 0, grades: [] };
    row.attempts++;
    if (a.cleared) row.cleared++;
    row.seconds += a.durationSeconds;
    row.grades.push(gradeOf(a, cps));
    out.set(d, row);
  }
  return out;
}

// Consecutive days with an attempt, counting back from today (a streak
// is kept alive through today if yesterday had one).
export function streak(days: Set<string>, today: string): number {
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export function longestStreak(days: Set<string>): number {
  let best = 0;
  for (const d of days) {
    if (days.has(addDays(d, -1))) continue;
    let n = 0, x = d;
    while (days.has(x)) { n++; x = addDays(x, 1); }
    best = Math.max(best, n);
  }
  return best;
}

// The last `n` days ending today, oldest first.
export function lastDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}

// Latencies binned in `width`-second bins; the last bin is open-ended.
export function histogram(values: number[], width: number, bins: number): number[] {
  const out = new Array(bins).fill(0);
  for (const v of values) out[Math.min(bins - 1, Math.floor(v / width))]++;
  return out;
}

export const instantBin = (width: number) => INSTANT_SECONDS / width;

// Quizzes due on each of the next `days` days (overdue ones count today).
export function forecast(entries: { quiz: Quiz; state: QuizState }[], today: string, days: number): { date: string; due: number; quizzes: string[] }[] {
  const out = lastDays(addDays(today, days - 1), days).map((date) => ({ date, due: 0, quizzes: [] as string[] }));
  for (const e of entries) {
    if (e.quiz.kind !== "normal" || e.quiz.retired) continue;
    const date = e.state.dueDate === null ? today : e.state.dueDate < today ? today : e.state.dueDate;
    const k = daysBetween(today, date);
    if (k >= 0 && k < days) { out[k].due++; out[k].quizzes.push(e.quiz.title); }
  }
  return out;
}

// Items across the library that have gone worst recently: misses and slow
// answers in the last few appearances, newest weighted most. The score adds
// up rather than averages, so an item missed in several attempts ranks above
// one missed in its only attempt.
const TROUBLE_WINDOW = 4;
export interface TroubleItem { quiz: Quiz; stats: ItemStats; score: number; recent: (Bucket | "untimed")[] }

// Ties go to the item with more misses and slow answers over its whole history.
const totalTrouble = (st: ItemStats) => 2 * st.missed + st.slow;

// At most `perQuiz` items from any one quiz, so one bad quiz doesn't fill the list.
export function troubleItems(quizzes: Quiz[], attemptsOf: (q: Quiz) => AnyAttempt[], cps: number, limit: number, perQuiz = Infinity): TroubleItem[] {
  const out: TroubleItem[] = [];
  for (const quiz of quizzes) {
    const own = attemptsOf(quiz).filter((a) => !isCalibration(a));
    if (!own.length) continue;
    const recentAttempts = own.slice(-TROUBLE_WINDOW);
    const hist = itemHistory(recentAttempts, cps, quiz.items.map((it) => it.canonical));
    const stats = itemStats(quiz, own, cps);
    quiz.items.forEach((_it, i) => {
      const recent = hist[i].filter((b): b is Bucket | "untimed" => b !== null);
      if (!recent.length) return;
      // Weights 4, 3, 2, 1 from newest to oldest; a miss costs 2, slow 1.
      let score = 0;
      recent.forEach((b, k) => { score += (TROUBLE_WINDOW - (recent.length - 1 - k)) * (b === "missed" ? 2 : b === "slow" ? 1 : 0); });
      if (score > 0) out.push({ quiz, stats: stats[i], score, recent });
    });
  }
  out.sort((a, b) => b.score - a.score || totalTrouble(b.stats) - totalTrouble(a.stats) || a.stats.answer.localeCompare(b.stats.answer));
  const taken = new Map<string, number>();
  return out.filter((x) => {
    const n = taken.get(x.quiz.id) ?? 0;
    if (n >= perQuiz) return false;
    taken.set(x.quiz.id, n + 1);
    return true;
  }).slice(0, limit);
}

// Per topic: quizzes by status, attempts and clears, and item buckets.
export interface TopicSummary { topic: string; quizzes: number; proficient: number; learning: number; fresh: number; attempts: number; cleared: number; buckets: Buckets }

export function byTopic(entries: { quiz: Quiz; state: QuizState }[], attemptsOf: (q: Quiz) => AnyAttempt[], cps: number): TopicSummary[] {
  const map = new Map<string, TopicSummary>();
  for (const e of entries) {
    if (e.quiz.kind !== "normal") continue;
    const t = topicOf(e.quiz) || "untagged";
    const row = map.get(t) ?? { topic: t, quizzes: 0, proficient: 0, learning: 0, fresh: 0, attempts: 0, cleared: 0, buckets: emptyBuckets() };
    row.quizzes++;
    row[e.state.status === "proficient" ? "proficient" : e.state.status === "learning" ? "learning" : "fresh"]++;
    for (const a of attemptsOf(e.quiz)) { row.attempts++; if (a.cleared) row.cleared++; bucketsOf(a, cps, row.buckets); }
    map.set(t, row);
  }
  return [...map.values()].sort((a, b) => b.attempts - a.attempts || a.topic.localeCompare(b.topic));
}

// Everything in the library, item by item: known (instant last time),
// shaky (slow), unknown (missed or never seen).
export function libraryKnowledge(quizzes: Quiz[], attemptsOf: (q: Quiz) => AnyAttempt[], cps: number): { known: number; shaky: number; unknown: number; items: number } {
  const out = { known: 0, shaky: 0, unknown: 0, items: 0 };
  for (const quiz of quizzes) {
    if (quiz.kind !== "normal" || quiz.retired) continue;
    const own = attemptsOf(quiz).filter((a) => !isCalibration(a));
    const s = quizSummary(quiz, own, cps);
    out.known += s.known; out.shaky += s.shaky; out.unknown += s.unknown; out.items += quiz.items.length;
  }
  return out;
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const hr = Math.floor(m / 60);
  return `${hr}h ${m % 60}m`;
}

export const pct = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : "–");
