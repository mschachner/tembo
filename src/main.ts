import { appendAttempt, listQuizzes, readAsset } from "./backend";
import { makeAttempt, type Attempt, type ItemTiming } from "./attempt";
import { clear, formatClock, h } from "./dom";
import { parseQuiz, type Item, type Quiz } from "./quiz/format";
import { findMatch, matchesItem } from "./quiz/match";
import { shuffled } from "./shuffle";

const app = document.getElementById("app")!;

function show(...nodes: Node[]): void {
  clear(app);
  app.append(...nodes);
}

// ---------- images ----------

const imageCache = new Map<string, Promise<string>>();

function imageFor(quiz: Quiz, item: Item): HTMLImageElement | null {
  const rel = item.prompt?.image;
  if (!rel) return null;
  const key = `${quiz.dir}\u0000${rel}`;
  if (!imageCache.has(key)) imageCache.set(key, readAsset(quiz.dir, rel));
  const height = item.prompt?.imageHeight ?? quiz.imageHeight;
  const img = h("img", { class: "prompt-image", alt: item.prompt?.text ?? "", style: `height: ${height}px` });
  imageCache.get(key)!.then(
    (url) => { img.src = url; },
    (e) => { img.replaceWith(h("span", { class: "error" }, String(e))); },
  );
  return img;
}

function promptNode(quiz: Quiz, item: Item): Node[] {
  const img = imageFor(quiz, item);
  const text = item.prompt?.text ?? "";
  // When there is an image, the text is its alt; don't show it twice.
  return img ? [img] : [h("div", { class: "prompt-text" }, text)];
}

// ---------- quiz list ----------

async function showList(): Promise<void> {
  const files = await listQuizzes();
  const rows = files.map((f) => {
    try {
      const quiz = parseQuiz(f.source, f.path, f.dir);
      const meta = [`${quiz.items.length}`, quiz.mode, quiz.kind === "calibration" ? "calibration" : null]
        .filter(Boolean)
        .join(" · ");
      return h(
        "li",
        {},
        h("button", { class: "quiz-link", onclick: () => showPlay(quiz) }, quiz.title),
        h("span", { class: "muted" }, ` ${meta}`),
      );
    } catch (e) {
      return h("li", { class: "error" }, `${f.path}: ${(e as Error).message}`);
    }
  });
  show(
    h("header", {}, h("h1", {}, "Quizzes")),
    files.length ? h("ul", { class: "quiz-list" }, ...rows) : h("p", { class: "muted" }, "quizzes/ is empty"),
  );
}

// ---------- shared play state ----------

interface Session {
  quiz: Quiz;
  startedAt: Date;
  foundOrder: number[];
  timing: ItemTiming[];
  rejected: number;
  finished: boolean;
  timer: number;
  clock: HTMLElement;
  score: HTMLElement;
  elapsedMs: () => number;
  finish: () => void;
}

function startSession(quiz: Quiz, onFinish: (attempt: Attempt) => void): Session {
  const session: Session = {
    quiz,
    startedAt: new Date(),
    foundOrder: [],
    timing: quiz.items.map(() => ({ wrong: 0 })),
    rejected: 0,
    finished: false,
    timer: 0,
    clock: h("span", { class: "clock" }, "0:00"),
    score: h("span", { class: "score" }, `0 / ${quiz.items.length}`),
    elapsedMs: () => Date.now() - session.startedAt.getTime(),
    finish,
  };

  session.timer = window.setInterval(() => {
    session.clock.textContent = formatClock(session.elapsedMs() / 1000);
  }, 200);

  function finish(): void {
    if (session.finished) return;
    session.finished = true;
    window.clearInterval(session.timer);
    const attempt = makeAttempt(quiz, session.startedAt, new Date(), session.foundOrder, session.timing, session.rejected);
    appendAttempt(attempt).catch((e) => console.error("could not log attempt", e));
    onFinish(attempt);
  }

  return session;
}

function markFound(session: Session, idx: number, typed: string): void {
  session.foundOrder.push(idx);
  session.timing[idx].acceptedMs = session.elapsedMs();
  session.timing[idx].typedChars = typed.length;
  session.score.textContent = `${session.foundOrder.length} / ${session.quiz.items.length}`;
  if (session.foundOrder.length === session.quiz.items.length) session.finish();
}

function reject(session: Session, input: HTMLInputElement, idx?: number): void {
  session.rejected++;
  if (idx !== undefined) session.timing[idx].wrong++;
  // Wrong or duplicate: leave the text, select it so typing replaces it.
  input.classList.remove("shake");
  void input.offsetWidth; // restart the animation
  input.classList.add("shake");
  input.select();
}

function playHeader(session: Session): HTMLElement {
  return h(
    "header",
    { class: "play-header" },
    h("h1", {}, session.quiz.title),
    h(
      "div",
      { class: "status" },
      session.clock,
      session.score,
      h("button", { class: "quiet", onclick: session.finish }, "Give up"),
    ),
  );
}

function answerInput(extraClass = ""): HTMLInputElement {
  return h("input", {
    type: "text",
    class: `answer-input ${extraClass}`.trim(),
    autocomplete: "off",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: "false",
  });
}

function showPlay(quiz: Quiz): void {
  if (quiz.mode === "prompt") playPrompt(quiz);
  else playList(quiz);
}

// ---------- list mode: one box, type any answer ----------

function playList(quiz: Quiz): void {
  const order = quiz.items.map((_, i) => i);
  const session = startSession(quiz, (attempt) => showResults(quiz, attempt, order));
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

  show(playHeader(session), input, h("ol", { class: "slots" }, ...slots));
  input.focus();
}

// ---------- prompt mode: a grid of prompts, each with its own blank ----------

function playPrompt(quiz: Quiz): void {
  const order = shuffled(quiz.items.map((_, i) => i));
  const session = startSession(quiz, (attempt) => showResults(quiz, attempt, order));
  const inputs = new Map<number, HTMLInputElement>();

  function nextUnanswered(after: number): HTMLInputElement | null {
    const pos = order.indexOf(after);
    for (let k = 1; k <= order.length; k++) {
      const idx = order[(pos + k) % order.length];
      if (!session.foundOrder.includes(idx)) return inputs.get(idx)!;
    }
    return null;
  }

  function submit(idx: number): void {
    const input = inputs.get(idx)!;
    if (input.value.trim() === "") {
      nextUnanswered(idx)?.focus();
      return;
    }
    if (matchesItem(input.value, quiz.items[idx])) {
      const typed = input.value;
      input.value = quiz.items[idx].canonical;
      input.readOnly = true;
      input.classList.add("found");
      const next = nextUnanswered(idx);
      markFound(session, idx, typed);
      next?.focus();
    } else {
      reject(session, input, idx);
    }
  }

  const cards = order.map((idx) => {
    const input = answerInput("card-input");
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

  show(playHeader(session), h("ol", { class: "prompt-grid" }, ...cards));
  inputs.get(order[0])?.focus();
}

// ---------- results ----------

// Seconds spent on an item: since the card was focused (prompt mode) or
// since the previous accept (list mode). Raw for now; bucketing against
// calibrated typing speed comes with the scheduler.
function itemSeconds(attempt: Attempt, idx: number): number | null {
  const r = attempt.items[idx];
  if (!r.found || r.acceptedMs === undefined) return null;
  let from = 0;
  if (attempt.mode === "prompt") {
    from = r.focusedMs ?? 0;
  } else {
    const pos = attempt.found.indexOf(r.answer);
    if (pos > 0) {
      const prev = attempt.items.find((x) => x.answer === attempt.found[pos - 1]);
      from = prev?.acceptedMs ?? 0;
    }
  }
  return (r.acceptedMs - from) / 1000;
}

function secondsLabel(s: number | null): HTMLElement | null {
  return s === null ? null : h("span", { class: "muted seconds" }, `${s.toFixed(1)}s`);
}

function showResults(quiz: Quiz, attempt: Attempt, order: number[]): void {
  const rows = order.map((idx) => {
    const item = quiz.items[idx];
    const r = attempt.items[idx];
    const cls = r.found ? "found" : "missed";
    const secs = secondsLabel(itemSeconds(attempt, idx));
    if (quiz.mode === "prompt") {
      return h(
        "li",
        { class: `card ${cls}` },
        ...promptNode(quiz, item),
        h("div", { class: "card-answer" }, item.canonical, " ", secs),
      );
    }
    return h("li", { class: cls }, item.canonical, " ", secs);
  });
  show(
    h(
      "header",
      {},
      h("h1", {}, quiz.title),
      h(
        "div",
        { class: "status" },
        h("span", { class: "score" }, `${attempt.score} / ${attempt.total}`),
        h("span", { class: "muted" }, formatClock(attempt.durationSeconds)),
        h("span", { class: attempt.cleared ? "cleared" : "muted" }, attempt.cleared ? "cleared" : "not cleared"),
      ),
    ),
    quiz.mode === "prompt" ? h("ol", { class: "prompt-grid" }, ...rows) : h("ol", { class: "slots" }, ...rows),
    h(
      "div",
      { class: "actions" },
      h("button", { onclick: () => showPlay(quiz) }, "Again"),
      h("button", { class: "quiet", onclick: showList }, "Back"),
    ),
  );
}

showList().catch((e) => show(h("p", { class: "error" }, String(e))));
