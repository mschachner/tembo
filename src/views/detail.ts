import { app, attemptsOf, playable, stateOf } from "../app";
import { formatClock, h } from "../dom";
import { gradeOf, itemRecord, playOrder } from "../grade";
import type { AnyAttempt } from "../log";
import { nav } from "../nav";
import type { Quiz } from "../quiz/format";
import { renderScreen } from "../shell";
import { itemStats, median, trouble } from "../stats";
import { backButton, dueLabel, fmtDate, fmtNum, fmtSecs, promptNode, th } from "./common";

export function showQuiz(quiz: Quiz): void {
  const state = stateOf(quiz);
  const own = attemptsOf(quiz);
  const canPlay = playable(quiz, state);

  const facts = [
    `${quiz.items.length} items`,
    quiz.mode,
    quiz.kind === "calibration" ? "calibration" : quiz.retired ? "retired" : state.status,
    state.intervalDays ? `interval ${state.intervalDays.toFixed(1)}d` : null,
    state.dueDate ? `due ${state.dueDate} (${dueLabel(state)})` : null,
    `${own.length} attempts`,
  ].filter(Boolean).join(" · ");

  const history = own.slice().reverse().map((a) =>
    h(
      "tr",
      { class: "row-link", onclick: () => nav.attempt(quiz, a, () => showQuiz(quiz)) },
      h("td", {}, fmtDate(a.endedAt)),
      h("td", { class: "num" }, `${a.score}/${a.total}`),
      h("td", { class: "num" }, formatClock(a.durationSeconds)),
      h("td", { class: "num" }, gradeOf(a, app.cps).toFixed(2)),
      h("td", {}, a.cleared ? "cleared" : ""),
    ),
  );

  const stats = itemStats(quiz, own, app.cps)
    .map((st) => ({ st, t: trouble(st) }))
    .sort((a, b) => b.t - a.t || a.st.answer.localeCompare(b.st.answer))
    .map(({ st }) => {
      const med = median(st.latencies);
      return h(
        "tr",
        { class: `row-link ${st.last ?? ""}`, onclick: () => nav.item(quiz, st.answer, () => showQuiz(quiz)) },
        h("td", {}, st.answer),
        h("td", { class: "num" }, String(st.seen)),
        h("td", { class: "num" }, String(st.instant)),
        h("td", { class: "num" }, String(st.slow)),
        h("td", { class: "num" }, String(st.missed)),
        h("td", { class: "num" }, med === null ? "" : `${med.toFixed(1)}s`),
        h("td", {}, st.last ?? ""),
      );
    });

  renderScreen(
    h(
      "div",
      {},
      backButton("Home", () => nav.home()),
      h("header", {}, h("h1", {}, quiz.title), h("div", { class: "muted small" }, facts)),
      canPlay ? h("div", { class: "actions" }, h("button", { class: "primary", onclick: () => nav.play(quiz) }, "Play")) : null,
      own.length ? h("section", {}, h("h2", {}, "Items"), h("table", { class: "stats" }, th("answer", "seen", "instant", "slow", "missed", "median latency", "last"), ...stats)) : null,
      own.length ? h("section", {}, h("h2", {}, "Attempts"), h("table", { class: "stats" }, th("when", "score", "time", "grade", ""), ...history)) : null,
    ),
  );
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

  const rows = playOrder(attempt).map((answer, i) => {
    const r = itemRecord(attempt, answer, app.cps);
    if (!r) return h("tr", {}, h("td", {}, answer));
    return h(
      "tr",
      { class: `row-link ${r.result}`, onclick: () => nav.item(quiz, answer, () => showAttempt(quiz, attempt, back)) },
      h("td", { class: "num" }, String(i + 1)),
      h("td", {}, answer),
      h("td", {}, r.result),
      h("td", { class: "num" }, r.acceptedMs === null ? "" : formatClock(r.acceptedMs / 1000)),
      h("td", { class: "num" }, fmtSecs(r.seconds)),
      h("td", { class: "num" }, fmtSecs(r.latency)),
      h("td", { class: "num" }, fmtNum(r.typedChars)),
      h("td", { class: "num" }, fmtNum(r.wrong)),
    );
  });

  renderScreen(
    h(
      "div",
      {},
      backButton("Back", back),
      h("header", {}, h("h1", {}, attempt.title), h("div", { class: "muted small" }, facts)),
      h("table", { class: "stats" }, th("#", "answer", "result", "at", "time", "latency", "typed", "wrong"), ...rows),
    ),
  );
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

  const rows = records.map(({ a, r }) =>
    h(
      "tr",
      { class: `row-link ${r.result}`, onclick: () => nav.attempt(quiz, a, () => showItem(quiz, answer, back)) },
      h("td", {}, fmtDate(a.endedAt)),
      h("td", {}, r.result),
      h("td", { class: "num" }, fmtSecs(r.seconds)),
      h("td", { class: "num" }, fmtSecs(r.latency)),
      h("td", { class: "num" }, fmtNum(r.typedChars)),
      h("td", { class: "num" }, fmtNum(r.wrong)),
    ),
  );

  renderScreen(
    h(
      "div",
      {},
      backButton("Back", back),
      h(
        "header",
        {},
        h("h1", {}, answer),
        h("div", { class: "muted small" }, quiz.title),
        item?.aliases.length ? h("div", { class: "muted small" }, `also: ${item.aliases.join(", ")}`) : null,
        item?.prompt ? h("div", { class: "item-prompt" }, ...promptNode(quiz, item)) : null,
        h("div", { class: "muted small" }, facts),
      ),
      h("table", { class: "stats" }, th("when", "result", "time", "latency", "typed", "wrong"), ...rows),
    ),
  );
}
