import type { AnyAttempt } from "./log";

// Quiz-level spaced repetition. The interval starts at one day on the
// first clear and is multiplied by m(grade) on each later clear; a failed
// attempt resets it to one day. Due dates are whole local days.

export const PROFICIENT_DAYS = 60;
export const MAINTENANCE_DAYS = 90;

export type Status = "new" | "learning" | "proficient";

export interface QuizState {
  status: Status;
  intervalDays: number;      // 0 for new
  dueDate: string | null;    // YYYY-MM-DD local; null for new
  lastAttemptAt: string | null;
  attempts: number;
  lastGrade: number | null;
}

export const NEW_STATE: QuizState = {
  status: "new",
  intervalDays: 0,
  dueDate: null,
  lastAttemptAt: null,
  attempts: 0,
  lastGrade: null,
};

// 1 (labored clear) to 3 (fully fluent).
export function multiplier(grade: number): number {
  return 1 + 2 * Math.min(1, Math.max(0, grade));
}

export function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + n));
}

export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) / 86400000);
}

export function step(state: QuizState, attempt: AnyAttempt, grade: number): QuizState {
  let interval: number;
  if (attempt.cleared) {
    interval = state.intervalDays === 0 ? 1 : state.intervalDays * multiplier(grade);
    interval = Math.min(interval, MAINTENANCE_DAYS);
  } else {
    interval = 1;
  }
  const ended = new Date(attempt.endedAt);
  return {
    status: interval >= PROFICIENT_DAYS ? "proficient" : "learning",
    intervalDays: interval,
    dueDate: addDays(localDate(ended), Math.max(1, Math.round(interval))),
    lastAttemptAt: attempt.endedAt,
    attempts: state.attempts + 1,
    lastGrade: grade,
  };
}

// Attempts must be in chronological order.
export function replay(attempts: AnyAttempt[], gradeOf: (a: AnyAttempt) => number): QuizState {
  return attempts.reduce((s, a) => step(s, a, gradeOf(a)), NEW_STATE);
}

export function isDue(state: QuizState, today: string): boolean {
  return state.dueDate === null || state.dueDate <= today;
}
