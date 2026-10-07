import { describe, expect, it } from "vitest";
import { parseQuiz, parseTime, QuizFormatError } from "./format";

describe("parseQuiz", () => {
  it("parses a list-mode quiz with aliases and comments", () => {
    const q = parseQuiz(`title: T
mode: list
time: 1:30
pass: 90
---
# a comment
Alpha
Beta | B | Bee   # trailing comment

Gamma|G
`);
    expect(q.title).toBe("T");
    expect(q.mode).toBe("list");
    expect(q.timeSeconds).toBe(90);
    expect(q.passPercent).toBe(90);
    expect(q.items.map((i) => i.canonical)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(q.items[1].aliases).toEqual(["B", "Bee"]);
    expect(q.items[0].prompt).toBeUndefined();
  });

  it("parses prompt mode with text and image prompts", () => {
    const q = parseQuiz(`mode: prompt
---
Capital of France :: Paris
![Flag of Japan](flags/jp.svg) :: Japan | Nippon
`);
    expect(q.items[0].prompt).toEqual({ text: "Capital of France" });
    expect(q.items[1].prompt).toEqual({ text: "Flag of Japan", image: "flags/jp.svg" });
    expect(q.items[1].aliases).toEqual(["Nippon"]);
  });

  it("defaults: list mode, pass 100, title from path", () => {
    const q = parseQuiz(`---\nX\n`, "quizzes/x.txt", "quizzes");
    expect(q.mode).toBe("list");
    expect(q.dir).toBe("quizzes");
    expect(q.passPercent).toBe(100);
    expect(q.title).toBe("quizzes/x.txt");
  });

  it("rejects prompt-mode lines without ::", () => {
    expect(() => parseQuiz(`mode: prompt\n---\nno separator\n`)).toThrow(QuizFormatError);
  });

  it("rejects an empty quiz", () => {
    expect(() => parseQuiz(`title: empty\n---\n`)).toThrow(/no items/);
  });
});

describe("parseTime", () => {
  it("accepts mm:ss and seconds", () => {
    expect(parseTime("8:00")).toBe(480);
    expect(parseTime("0:05")).toBe(5);
    expect(parseTime("75")).toBe(75);
  });
  it("rejects garbage", () => {
    expect(() => parseTime("eight")).toThrow();
  });
});
