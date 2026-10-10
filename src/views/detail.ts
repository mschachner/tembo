// The quiz, attempt and item screens: a head pane and table panes filling
// the window, driven from the keyboard like the home screen.
import { app, attemptsOf, playable, stateOf } from "../app";
import { formatClock, h } from "../dom";
import { gradeOf, itemRecord, playOrder } from "../grade";
import type { AnyAttempt } from "../log";
import { nav } from "../nav";
import { BACK, mountPanes, tablePane, type KeyAction, type Pane, type Row } from "../panes";
import type { Quiz } from "../quiz/format";
import { localDate } from "../schedule";
import { lastTab, renderScreen } from "../shell";
import { median } from "../stats";
import { fmtDate, fmtNum, fmtSecs, promptNode } from "./common";
import { detailPanes } from "./panes";
import { rich } from "../rich";

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

export function showQuiz(quiz: Quiz): void {
  const back = () => nav.home(lastTab());
  const d = detailPanes(quiz, () => showQuiz(quiz), localDate(new Date()), true);
  const canPlay = playable(quiz, stateOf(quiz));
  mountScreen(`quiz:${quiz.id}`, d.head, d.grid, d.panes, () => [
    ...(canPlay ? [{ keys: ["p"], hint: "p", label: "Play", run: () => nav.play(quiz) }] : []),
    BACK(back, "Home"),
  ]);
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

  const answers = playOrder(attempt).map((answer) => ({ answer, r: itemRecord(attempt, answer, app.cps) }));
  const items = tablePane({
    id: "answers", title: "Answers", entries: answers, key: (x) => x.answer,
    cols: "4ch minmax(12ch, 32ch) 8ch 6ch 6ch 8ch 6ch minmax(6ch, 1fr)",
    head: ["#", "answer", "result", "at", "time", "latency", "typed", "wrong"],
    rowClass: (x) => x.r?.result ?? "",
    cells: ({ answer, r }, i) => r
      ? [String(i + 1), rich(answer), r.result, r.acceptedMs === null ? "" : formatClock(r.acceptedMs / 1000), fmtSecs(r.seconds), fmtSecs(r.latency), fmtNum(r.typedChars), fmtNum(r.wrong)]
      : [String(i + 1), rich(answer)],
    activate: ({ answer, r }) => r ? () => nav.item(quiz, answer, () => showAttempt(quiz, attempt, back)) : undefined,
  });
  const grid = h("div", { class: "detail-grid" }, items.el);
  mountScreen(`attempt:${attempt.endedAt}`, head, grid, [items], () => [
    { keys: ["q"], hint: "q", label: "Quiz", run: () => nav.quiz(quiz) },
    BACK(back),
  ]);
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
    h("div", { class: "detail-title" }, rich(answer)),
    h("div", { class: "muted small" }, quiz.title),
    item?.aliases.length ? h("div", { class: "muted small" }, `also: ${item.aliases.join(", ")}`) : null,
    item?.prompt ? h("div", { class: "item-prompt" }, ...promptNode(quiz, item)) : null,
    h("div", { class: "muted small" }, facts));

  const seen = tablePane({
    id: "seen", title: "Attempts", entries: records, key: (x) => x.a.endedAt,
    cols: "17ch 8ch 6ch 8ch 6ch minmax(6ch, 1fr)", head: ["when", "result", "time", "latency", "typed", "wrong"],
    rowClass: (x) => x.r.result,
    cells: ({ a, r }) => [fmtDate(a.endedAt), r.result, fmtSecs(r.seconds), fmtSecs(r.latency), fmtNum(r.typedChars), fmtNum(r.wrong)],
    activate: ({ a }) => () => nav.attempt(quiz, a, () => showItem(quiz, answer, back)),
  });
  const grid = h("div", { class: "detail-grid" }, seen.el);
  mountScreen(`item:${quiz.id}:${answer}`, head, grid, [seen], () => [
    { keys: ["q"], hint: "q", label: "Quiz", run: () => nav.quiz(quiz) },
    BACK(back),
  ]);
}
