import type { Attempt } from "./attempt";
import type { AnyAttempt } from "./log";

// An item's recall latency is the time spent on it minus the time its
// answer would take to type at the calibrated speed. Items under
// INSTANT_SECONDS are "instant"; the rest are "slow"; unfound are "missed".
export let INSTANT_SECONDS = 1.5;
export function setInstantSeconds(x: number): void {
  if (Number.isFinite(x) && x > 0) INSTANT_SECONDS = x;
}
// Used until a calibration attempt exists. 5 chars/s ≈ 60 wpm.
export const DEFAULT_CPS = 5;

export type Bucket = "instant" | "slow" | "missed";

// Seconds spent on an item: since its card was focused (prompt mode) or
// since the previous accept (list mode).
export function itemSeconds(attempt: Attempt, idx: number): number | null {
  const r = attempt.items[idx];
  if (!r.found || r.acceptedMs === undefined) return null;
  let from = 0;
  if (attempt.mode === "prompt") {
    from = r.focusedMs ?? 0;
  } else {
    const pos = attempt.found.indexOf(r.answer);
    if (pos > 0) {
      const prev = attempt.items.find((x) => x.answer === attempt.found[pos - 1]);
      from = prev?.acceptedMs ?? 0;
    }
  }
  return (r.acceptedMs - from) / 1000;
}

export function itemLatency(attempt: Attempt, idx: number, cps: number): number | null {
  const secs = itemSeconds(attempt, idx);
  if (secs === null) return null;
  const typing = (attempt.items[idx].typedChars ?? 0) / cps;
  return Math.max(0, secs - typing);
}

export function bucketOf(attempt: Attempt, idx: number, cps: number): Bucket {
  const lat = itemLatency(attempt, idx, cps);
  if (lat === null) return "missed";
  return lat < INSTANT_SECONDS ? "instant" : "slow";
}

// Grade in [0, 1]: instant items count fully, slow items half.
// Score-only records (version 1) get 0.5 if cleared.
export function gradeOf(attempt: AnyAttempt, cps: number): number {
  if (attempt.version !== 2) return attempt.cleared ? 0.5 : 0;
  if (attempt.total === 0) return 0;
  let points = 0;
  for (let i = 0; i < attempt.items.length; i++) {
    const b = bucketOf(attempt, i, cps);
    if (b === "instant") points += 1;
    else if (b === "slow") points += 0.5;
  }
  return points / attempt.total;
}

// Typing speed (chars/s): median per-item rate over the most recent
// calibration attempts. Null when there are none.
export function typingSpeed(attempts: AnyAttempt[], recent = 3): number | null {
  const rates: number[] = [];
  const calib = attempts.filter((a): a is Attempt => a.version === 2 && a.kind === "calibration").slice(-recent);
  for (const a of calib) {
    for (let i = 0; i < a.items.length; i++) {
      const r = a.items[i];
      const secs = itemSeconds(a, i);
      if (secs === null || secs <= 0 || !r.typedChars) continue;
      rates.push(r.typedChars / secs);
    }
  }
  if (rates.length === 0) return null;
  rates.sort((x, y) => x - y);
  const mid = Math.floor(rates.length / 2);
  return rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;
}

// Everything known about one item in one attempt, for detail views.
export interface ItemRecord {
  answer: string;
  result: Bucket | "untimed";
  acceptedMs: number | null;
  seconds: number | null;    // time on item
  latency: number | null;
  typedChars: number | null;
  wrong: number | null;
  guesses: string[];         // the wrong guesses, where the record has them
}

export function itemRecord(attempt: AnyAttempt, answer: string, cps: number): ItemRecord | null {
  if (attempt.version !== 2) {
    if (attempt.found.includes(answer)) {
      return { answer, result: "untimed", acceptedMs: null, seconds: null, latency: null, typedChars: null, wrong: null, guesses: [] };
    }
    if (attempt.missed.includes(answer)) {
      return { answer, result: "missed", acceptedMs: null, seconds: null, latency: null, typedChars: null, wrong: null, guesses: [] };
    }
    return null;
  }
  const idx = attempt.items.findIndex((r) => r.answer === answer);
  return idx < 0 ? null : itemRecordAt(attempt, idx, cps);
}

// The same, for the item at a position in the attempt (a quiz can ask for
// one answer twice; each has its own record).
export function itemRecordAt(attempt: Attempt, idx: number, cps: number): ItemRecord {
  const r = attempt.items[idx];
  return {
    answer: r.answer,
    result: bucketOf(attempt, idx, cps),
    acceptedMs: r.acceptedMs ?? null,
    seconds: itemSeconds(attempt, idx),
    latency: itemLatency(attempt, idx, cps),
    typedChars: r.typedChars ?? null,
    wrong: r.wrong,
    guesses: r.guesses ?? [],
  };
}

// Answers in the order they were shown; legacy records: found order, then missed.
export function playOrder(attempt: AnyAttempt): string[] {
  if (attempt.version === 2 && attempt.order) return attempt.order.map((i) => attempt.items[i].answer);
  return [...attempt.found, ...attempt.missed];
}
