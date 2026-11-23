// The quiz, attempt and item screens: a head pane and table panes filling
// the window, driven from the keyboard like the home screen.
import { app, attemptsOf, playable, stateOf } from "../app";
import { formatClock, h } from "../dom";
import { gradeOf, itemRecord, itemRecordAt, type ItemRecord } from "../grade";
import type { AnyAttempt } from "../log";
import { nav } from "../nav";
import { BACK, mountPanes, tablePane, type KeyAction, type Pane, type Row } from "../panes";
import type { Item, Quiz } from "../quiz/format";
import { localDate } from "../schedule";
import { lastTab, renderScreen } from "../shell";
import { median, occurrenceKeys } from "../stats";
import { answerNode, fmtDate, fmtNum, fmtSecs, openWiki, promptNode } from "./common";
import { detailPanes, keyItem } from "./panes";
import { rich } from "../rich";

// The wrong column: how many, then what was typed (newer records keep it).
const fmtWrong = (r: { wrong: number | null; guesses: string[] }) =>
  r.guesses.length ? `${r.wrong} · ${r.guesses.join(", ")}` : fmtNum(r.wrong);

function mountScreen(scope: string, head: HTMLElement, grid: HTMLElement, panes: Pane[], extra: (row: Row | null) => KeyAction[]): void {
  const legend = h("nav", { class: "keys" });
  const root = h("div", { class: "detail screen-detail" }, head, grid);
  renderScreen(h("div", { class: "panes-wrap" }, legend, root), { panes: true });
  const actions = (_p: Pane | null, row: Row | null): KeyAction[] => [
    ...(row?.activate ? [{ keys: ["Enter"], hint: "enter", label: "Open", run: row.activate }] : []),
    ...extra(row),
  ];
  mountPanes({ scope, root, legend, panes, actions });
}

// w opens the answer's Wikipedia article, W the prompt's; with only one of
// them, w opens it.
function wikiActions(quiz: Quiz, item: Item | undefined): KeyAction[] {
  const side = (label: string, fallback: string) => (label || fallback).toLowerCase();
  const articles = [
    item?.wiki ? { title: item.wiki, side: side(quiz.answerLabel, "answer") } : null,
    item?.prompt?.wiki ? { title: item.prompt.wiki, side: side(quiz.promptLabel, "prompt") } : null,
  ].filter((x): x is { title: string; side: string } => x !== null);
  return articles.map((a, k) => ({
    keys: [k === 0 ? "w" : "W"], hint: k === 0 ? "w" : "W",
    label: articles.length > 1 ? `Wikipedia (${a.side})` : "Wikipedia", run: () => openWiki(a.title),
  }));
}

// The answer key's order on the quiz screen, kept while the app is open.
let worstFirst = false;

export function showQuiz(quiz: Quiz): void {
  const back = () => nav.home(lastTab());
  const d = detailPanes(quiz, () => showQuiz(quiz), localDate(new Date()), true, worstFirst);
  const canPlay = playable(quiz, stateOf(quiz));
  mountScreen(`quiz:${quiz.id}`, d.head, d.grid, d.panes, (row) => [
    ...(canPlay ? [{ keys: ["p"], hint: "p", label: "Play", run: () => nav.play(quiz) }] : []),
    ...(d.key === "shown" ? wikiActions(quiz, keyItem(quiz, row?.id)) : []),
    ...(d.key ? [{ keys: ["s"], hint: "s", label: worstFirst ? "Quiz order" : "Worst first", run: () => { worstFirst = !worstFirst; showQuiz(quiz); } }] : []),
    BACK(back, "Home"),
  ]);
}

// An attempt's items in the order they were shown (older records: found,
// then missed), each with the quiz's item it answers, for its clue. A quiz
// can ask for one answer twice: the k-th record with an answer goes with
// the k-th item with it. The item is missing when it has since left the quiz.
function attemptRows(quiz: Quiz, attempt: AnyAttempt): { answer: string; item: Item | undefined; r: ItemRecord | null }[] {
  const keys = occurrenceKeys(quiz.items.map((it) => it.canonical));
  const itemOf = (key: string): Item | undefined => quiz.items[keys.indexOf(key)];
  if (attempt.version === 2) {
    const own = occurrenceKeys(attempt.items.map((r) => r.answer));
    const order = attempt.order ?? attempt.items.map((_, i) => i);
    return order.map((i) => ({ answer: attempt.items[i].answer, item: itemOf(own[i]), r: itemRecordAt(attempt, i, app.cps) }));
  }
  const answers = [...attempt.found, ...attempt.missed];
  const own = [...occurrenceKeys(attempt.found), ...occurrenceKeys(attempt.missed)];
  return answers.map((answer, k) => ({ answer, item: itemOf(own[k]), r: itemRecord(attempt, answer, app.cps) }));
}

export function showAttempt(quiz: Quiz, attempt: AnyAttempt, back: () => void): void {
  const facts = [
    fmtDate(attempt.endedAt),
    `${attempt.score} / ${attempt.total}`,
    formatClock(attempt.durationSeconds),
    attempt.cleared ? "cleared" : "not cleared",
    `grade ${gradeOf(attempt, app.cps).toFixed(2)}`,
    attempt.version === 2 ? `${attempt.rejected} rejected` : "no timing (older record)",
  ].join(" · ");
  const head = h("section", { class: "pane detail-head" },
    h("div", { class: "detail-title" }, attempt.title),
    h("div", { class: "muted small" }, facts));

  // Every item as it was asked: its clue (the prompt, then any data
  // columns), then the answer and how it went.
  const rows = attemptRows(quiz, attempt);
  const withPrompt = rows.some((x) => x.item?.prompt);
  const data = quiz.columns;
  const items = tablePane({
    id: "answers", title: "Items", entries: rows, key: (_, i) => String(i), extra: "key", fit: true,
    cols: [
      "max-content",
      ...(withPrompt ? ["fit-content(30%)"] : []),
      ...data.map(() => "fit-content(22%)"),
      "minmax(10ch, 1.4fr)",
      ...Array.from({ length: 5 }, () => "max-content"),
      "minmax(6ch, 1fr)",
    ].join(" "),
    head: [
      "#",
      ...(withPrompt ? [quiz.promptLabel.toLowerCase() || "clue"] : []),
      ...data.map((c) => c.toLowerCase()),
      quiz.answerLabel.toLowerCase() || "answer",
      "result", "at", "time", "latency", "typed", "wrong",
    ],
    rowClass: (x) => x.r?.result ?? "",
    cells: ({ answer, item, r }, i) => [
      String(i + 1),
      ...(withPrompt ? [h("span", { class: "key-clue" }, ...(item?.prompt ? promptNode(quiz, item, true) : []))] : []),
      ...data.map((_, k) => item?.data[k] ?? ""),
      h("span", { class: "key-answer" }, item ? answerNode(item, rich(answer)) : rich(answer)),
      ...(r ? [r.result, r.acceptedMs === null ? "" : formatClock(r.acceptedMs / 1000), fmtSecs(r.seconds), fmtSecs(r.latency), fmtNum(r.typedChars), fmtWrong(r)] : []),
    ],
    activate: ({ answer, r }) => r ? () => nav.item(quiz, answer, () => showAttempt(quiz, attempt, back)) : undefined,
  });
  const grid = h("div", { class: "detail-grid" }, items.el);
  mountScreen(`attempt:${attempt.endedAt}`, head, grid, [items], (row) => [
    ...wikiActions(quiz, rows[Number(row?.id ?? -1)]?.item),
    { keys: ["q"], hint: "q", label: "Quiz", run: () => nav.quiz(quiz) },
    BACK(back),
  ]);
}

function labeled(label: string, ...value: (Node | string)[]): HTMLElement {
  return h("span", { class: "labeled" }, h("span", { class: "muted small" }, label), ...value);
}

export function showItem(quiz: Quiz, answer: string, back: () => void): void {
  const item = quiz.items.find((it) => it.canonical === answer);
  const own = attemptsOf(quiz);
  const records = own
    .map((a) => ({ a, r: itemRecord(a, answer, app.cps) }))
    .filter((x): x is { a: AnyAttempt; r: NonNullable<ReturnType<typeof itemRecord>> } => x.r !== null)
    .reverse();

  const counts = { instant: 0, slow: 0, missed: 0, untimed: 0 };
  const latencies: number[] = [];
  for (const { r } of records) {
    counts[r.result]++;
    if (r.latency !== null) latencies.push(r.latency);
  }
  const med = median(latencies);
  const facts = [
    `${records.length} seen`, `${counts.instant} instant`, `${counts.slow} slow`, `${counts.missed} missed`,
    counts.untimed ? `${counts.untimed} untimed` : null,
    med === null ? null : `median latency ${med.toFixed(1)}s`,
  ].filter(Boolean).join(" · ");

  const head = h("section", { class: "pane detail-head" },
    h("div", { class: "detail-title" }, item ? answerNode(item, rich(answer)) : rich(answer)),
    h("div", { class: "muted small" }, `${(quiz.answerLabel || "answer").toLowerCase()} · ${quiz.title}`),
    item?.aliases.length ? h("div", { class: "muted small" }, `also: ${item.aliases.join(", ")}`) : null,
    // What the answer is asked with: the prompt and any data values, labeled.
    item && (item.prompt || item.data.some((v) => v !== "")) ? h("div", { class: "item-prompt" },
      item.prompt ? labeled((quiz.promptLabel || "clue").toLowerCase(), ...promptNode(quiz, item, true)) : null,
      ...quiz.columns.map((c, k) => item.data[k] ? labeled(c.toLowerCase(), item.data[k]) : null)) : null,
    h("div", { class: "muted small" }, facts));

  const seen = tablePane({
    id: "seen", title: "Attempts", entries: records, key: (x) => x.a.endedAt,
    cols: "17ch 8ch 6ch 8ch 6ch minmax(6ch, 1fr)", head: ["when", "result", "time", "latency", "typed", "wrong"],
    rowClass: (x) => x.r.result,
    cells: ({ a, r }) => [fmtDate(a.endedAt), r.result, fmtSecs(r.seconds), fmtSecs(r.latency), fmtNum(r.typedChars), fmtWrong(r)],
    activate: ({ a }) => () => nav.attempt(quiz, a, () => showItem(quiz, answer, back)),
  });
  const grid = h("div", { class: "detail-grid" }, seen.el);
  mountScreen(`item:${quiz.id}:${answer}`, head, grid, [seen], () => [
    ...wikiActions(quiz, item),
    { keys: ["q"], hint: "q", label: "Quiz", run: () => nav.quiz(quiz) },
    BACK(back),
  ]);
}
