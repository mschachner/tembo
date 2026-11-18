import { describe, expect, it } from "vitest";
import type { Attempt, ItemResult } from "./attempt";
import { bucketOf, gradeOf, itemLatency, itemRecord, typingSpeed } from "./grade";

function promptAttempt(items: ItemResult[], kind: Attempt["kind"] = "normal"): Attempt {
  const found = items.filter((i) => i.found).map((i) => i.answer);
  return {
    version: 2, quiz: "q", title: "q", mode: "prompt", kind, startedAt: "2026-10-07T20:00:00Z",
    endedAt: "2026-10-07T20:01:00Z", durationSeconds: 60, total: items.length, score: found.length,
    cleared: found.length === items.length, found, missed: items.filter((i) => !i.found).map((i) => i.answer),
    rejected: 0, items,
  };
}

describe("itemRecord", () => {
  it("carries the wrong guesses, where the attempt kept them", () => {
    const a = promptAttempt([
      { answer: "Thalia", found: false, wrong: 1, locked: true, guesses: ["Melpomene"] },
      { answer: "Clio", found: true, focusedMs: 0, acceptedMs: 900, typedChars: 4, wrong: 0 },
      { answer: "Erato", found: false, wrong: 1 },   // a record from before guesses were kept
    ]);
    expect(itemRecord(a, "Thalia", 5)).toMatchObject({ result: "missed", wrong: 1, guesses: ["Melpomene"] });
    expect(itemRecord(a, "Clio", 5)?.guesses).toEqual([]);
    expect(itemRecord(a, "Erato", 5)).toMatchObject({ wrong: 1, guesses: [] });
  });
});

describe("latency and buckets", () => {
  const a = promptAttempt([
    { answer: "Paris", found: true, focusedMs: 1000, acceptedMs: 2000, typedChars: 5, wrong: 0 },   // 1.0s - 1.0s typing = 0
    { answer: "Quito", found: true, focusedMs: 3000, acceptedMs: 8000, typedChars: 5, wrong: 1 },   // 5.0s - 1.0s = 4.0
    { answer: "Lima", found: false, wrong: 0 },
  ]);
  it("subtracts typing time at the given speed", () => {
    expect(itemLatency(a, 0, 5)).toBe(0);
    expect(itemLatency(a, 1, 5)).toBe(4);
    expect(itemLatency(a, 2, 5)).toBeNull();
  });
  it("buckets and grades", () => {
    expect(bucketOf(a, 0, 5)).toBe("instant");
    expect(bucketOf(a, 1, 5)).toBe("slow");
    expect(bucketOf(a, 2, 5)).toBe("missed");
    expect(gradeOf(a, 5)).toBe(0.5); // (1 + 0.5 + 0) / 3
  });
});

describe("typingSpeed", () => {
  it("is the median per-item rate over calibration attempts", () => {
    const c = promptAttempt([
      { answer: "ab", found: true, focusedMs: 0, acceptedMs: 1000, typedChars: 2, wrong: 0 },     // 2 cps
      { answer: "abcdef", found: true, focusedMs: 0, acceptedMs: 1000, typedChars: 6, wrong: 0 }, // 6 cps
      { answer: "abcd", found: true, focusedMs: 0, acceptedMs: 1000, typedChars: 4, wrong: 0 },   // 4 cps
    ], "calibration");
    expect(typingSpeed([c])).toBe(4);
    expect(typingSpeed([promptAttempt([])])).toBeNull();
  });
});
