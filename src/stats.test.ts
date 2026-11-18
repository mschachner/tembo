import { describe, expect, it } from "vitest";
import type { Attempt } from "./attempt";
import type { AttemptV1 } from "./log";
import type { Quiz } from "./quiz/format";
import { itemHistory } from "./insights";
import { itemStats, median, trouble } from "./stats";

const quiz: Quiz = {
  path: "p", dir: "d", id: "q", title: "q", mode: "prompt", kind: "normal", retired: false, tags: [], series: "", chunk: "", level: "standard",
  passPercent: 100, imageHeight: 72, columns: [], promptLabel: "", answerLabel: "",
  items: [{ canonical: "A", aliases: [], data: [] }, { canonical: "B", aliases: [], data: [] }],
};

const v2: Attempt = {
  version: 2, quiz: "p", quizId: "q", title: "q", mode: "prompt", kind: "normal",
  startedAt: "2026-10-07T20:00:00Z", endedAt: "2026-10-07T20:01:00Z", durationSeconds: 60,
  total: 2, score: 1, cleared: false, found: ["A"], missed: ["B"], rejected: 0,
  items: [
    { answer: "A", found: true, focusedMs: 0, acceptedMs: 4000, typedChars: 1, wrong: 0 }, // 3.8s latency → slow
    { answer: "B", found: false, wrong: 0 },
  ],
};
const v1: AttemptV1 = {
  version: 1, quiz: "p", title: "q", mode: "prompt", startedAt: "2026-10-06T20:00:00Z",
  endedAt: "2026-10-06T20:01:00Z", durationSeconds: 60, timeLimitSeconds: 0, total: 2, score: 2,
  cleared: true, found: ["A", "B"], missed: [],
};

describe("itemStats", () => {
  it("accumulates buckets across record versions", () => {
    const [a, b] = itemStats(quiz, [v1, v2], 5);
    expect(a).toMatchObject({ seen: 2, untimed: 1, slow: 1, missed: 0, last: "slow" });
    expect(b).toMatchObject({ seen: 2, untimed: 1, missed: 1, last: "missed" });
    expect(trouble(b)).toBe(1);
    expect(trouble(a)).toBe(0.5);
  });
});

describe("an answer asked for twice", () => {
  const twice: Quiz = { ...quiz, items: ["Cleveland", "Harrison", "Cleveland"].map((canonical) => ({ canonical, aliases: [], data: [] })) };
  const attempt: Attempt = {
    ...v2, total: 3, found: ["Cleveland"], missed: ["Harrison", "Cleveland"],
    items: [
      { answer: "Cleveland", found: true, focusedMs: 0, acceptedMs: 1000, typedChars: 9, wrong: 0 },   // instant
      { answer: "Harrison", found: false, wrong: 0 },
      { answer: "Cleveland", found: false, wrong: 1 },
    ],
  };
  it("keeps each occurrence's own history", () => {
    const [first, , second] = itemStats(twice, [attempt, attempt], 5);
    expect(first).toMatchObject({ seen: 2, instant: 2, missed: 0, last: "instant" });
    expect(second).toMatchObject({ seen: 2, instant: 0, missed: 2, last: "missed" });
    expect(itemHistory([attempt], 5, twice.items.map((it) => it.canonical))).toEqual([["instant"], ["missed"], ["missed"]]);
  });
});

describe("median", () => {
  it("handles odd, even and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});
