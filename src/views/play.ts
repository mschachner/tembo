import { app, recordAttempt, stateOf } from "../app";
import { makeAttempt, type Attempt, type ItemTiming } from "../attempt";
import { formatClock, h } from "../dom";
import { bucketOf, gradeOf } from "../grade";
import { nav } from "../nav";
import type { Quiz } from "../quiz/format";
import { findMatch, matchesItem } from "../quiz/match";
import { renderScreen } from "../shell";
import { shuffled } from "../shuffle";
import { sounds } from "../sound";
import { dueLabel, promptNode } from "./common";

interface Session {
  quiz: Quiz;
  order: number[];
  startedAt: Date;
  foundOrder: number[];
  timing: ItemTiming[];
  rejected: number;
  finished: boolean;
  timer: number;
  clock: HTMLElement;
  score: HTMLElement;
  elapsedMs: () => number;
  finish: (gaveUp: boolean) => void;
}

function startSession(quiz: Quiz, order: number[], onFinish: (attempt: Attempt) => void): Session {
  const session: Session = {
    quiz, order, startedAt: new Date(), foundOrder: [],
    timing: quiz.items.map(() => ({ wrong: 0 })),
    rejected: 0, finished: false, timer: 0,
    clock: h("span", { class: "clock mono" }, "0:00"),
    score: h("span", { class: "score mono" }, `0 / ${quiz.items.length}`),
    elapsedMs: () => Date.now() - session.startedAt.getTime(),
    finish,
  };
  session.timer = window.setInterval(() => {
    session.clock.textContent = formatClock(session.elapsedMs() / 1000);
  }, 200);

  function finish(gaveUp: boolean): void {
    if (session.finished) return;
    session.finished = true;
    window.clearInterval(session.timer);
    const attempt = makeAttempt(quiz, session.startedAt, new Date(), session.foundOrder, session.timing, session.rejected, session.order);
    recordAttempt(attempt);
    if (gaveUp) sounds.giveUp(); else sounds.complete();
    onFinish(attempt);
  }
  return session;
}

function markFound(session: Session, idx: number, typed: string): void {
  session.foundOrder.push(idx);
  session.timing[idx].acceptedMs = session.elapsedMs();
  session.timing[idx].typedChars = typed.length;
  session.score.textContent = `${session.foundOrder.length} / ${session.quiz.items.length}`;
  if (session.foundOrder.length === session.quiz.items.length) session.finish(false);
  else sounds.accept();
}

type AnswerBox = HTMLInputElement | HTMLTextAreaElement;

function reject(session: Session, input: AnswerBox, idx?: number): void {
  session.rejected++;
  if (idx !== undefined) session.timing[idx].wrong++;
  sounds.reject();
  input.classList.remove("shake");
  void input.offsetWidth;
  input.classList.add("shake");
  input.select();
}

function playHeader(session: Session): HTMLElement {
  return h(
    "header",
    { class: "play-header" },
    h("h1", {}, session.quiz.title),
    h("div", { class: "status" }, session.clock, session.score,
      h("button", { class: "quiet", onclick: () => session.finish(true) }, "Give up")),
  );
}

function answerInput(extraClass = ""): HTMLInputElement {
  return h("input", {
    type: "text", class: `answer-input ${extraClass}`.trim(),
    autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false",
  });
}

// Prompt cards use a one-row textarea that wraps and grows with its
// contents, so long answers stay fully visible while typing.
function cardInput(): HTMLTextAreaElement {
  const el = h("textarea", {
    class: "answer-input card-input", rows: "1",
    autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false",
  });
  const fit = () => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  };
  el.addEventListener("input", () => {
    if (el.value.includes("\n")) el.value = el.value.replace(/\n/g, " ");
    fit();
  });
  return el;
}

export function showPlay(quiz: Quiz): void {
  if (quiz.mode === "prompt") playPrompt(quiz);
  else playList(quiz);
}

function playList(quiz: Quiz): void {
  const order = quiz.items.map((_, i) => i);
  const session = startSession(quiz, order, (attempt) => showResults(quiz, attempt, order));
  const slots = quiz.items.map(() => h("li", { class: "slot" }, " "));
  const input = answerInput();

  function submit(): void {
    const idx = findMatch(input.value, quiz.items);
    if (idx >= 0 && !session.foundOrder.includes(idx)) {
      slots[idx].textContent = quiz.items[idx].canonical;
      slots[idx].classList.add("found");
      const typed = input.value;
      input.value = "";
      markFound(session, idx, typed);
    } else {
      reject(session, input);
    }
  }
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
    if (e.key === "Escape") input.value = "";
  });

  renderScreen(h("div", {}, playHeader(session), input, h("ol", { class: "slots" }, ...slots)), { wide: true });
  input.focus();
}

function playPrompt(quiz: Quiz): void {
  const order = shuffled(quiz.items.map((_, i) => i));
  const session = startSession(quiz, order, (attempt) => showResults(quiz, attempt, order));
  const inputs = new Map<number, HTMLTextAreaElement>();

  function nextUnanswered(after: number): HTMLTextAreaElement | null {
    const pos = order.indexOf(after);
    for (let k = 1; k <= order.length; k++) {
      const idx = order[(pos + k) % order.length];
      if (!session.foundOrder.includes(idx)) return inputs.get(idx)!;
    }
    return null;
  }

  function submit(idx: number): void {
    const input = inputs.get(idx)!;
    if (input.value.trim() === "") { nextUnanswered(idx)?.focus(); return; }
    if (matchesItem(input.value, quiz.items[idx])) {
      const typed = input.value;
      // Swap the box for the answer as text, which wraps freely.
      input.replaceWith(h("div", { class: "card-answer accepted" }, quiz.items[idx].canonical));
      const next = nextUnanswered(idx);
      markFound(session, idx, typed);
      next?.focus();
    } else {
      reject(session, input, idx);
    }
  }

  const cards = order.map((idx) => {
    const input = cardInput();
    input.addEventListener("focus", () => {
      if (!session.foundOrder.includes(idx)) session.timing[idx].focusedMs = session.elapsedMs();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); submit(idx); }
      if (e.key === "Escape") input.value = "";
    });
    inputs.set(idx, input);
    return h("li", { class: "card" }, ...promptNode(quiz, quiz.items[idx]), input);
  });

  renderScreen(h("div", {}, playHeader(session), h("ol", { class: "prompt-grid" }, ...cards)), { wide: true });
  inputs.get(order[0])?.focus();
}

export function showResults(quiz: Quiz, attempt: Attempt, order: number[]): void {
  const rows = order.map((idx) => {
    const item = quiz.items[idx];
    const bucket = bucketOf(attempt, idx, app.cps);
    const tag = attempt.items[idx].found ? h("span", { class: "muted seconds mono" }, bucket) : null;
    if (quiz.mode === "prompt") {
      return h("li", { class: `card ${bucket}` }, ...promptNode(quiz, item), h("div", { class: "card-answer" }, item.canonical, " ", tag));
    }
    return h("li", { class: bucket }, item.canonical, " ", tag);
  });

  const state = stateOf(quiz);
  const status: Node[] = [
    h("span", { class: "score mono" }, `${attempt.score} / ${attempt.total}`),
    h("span", { class: "muted mono" }, formatClock(attempt.durationSeconds)),
  ];
  if (quiz.kind === "normal") {
    status.push(h("span", { class: attempt.cleared ? "cleared" : "muted" }, attempt.cleared ? "cleared" : "not cleared"));
    status.push(h("span", { class: "muted mono" }, `grade ${gradeOf(attempt, app.cps).toFixed(2)}`));
    status.push(h("span", { class: "muted" }, `next ${dueLabel(state)}`));
  }

  renderScreen(
    h(
      "div",
      {},
      h("header", {}, h("h1", {}, quiz.title), h("div", { class: "status" }, ...status)),
      quiz.mode === "prompt" ? h("ol", { class: "prompt-grid" }, ...rows) : h("ol", { class: "slots" }, ...rows),
      h(
        "div",
        { class: "actions" },
        quiz.kind === "calibration" ? h("button", { onclick: () => showPlay(quiz) }, "Again") : null,
        h("button", { class: "quiet", onclick: () => nav.attempt(quiz, attempt, () => showResults(quiz, attempt, order)) }, "Details"),
        h("button", { class: "quiet", onclick: () => nav.quiz(quiz) }, "History"),
        h("button", { class: "quiet", onclick: () => nav.home() }, "Home"),
      ),
    ),
    { wide: true },
  );
}
