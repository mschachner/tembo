import { describe, expect, it } from "vitest";
import { parseQuiz, QuizFormatError } from "./format";

describe("parseQuiz", () => {
  it("parses a list-mode quiz with aliases and comments", () => {
    const q = parseQuiz(`title: T
mode: list
pass: 90
---
# a comment
Alpha
Beta | B | Bee   # trailing comment

Gamma|G
`);
    expect(q.title).toBe("T");
    expect(q.mode).toBe("list");
    expect(q.kind).toBe("normal");
    expect(q.retired).toBe(false);
    expect(q.passPercent).toBe(90);
    expect(q.items.map((i) => i.canonical)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(q.items[1].aliases).toEqual(["B", "Bee"]);
    expect(q.items[0].prompt).toBeUndefined();
  });

  it("parses prompt mode with text and image prompts", () => {
    const q = parseQuiz(`mode: prompt
image-height: 100
---
Capital of France :: Paris
![Flag of Japan](flags/jp.svg) :: Japan | Nippon
![Tall thing](tall.png){height=240} :: Tall
`);
    expect(q.imageHeight).toBe(100);
    expect(q.items[0].prompt).toEqual({ text: "Capital of France" });
    expect(q.items[1].prompt).toEqual({ text: "Flag of Japan", image: "flags/jp.svg" });
    expect(q.items[1].aliases).toEqual(["Nippon"]);
    expect(q.items[2].prompt).toEqual({ text: "Tall thing", image: "tall.png", imageHeight: 240 });
  });

  it("defaults: list mode, pass 100, title from path", () => {
    const q = parseQuiz(`---\nX\n`, "quizzes/x/quiz.txt", "quizzes/x");
    expect(q.mode).toBe("list");
    expect(q.dir).toBe("quizzes/x");
    expect(q.id).toBe("x");
    expect(parseQuiz(`id: custom\n---\nX\n`, "quizzes/x/quiz.txt", "quizzes/x").id).toBe("custom");
    expect(q.passPercent).toBe(100);
    expect(q.imageHeight).toBe(72);
    expect(q.title).toBe("quizzes/x/quiz.txt");
  });

  it("accepts kind: calibration and rejects other kinds", () => {
    expect(parseQuiz(`kind: calibration\nmode: prompt\n---\nabc :: abc\n`).kind).toBe("calibration");
    expect(() => parseQuiz(`kind: weird\n---\nX\n`)).toThrow(/unknown kind/);
    expect(parseQuiz(`retired: true\n---\nX\n`).retired).toBe(true);
  });

  it("rejects prompt-mode lines without ::", () => {
    expect(() => parseQuiz(`mode: prompt\n---\nno separator\n`)).toThrow(QuizFormatError);
  });

  it("rejects an empty quiz", () => {
    expect(() => parseQuiz(`title: empty\n---\n`)).toThrow(/no items/);
  });
});
