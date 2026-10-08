import { app, persistSettings, recordAttempt, stateOf } from "../app";
import { makeAttempt, type Attempt, type ItemTiming } from "../attempt";
import { formatClock, h } from "../dom";
import { bucketOf, gradeOf } from "../grade";
import { nav } from "../nav";
import type { Item, Quiz } from "../quiz/format";
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
  session.score.classList.remove("bump");
  void session.score.offsetWidth; // restart the animation
  session.score.classList.add("bump");
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

function playHeader(session: Session, toggle: Node | null = null): HTMLElement {
  return h(
    "header",
    { class: "play-header" },
    h("h1", {}, session.quiz.title),
    h("div", { class: "status" }, session.clock, session.score, toggle,
      h("button", { class: "quiet", onclick: () => session.finish(true) }, "Give up")),
  );
}

// Prompt quizzes show as a list (a table, one row per prompt) or as cards.
// Each quiz remembers its last view; list is the default.
type View = "cards" | "list";

function viewOf(quiz: Quiz): View {
  return app.settings.views?.[quiz.id] ?? "list";
}

function viewToggle(quiz: Quiz, onChange: (v: View) => void): HTMLElement {
  const buttons = (["list", "cards"] as View[]).map((v) =>
    h("button", {
      class: `quiet tiny ${v === viewOf(quiz) ? "active" : ""}`, "data-view": v,
      onclick: (e: Event) => {
        (e.currentTarget as HTMLButtonElement).blur();
        if (v === viewOf(quiz)) return;
        app.settings.views = { ...app.settings.views, [quiz.id]: v };
        persistSettings();
        buttons.forEach((b) => b.classList.toggle("active", b.dataset.view === v));
        onChange(v);
      },
    }, v === "list" ? "List" : "Cards"),
  );
  return h("div", { class: "view-toggle" }, ...buttons);
}

// Table pieces shared by play and results.
function tableHead(quiz: Quiz): HTMLElement | null {
  const withPrompt = quiz.mode === "prompt";
  if (!quiz.columns.length && !quiz.answerLabel && !(withPrompt && quiz.promptLabel)) return null;
  return h("thead", {}, h("tr", {},
    withPrompt ? h("th", {}, quiz.promptLabel) : null,
    ...quiz.columns.map((c) => h("th", {}, c)),
    h("th", {}, quiz.answerLabel)));
}

function dataCells(quiz: Quiz, item: Item): HTMLElement[] {
  return quiz.columns.map((_, k) => h("td", { class: "data" }, item.data[k] ?? ""));
}

function cardData(item: Item): HTMLElement | null {
  const values = item.data.filter((v) => v !== "");
  return values.length ? h("div", { class: "card-data" }, values.join(" · ")) : null;
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
  // With data columns the quiz is a table (the data are the clues, answers
  // fill in by row); without, numbered blanks.
  const asTable = quiz.columns.length > 0;
  const slots = quiz.items.map(() => asTable ? h("td", { class: "answer-cell slot" }) : h("li", { class: "slot" }, " "));
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

  const listing = asTable
    ? h("table", { class: "quiz-table" }, tableHead(quiz),
        h("tbody", {}, ...quiz.items.map((item, idx) => h("tr", {}, ...dataCells(quiz, item), slots[idx]))))
    : h("ol", { class: "slots" }, ...slots);
  renderScreen(h("div", {}, playHeader(session), input, listing), { wide: true });
  input.focus();
}

function playPrompt(quiz: Quiz): void {
  // Prompts come in file order while you're learning a quiz, and shuffled
  // once it's proficient (the calibration quiz is always shuffled).
  const inOrder = quiz.items.map((_, i) => i);
  const shuffle = quiz.kind === "calibration" || stateOf(quiz).status === "proficient";
  const order = shuffle ? shuffled(inOrder) : inOrder;
  const session = startSession(quiz, order, (attempt) => showResults(quiz, attempt, order));
  const found = (idx: number) => session.foundOrder.includes(idx);
  // Typed-but-unsubmitted text, kept across a switch of view.
  const drafts = new Map<number, string>();
  let inputs = new Map<number, AnswerBox>();
  let switching = false;

  function nextUnanswered(after: number): AnswerBox | null {
    const pos = order.indexOf(after);
    for (let k = 1; k <= order.length; k++) {
      const idx = order[(pos + k) % order.length];
      if (!found(idx) && idx !== after) return inputs.get(idx) ?? null;
    }
    return null;
  }
  const firstUnanswered = () => inputs.get(order.find((idx) => !found(idx)) ?? -1) ?? null;

  function submit(idx: number): void {
    const input = inputs.get(idx)!;
    if (input.value.trim() === "") { nextUnanswered(idx)?.focus(); return; }
    if (matchesItem(input.value, quiz.items[idx])) {
      const typed = input.value;
      drafts.delete(idx);
      // Swap the box for the answer as text, which wraps freely.
      input.replaceWith(h("div", { class: "card-answer accepted" }, quiz.items[idx].canonical));
      inputs.delete(idx);
      const next = nextUnanswered(idx);
      markFound(session, idx, typed);
      next?.focus();
    } else {
      reject(session, input, idx);
    }
  }

  function box(idx: number, input: AnswerBox): Node {
    if (found(idx)) return h("div", { class: "card-answer accepted" }, quiz.items[idx].canonical);
    input.value = drafts.get(idx) ?? "";
    input.addEventListener("input", () => drafts.set(idx, input.value));
    input.addEventListener("focus", () => {
      // Switching views refocuses the same box; that isn't a new look at the prompt.
      if (!found(idx) && !switching) session.timing[idx].focusedMs = session.elapsedMs();
    });
    input.addEventListener("keydown", (ev) => {
      const e = ev as KeyboardEvent;
      if (e.key === "Enter") { e.preventDefault(); submit(idx); }
      if (e.key === "Escape") { input.value = ""; drafts.delete(idx); }
    });
    inputs.set(idx, input);
    return input;
  }

  function listing(view: View): HTMLElement {
    inputs = new Map();
    if (view === "cards") {
      return h("ol", { class: "prompt-grid" }, ...order.map((idx) => {
        const item = quiz.items[idx];
        return h("li", { class: "card" }, ...promptNode(quiz, item), cardData(item), box(idx, cardInput()));
      }));
    }
    return h("table", { class: "quiz-table" }, tableHead(quiz), h("tbody", {}, ...order.map((idx) => {
      const item = quiz.items[idx];
      return h("tr", {},
        h("td", { class: "prompt-cell" }, ...promptNode(quiz, item)),
        ...dataCells(quiz, item),
        h("td", { class: "answer-cell" }, box(idx, answerInput())));
    })));
  }

  // Card boxes grow to fit restored text once they're on screen.
  const fitAll = () => inputs.forEach((el) => { if (el instanceof HTMLTextAreaElement && el.value) el.dispatchEvent(new Event("input")); });

  let current = listing(viewOf(quiz));
  const toggle = viewToggle(quiz, (v) => {
    const active = [...inputs].find(([, el]) => el === document.activeElement)?.[0];
    const next = listing(v);
    current.replaceWith(next);
    current = next;
    fitAll();
    switching = true;
    (active !== undefined ? inputs.get(active) : firstUnanswered())?.focus();
    switching = false;
  });

  renderScreen(h("div", {}, playHeader(session, toggle), current), { wide: true });
  inputs.get(order[0])?.focus();
}

export function showResults(quiz: Quiz, attempt: Attempt, order: number[]): void {
  const tag = (idx: number) => attempt.items[idx].found ? h("span", { class: "muted seconds mono" }, bucketOf(attempt, idx, app.cps)) : null;

  function listing(view: View): HTMLElement {
    if (quiz.mode === "prompt" && view === "cards") {
      return h("ol", { class: "prompt-grid" }, ...order.map((idx) => {
        const item = quiz.items[idx];
        return h("li", { class: `card ${bucketOf(attempt, idx, app.cps)}` },
          ...promptNode(quiz, item), cardData(item), h("div", { class: "card-answer" }, item.canonical, " ", tag(idx)));
      }));
    }
    if (quiz.mode === "prompt" || quiz.columns.length) {
      return h("table", { class: "quiz-table" }, tableHead(quiz), h("tbody", {}, ...order.map((idx) => {
        const item = quiz.items[idx];
        return h("tr", { class: bucketOf(attempt, idx, app.cps) },
          quiz.mode === "prompt" ? h("td", { class: "prompt-cell" }, ...promptNode(quiz, item)) : null,
          ...dataCells(quiz, item),
          h("td", { class: "answer-cell" }, item.canonical, " ", tag(idx)));
      })));
    }
    return h("ol", { class: "slots" }, ...order.map((idx) =>
      h("li", { class: bucketOf(attempt, idx, app.cps) }, quiz.items[idx].canonical, " ", tag(idx))));
  }

  let current = listing(viewOf(quiz));
  const toggle = quiz.mode === "prompt"
    ? viewToggle(quiz, (v) => { const next = listing(v); current.replaceWith(next); current = next; })
    : null;

  const state = stateOf(quiz);
  const status: Node[] = [
    h("span", { class: "score mono" }, `${attempt.score} / ${attempt.total}`),
    h("span", { class: "muted mono" }, formatClock(attempt.durationSeconds)),
  ];
  if (quiz.kind === "normal") {
    status.push(h("span", { class: attempt.cleared ? "cleared stamp" : "muted" }, attempt.cleared ? "cleared" : "not cleared"));
    status.push(h("span", { class: "muted mono" }, `grade ${gradeOf(attempt, app.cps).toFixed(2)}`));
    status.push(h("span", { class: "muted" }, `next ${dueLabel(state)}`));
  }
  if (toggle) status.push(toggle);

  renderScreen(
    h(
      "div",
      {},
      h("header", {}, h("h1", {}, quiz.title), h("div", { class: "status" }, ...status)),
      current,
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
