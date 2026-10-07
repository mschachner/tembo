import { describe, expect, it } from "vitest";
import { belongsTo, legacyId, parseLog } from "./log";
import type { Attempt } from "./attempt";

describe("legacyId", () => {
  it("recovers the folder name or file stem", () => {
    expect(legacyId("/a/b/quizapp/src-tauri/../quizzes/countries-of-africa/quiz.txt")).toBe("countries-of-africa");
    expect(legacyId("/a/b/quizzes/countries-of-africa.txt")).toBe("countries-of-africa");
  });
});

describe("belongsTo", () => {
  const quiz = { id: "flags", path: "/x/quizzes/flags/quiz.txt" };
  it("prefers quizId, falls back to path or legacy id", () => {
    const base = { version: 2, quiz: "/old/quizzes/flags/quiz.txt" } as unknown as Attempt;
    expect(belongsTo({ ...base, quizId: "flags" }, quiz)).toBe(true);
    expect(belongsTo({ ...base, quizId: "other" }, quiz)).toBe(false);
    expect(belongsTo(base, quiz)).toBe(true);
  });
});

describe("parseLog", () => {
  it("skips bad lines and sorts by start time", () => {
    const log = parseLog(`{"startedAt":"2026-10-02T00:00:00Z","quiz":"b"}\nnot json\n{"startedAt":"2026-10-01T00:00:00Z","quiz":"a"}\n`);
    expect(log.map((a) => a.quiz)).toEqual(["a", "b"]);
  });
});
