import { app, asset } from "../app";
import { formatClock, h } from "../dom";
import { gradeOf } from "../grade";
import type { AnyAttempt } from "../log";
import type { Item, Quiz } from "../quiz/format";
import { daysBetween, localDate, type QuizState } from "../schedule";

export function imageFor(quiz: Quiz, item: Item): HTMLImageElement | null {
  const rel = item.prompt?.image;
  if (!rel) return null;
  const height = item.prompt?.imageHeight ?? quiz.imageHeight;
  const img = h("img", { class: "prompt-image", alt: item.prompt?.text ?? "", style: `height: ${height}px` });
  asset(quiz.dir, rel).then(
    (url) => { img.src = url; },
    (e) => { img.replaceWith(h("span", { class: "error" }, String(e))); },
  );
  return img;
}

export function promptNode(quiz: Quiz, item: Item): Node[] {
  const img = imageFor(quiz, item);
  const text = item.prompt?.text ?? "";
  // When there is an image, the text is its alt; don't show it twice.
  return img ? [img] : [h("div", { class: "prompt-text" }, text)];
}

export function dueLabel(state: QuizState, today = localDate(new Date())): string {
  if (state.dueDate === null) return "";
  const n = daysBetween(today, state.dueDate);
  if (n <= 0) return n === 0 ? "due today" : `${-n}d overdue`;
  return n === 1 ? "tomorrow" : `in ${n}d`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${localDate(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export const fmtSecs = (x: number | null) => (x === null ? "" : `${x.toFixed(1)}s`);
export const fmtNum = (x: number | null) => (x === null ? "" : String(x));

export function th(...names: string[]): HTMLElement {
  return h("tr", {}, ...names.map((n) => h("th", {}, n)));
}

export function attemptRow(quiz: Quiz, a: AnyAttempt, onclick: () => void): HTMLElement {
  return h(
    "tr",
    { class: "row-link", onclick },
    h("td", {}, fmtDate(a.endedAt)),
    h("td", { class: "muted" }, quiz.title),
    h("td", { class: "num" }, `${a.score}/${a.total}`),
    h("td", { class: "num" }, formatClock(a.durationSeconds)),
    h("td", { class: "num" }, gradeOf(a, app.cps).toFixed(2)),
    h("td", {}, a.cleared ? "cleared" : ""),
  );
}

export function backButton(label: string, onclick: () => void): HTMLElement {
  return h("button", { class: "quiet back", onclick }, `← ${label}`);
}
