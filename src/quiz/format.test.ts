import { describe, expect, it } from "vitest";
import { assembleSeries, defaultTitle, parseQuiz, parseSeries, previousChunk, previousLevel, QuizFormatError, topicOf, type Quiz } from "./format";

describe("Wikipedia links", () => {
  it("links each side through its header, filling in the item's text", () => {
    const q = parseQuiz(`mode: prompt
wiki-answer: {answer}, {prompt}
---
Arizona :: Phoenix
Minnesota :: Saint Paul | St. Paul
`);
    expect(q.items.map((i) => i.wiki)).toEqual(["Phoenix, Arizona", "Saint Paul, Minnesota"]);
    expect(q.items[0].prompt).toEqual({ text: "Arizona" });

    const flags = parseQuiz(`mode: prompt\nwiki-prompt: Flag of {answer}\n---\n![Peru](flags/pe.svg){height=90} :: Peru\n`);
    expect(flags.items[0].prompt).toEqual({ text: "Peru", image: "flags/pe.svg", imageHeight: 90, wiki: "Flag of Peru" });
    expect(flags.items[0].wiki).toBeUndefined();

    const list = parseQuiz(`mode: list\nwiki-answer: {answer}\n---\nColossus of Rhodes | Colossus\n`);
    expect(list.items[0].wiki).toBe("Colossus of Rhodes");
  });

  it("has no links without a header", () => {
    const q = parseQuiz(`mode: prompt\n---\nHistory :: Clio\n`);
    expect(q.items[0].wiki).toBeUndefined();
    expect(q.items[0].prompt).toEqual({ text: "History" });
  });

  it("takes the articles a series names, for prompts and answers alike", () => {
    const m = parseSeries(`title: Greek gods and their Roman names
levels: standard, flipped
---
# where the name alone is not the article
Mars => Mars (mythology)
Pan => Pan (god)    # the Greek one
Clair de lune => Suite bergamasque#3. Clair de lune
Nobody =>
`, "/h/gods/series.txt", "/h/gods");
    expect(m.levels).toEqual(["standard", "flipped"]);
    expect([...m.articles]).toEqual([
      ["Mars", "Mars (mythology)"], ["Pan", "Pan (god)"], ["Clair de lune", "Suite bergamasque#3. Clair de lune"], ["Nobody", ""],
    ]);

    const both = "wiki-prompt: {prompt}\nwiki-answer: {answer}\n";
    const standard = parseQuiz(`mode: prompt\n${both}---\nAres :: Mars | Mavors\nPan :: Faunus\nNobody :: Nobody\n`, "/h/gods/standard/quiz.txt", "/h/gods/standard", m);
    expect(standard.items.map((i) => [i.prompt?.wiki, i.wiki])).toEqual([["Ares", "Mars (mythology)"], ["Pan (god)", "Faunus"], [undefined, undefined]]);
    expect(standard.items[0].aliases).toEqual(["Mavors"]);
    const flipped = parseQuiz(`level: flipped\nmode: prompt\n${both}---\nMars :: Ares\n`, "/h/gods/flipped/quiz.txt", "/h/gods/flipped", m);
    expect(flipped.items[0]).toMatchObject({ wiki: "Ares", prompt: { text: "Mars", wiki: "Mars (mythology)" } });

    // The series' articles don't link a side the quiz has no header for.
    const answersOnly = parseQuiz(`mode: prompt\nwiki-answer: {answer}\n---\nPan :: Faunus\n`, "/h/gods/standard/quiz.txt", "/h/gods/standard", m);
    expect(answersOnly.items[0].prompt).toEqual({ text: "Pan" });
  });

  it("links diagram nodes", () => {
    const m = parseSeries("title: Chart\n---\nhuge => Huge cardinal\n", "/h/c/series.txt", "/h/c");
    const q = parseQuiz(`mode: prompt\nlayout: diagram\nwiki-answer: {answer}\n---\ngiven @0,0 :: start\n@1,0 :: huge | huge cardinal\nstart -> huge\n`, "/h/c/standard/quiz.txt", "/h/c/standard", m);
    expect(q.items[0]).toMatchObject({ canonical: "huge", aliases: ["huge cardinal"], wiki: "Huge cardinal" });
  });

  it("rejects unknown placeholders and malformed article lines", () => {
    expect(() => parseQuiz(`mode: list\nwiki-answer: {name}\n---\nX\n`)).toThrow(/unknown placeholder \{name\}/);
    expect(() => parseSeries("title: T\n---\nno arrow here\n")).toThrow(/expected `text => Wikipedia article`/);
    expect(() => parseSeries("title: T\n---\nA => B\nA => C\n")).toThrow(/given an article twice/);
    expect(parseSeries("title: T\n").articles.size).toBe(0);
  });
});

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

  it("parses per-item data columns", () => {
    const q = parseQuiz(`mode: prompt
columns: Years, Party
answer-label: President
---
1st :: George Washington | Washington ;; 1789–1797 ;; Unaffiliated
9th :: William Henry Harrison ;; 1841
`);
    expect(q.columns).toEqual(["Years", "Party"]);
    expect(q.answerLabel).toBe("President");
    expect(q.promptLabel).toBe("");
    expect(q.items[0].aliases).toEqual(["Washington"]);
    expect(q.items[0].data).toEqual(["1789–1797", "Unaffiliated"]);
    expect(q.items[1].data).toEqual(["1841", ""]);
    expect(parseQuiz(`columns: Year\n---\nHamlet ;; 1601\n`).items[0]).toMatchObject({ canonical: "Hamlet", data: ["1601"] });
    expect(parseQuiz(`---\nX\n`).items[0].data).toEqual([]);
  });

  it("rejects more data values than columns", () => {
    expect(() => parseQuiz(`columns: Year\n---\nX ;; 1 ;; 2\n`)).toThrow(/2 data values but 1 column/);
  });

  it("rejects an empty quiz", () => {
    expect(() => parseQuiz(`title: empty\n---\n`)).toThrow(/no items/);
  });

  it("keeps # inside answers but strips comments after a space", () => {
    const q = parseQuiz(`mode: prompt
---
# comment
Key :: F# | F sharp   # a comment
`);
    expect(q.items[0].canonical).toBe("F#");
    expect(q.items[0].aliases).toEqual(["F sharp"]);
  });

  it("parses a diagram: blanks, anchors, labels, polar positions, edges", () => {
    const q = parseQuiz(`title: D
mode: prompt
layout: diagram
diagram-scale: 90
columns: Sharps
---
given @0,0 :: ℵ₁
@1,0 :: add(𝒩) | add N
@1,2 lower :: cov(𝒩)
@2<90 :: G ;; 1
ℵ₁ -> add(𝒩) -> cov(𝒩)
G -- ℵ₁
`);
    const d = q.diagram!;
    expect(d.scale).toBe(90);
    expect(q.items.map((i) => i.canonical)).toEqual(["add(𝒩)", "cov(𝒩)", "G"]);
    expect(q.items[0].prompt).toBeUndefined();
    expect(q.items[1].prompt).toEqual({ text: "lower" });
    expect(q.items[2].data).toEqual(["1"]);
    expect(d.nodes).toEqual([
      { x: 0, y: 0, given: "ℵ₁" },
      { x: 1, y: 0, item: 0 },
      { x: 1, y: 2, item: 1 },
      { x: 2, y: 0, item: 2 },
    ]);
    expect(d.edges).toEqual([
      { from: 0, to: 1, arrow: true },
      { from: 1, to: 2, arrow: true },
      { from: 3, to: 0, arrow: false },
    ]);
  });

  it("works in list mode, and quizzes without a layout have no diagram", () => {
    const q = parseQuiz(`layout: diagram
---
@0,0 :: A
@0,1 :: B
A -> B
`);
    expect(q.mode).toBe("list");
    expect(q.items).toHaveLength(2);
    expect(parseQuiz("---\nA\n").diagram).toBeUndefined();
  });

  it("rejects bad diagrams", () => {
    const bad = (body: string) => () => parseQuiz(`layout: diagram\n---\n${body}`);
    expect(bad("@0,0 :: A\nA -> Z\n")).toThrow(/no node named "Z"/);
    expect(bad("@0,0 :: A\n@1,0 :: A\n")).toThrow(/two nodes named/);
    expect(bad("@x :: A\n")).toThrow(/expected a position/);
    expect(bad("@0,0 A\n")).toThrow(/needs `@position :: answer`/);
    expect(bad("@0,0 :: A\nwhat\n")).toThrow(/expected a node/);
    expect(() => parseQuiz("layout: grid\n---\nA\n")).toThrow(/unknown layout/);
  });
});

describe("tags", () => {
  it("reads tags lower-cased with the first as the topic", () => {
    const q = parseQuiz("title: T\ntags: Geography, Capitals\n---\nParis\n");
    expect(q.tags).toEqual(["geography", "capitals"]);
    expect(topicOf(q)).toBe("geography");
  });
});

describe("series", () => {
  const meta = parseSeries("title: US state capitals\ntags: Geography, capitals\nlevels: standard, flipped\nchunks: A–M, N–W\n", "/h/caps/series.txt", "/h/caps");
  const cell = (folder: string, header: string, m = meta): Quiz => parseQuiz(`${header}\n---\nAlabama :: Montgomery\n`, `/h/caps/${folder}/quiz.txt`, `/h/caps/${folder}`, m);

  it("reads series.txt", () => {
    expect(meta.id).toBe("caps");
    expect(meta.title).toBe("US state capitals");
    expect(meta.tags).toEqual(["geography", "capitals"]);
    expect(meta.levels).toEqual(["standard", "flipped"]);
    expect(meta.chunks).toEqual(["A–M", "N–W"]);
    const bare = parseSeries("title: Greek alphabet\n", "/h/greek/series.txt", "/h/greek");
    expect(bare.levels).toEqual(["standard"]);
    expect(bare.chunks).toBeNull();
  });

  it("places a quiz in its series", () => {
    const q = cell("a-m-flipped", "chunk: A–M\nlevel: flipped\nmode: prompt");
    expect(q.id).toBe("caps/a-m-flipped");
    expect(q.series).toBe("caps");
    expect(q.chunk).toBe("A–M");
    expect(q.level).toBe("flipped");
    expect(q.tags).toEqual(["geography", "capitals"]);
    expect(q.title).toBe("");
    expect(cell("a-m", "chunk: A–M\nmode: prompt").level).toBe("standard");
    expect(() => cell("x", "chunk: A–M\nlevel: hard\nmode: prompt")).toThrow(/level "hard"/);
  });

  it("assembles the grid and titles the quizzes", () => {
    const am = cell("a-m", "chunk: A–M\nmode: prompt");
    const amr = cell("a-m-flipped", "chunk: A–M\nlevel: flipped\nmode: prompt");
    const nw = cell("n-w", "chunk: N–W\nmode: prompt");
    const s = assembleSeries(meta, [am, amr, nw]);
    expect(am.title).toBe("US state capitals, A–M");
    expect(amr.title).toBe("US state capitals, A–M, flipped");
    expect(nw.title).toBe("US state capitals, N–W");
    expect(previousLevel(s, amr)).toBe(am);
    expect(previousLevel(s, am)).toBeNull();
    expect(previousLevel(s, nw)).toBeNull();
    expect(previousChunk(s, nw)).toBe(am);
    expect(previousChunk(s, am)).toBeNull();
    expect(previousChunk(s, amr)).toBeNull();
    expect(() => assembleSeries(meta, [am, amr])).toThrow(/chunk "N–W" has no quiz at the first level/);
    expect(() => assembleSeries(meta, [am, nw, cell("dup", "chunk: A–M\nmode: prompt")])).toThrow(/same chunk and level/);
    expect(() => assembleSeries(meta, [am, nw, cell("x", "chunk: Z\nmode: prompt")])).toThrow(/chunk "Z" is not one/);
  });

  it("derives chunks when series.txt leaves them out, in quiz order", () => {
    const m = parseSeries("title: Element symbols\nlevels: standard, flipped\n", "/h/el/series.txt", "/h/el");
    const a = cell("1-20", "chunk: 1–20\nmode: prompt", m), b = cell("21-40", "chunk: 21–40\nmode: prompt", m);
    expect(assembleSeries(m, [a, b]).chunks).toEqual(["1–20", "21–40"]);
    const one = cell("standard", "mode: prompt", parseSeries("title: Greek alphabet\n", "/h/g/series.txt", "/h/g"));
    const s = assembleSeries(parseSeries("title: Greek alphabet\n", "/h/g/series.txt", "/h/g"), [one]);
    expect(s.chunks).toEqual([""]);
    expect(one.title).toBe("Greek alphabet");
    expect(defaultTitle(s, { chunk: "", level: "flipped" })).toBe("Greek alphabet, flipped");
    expect(() => assembleSeries(m, [a, cell("x", "mode: prompt", m)])).toThrow(/no `chunk:` header/);
  });

  it("keeps a quiz's own title and a series-wide retirement", () => {
    const m = parseSeries("title: Greek gods\nlevels: standard, flipped\nretired: true\n", "/h/g/series.txt", "/h/g");
    const q = cell("flipped", "level: flipped\ntitle: Roman gods and their Greek names\nmode: prompt", m);
    expect(q.title).toBe("Roman gods and their Greek names");
    expect(q.retired).toBe(true);
  });
});
