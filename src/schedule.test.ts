import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isDue, multiplier, NEW_STATE, replay, step } from "./schedule";
import type { AttemptV1 } from "./log";

function attempt(endedAt: string, cleared: boolean): AttemptV1 {
  return {
    version: 1, quiz: "q", title: "q", mode: "list", startedAt: endedAt, endedAt,
    durationSeconds: 60, timeLimitSeconds: 0, total: 10, score: cleared ? 10 : 7, cleared, found: [], missed: [],
  };
}

describe("multiplier", () => {
  it("runs from 1 to 3", () => {
    expect(multiplier(0)).toBe(1);
    expect(multiplier(0.5)).toBe(2);
    expect(multiplier(1)).toBe(3);
    expect(multiplier(7)).toBe(3);
  });
});

describe("dates", () => {
  it("adds days across month ends and measures gaps", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(daysBetween("2026-01-31", "2026-02-03")).toBe(3);
  });
});

describe("step / replay", () => {
  it("first clear is due tomorrow; later clears multiply; failure resets", () => {
    const s1 = step(NEW_STATE, attempt("2026-10-07T20:00:00", true), 1);
    expect(s1.intervalDays).toBe(1);
    expect(s1.dueDate).toBe("2026-10-08");
    expect(s1.status).toBe("learning");

    const s2 = step(s1, attempt("2026-10-08T20:00:00", true), 1);
    expect(s2.intervalDays).toBe(3);
    expect(s2.dueDate).toBe("2026-10-11");

    const s3 = step(s2, attempt("2026-10-11T20:00:00", true), 0.5);
    expect(s3.intervalDays).toBe(6);

    const s4 = step(s3, attempt("2026-10-17T20:00:00", false), 0);
    expect(s4.intervalDays).toBe(1);
    expect(s4.dueDate).toBe("2026-10-18");
    expect(s4.attempts).toBe(4);
  });

  it("overdue clears advance from the attempt date, not the due date", () => {
    const s1 = step(NEW_STATE, attempt("2026-10-07T20:00:00", true), 1);
    const s2 = step(s1, attempt("2026-10-20T20:00:00", true), 1);
    expect(s2.dueDate).toBe("2026-10-23");
  });

  it("reaches proficient and caps at maintenance", () => {
    let s = NEW_STATE;
    for (let i = 0; i < 10; i++) s = step(s, attempt(`2026-10-${String(10 + i).padStart(2, "0")}T20:00:00`, true), 1);
    expect(s.status).toBe("proficient");
    expect(s.intervalDays).toBe(90);
  });

  it("replay equals iterated step and new quizzes are due", () => {
    const as = [attempt("2026-10-07T20:00:00", true), attempt("2026-10-08T20:00:00", true)];
    expect(replay(as, () => 1)).toEqual(step(step(NEW_STATE, as[0], 1), as[1], 1));
    expect(isDue(NEW_STATE, "2026-10-07")).toBe(true);
    expect(isDue(replay(as, () => 1), "2026-10-10")).toBe(false);
    expect(isDue(replay(as, () => 1), "2026-10-11")).toBe(true);
  });
});
