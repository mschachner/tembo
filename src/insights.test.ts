import { describe, expect, it } from "vitest";
import type { Attempt } from "./attempt";
import { forecast, histogram, longestStreak, streak, troubleItems } from "./insights";
import type { Quiz } from "./quiz/format";
import { NEW_STATE } from "./schedule";

const quiz = (id: string, answers: string[]): Quiz => ({
  path: `${id}/quiz.txt`, dir: id, id, title: id, mode: "list", kind: "normal", retired: false, tags: ["t"], series: "", chunk: "", level: "standard",
  passPercent: 100, imageHeight: 72, columns: [], promptLabel: "", answerLabel: "",
  items: answers.map((a) => ({ canonical: a, aliases: [], data: [] })),
});

// An attempt where `missed` are missed and the rest found instantly.
function attempt(q: Quiz, endedAt: string, missed: string[]): Attempt {
  const found = q.items.map((it) => it.canonical).filter((a) => !missed.includes(a));
  return {
    version: 2, quiz: q.path, quizId: q.id, title: q.title, mode: "list", kind: "normal",
    startedAt: endedAt, endedAt, durationSeconds: 10, total: q.items.length, score: found.length,
    cleared: missed.length === 0, found, missed, rejected: 0,
    items: q.items.map((it, i) => ({ answer: it.canonical, found: found.includes(it.canonical), acceptedMs: 500 * (i + 1), typedChars: 3, wrong: 0 })),
  };
}

describe("streaks", () => {
  it("counts back from today, or from yesterday when today is still open", () => {
    const days = new Set(["2026-10-20", "2026-10-21", "2026-10-22"]);
    expect(streak(days, "2026-10-22")).toBe(3);
    expect(streak(days, "2026-10-23")).toBe(3);
    expect(streak(days, "2026-10-24")).toBe(0);
  });
  it("finds the longest run", () => {
    expect(longestStreak(new Set(["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07"]))).toBe(3);
    expect(longestStreak(new Set())).toBe(0);
  });
});

describe("histogram", () => {
  it("bins with an open last bin", () => {
    expect(histogram([0.1, 0.6, 0.7, 9], 0.5, 3)).toEqual([1, 2, 1]);
  });
});

describe("forecast", () => {
  it("folds overdue into today and counts each day", () => {
    const q = quiz("a", ["x"]);
    const out = forecast([
      { quiz: q, state: { ...NEW_STATE, dueDate: "2026-10-20", status: "learning" } },
      { quiz: q, state: { ...NEW_STATE, dueDate: "2026-10-24", status: "learning" } },
      { quiz: q, state: { ...NEW_STATE, dueDate: "2026-10-26", status: "learning" } },
      { quiz: q, state: NEW_STATE },
      { quiz: q, state: { ...NEW_STATE, dueDate: "2026-11-30", status: "learning" } },
    ], "2026-10-24", 3);
    expect(out.map((f) => f.due)).toEqual([3, 0, 1]);
    expect(out[0].date).toBe("2026-10-24");
  });
});

describe("troubleItems", () => {
  it("ranks recent misses first and caps items per quiz", () => {
    const a = quiz("a", ["p", "q", "r"]);
    const b = quiz("b", ["s"]);
    const log = {
      a: [attempt(a, "2026-10-20T10:00:00Z", ["p", "q"]), attempt(a, "2026-10-21T10:00:00Z", ["p", "r"])],
      b: [attempt(b, "2026-10-21T10:00:00Z", [])],
    };
    const items = troubleItems([a, b], (q) => log[q.id as "a" | "b"], 5, 10);
    expect(items.map((x) => x.stats.answer)).toEqual(["p", "r", "q"]);
    expect(troubleItems([a, b], (q) => log[q.id as "a" | "b"], 5, 10, 1).map((x) => x.stats.answer)).toEqual(["p"]);
  });
  it("ranks repeated misses above a miss in an item's only attempt", () => {
    const a = quiz("a", ["once"]);
    const b = quiz("b", ["often", "lately", "fine"]);
    const log = {
      a: [attempt(a, "2026-10-21T10:00:00Z", ["once"])],
      b: [
        attempt(b, "2026-10-18T10:00:00Z", ["often"]),
        attempt(b, "2026-10-19T10:00:00Z", ["often"]),
        attempt(b, "2026-10-20T10:00:00Z", ["often", "lately"]),
        attempt(b, "2026-10-21T10:00:00Z", ["lately"]),
      ],
    };
    const items = troubleItems([a, b], (q) => log[q.id as "a" | "b"], 5, 10);
    expect(items.map((x) => x.stats.answer)).toEqual(["lately", "often", "once"]);
  });
});
