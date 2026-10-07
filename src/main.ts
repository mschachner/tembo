import { appendAttempt, listQuizzes, readAsset } from "./backend";
import { makeAttempt, type Attempt } from "./attempt";
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
  const img = h("img", { class: "prompt-image", alt: item.prompt?.text ?? "" });
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
      return h(
        "li",
        {},
        h("button", { class: "quiz-link", onclick: () => showPlay(quiz) }, quiz.title),
        h("span", { class: "muted" }, ` ${quiz.items.length} · ${formatClock(quiz.timeSeconds)} · ${quiz.mode}`),
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
  finished: boolean;
  timer: number;
  clock: HTMLElement;
  score: HTMLElement;
  finish: () => void;
}

function startSession(quiz: Quiz, onFinish: (attempt: Attempt) => void): Session {
  const session: Session = {
    quiz,
    startedAt: new Date(),
    foundOrder: [],
    finished: false,
    timer: 0,
    clock: h("span", { class: "clock" }, formatClock(quiz.timeSeconds)),
    score: h("span", { class: "score" }, `0 / ${quiz.items.length}`),
    finish,
  };

  function tick(): void {
    const elapsed = (Date.now() - session.startedAt.getTime()) / 1000;
    const remaining = quiz.timeSeconds - elapsed;
    session.clock.textContent = formatClock(remaining);
    if (remaining <= 0) finish();
  }
  session.timer = window.setInterval(tick, 200);

  function finish(): void {
    if (session.finished) return;
    session.finished = true;
    window.clearInterval(session.timer);
    const attempt = makeAttempt(quiz, session.startedAt, new Date(), session.foundOrder);
    appendAttempt(attempt).catch((e) => console.error("could not log attempt", e));
    onFinish(attempt);
  }

  return session;
}

function markFound(session: Session, idx: number): void {
  session.foundOrder.push(idx);
  session.score.textContent = `${session.foundOrder.length} / ${session.quiz.items.length}`;
  if (session.foundOrder.length === session.quiz.items.length) session.finish();
}

function reject(input: HTMLInputElement): void {
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

function showPlay(quiz: Quiz): void {
  if (quiz.mode === "prompt") playPrompt(quiz);
  else playList(quiz);
}

// ---------- list mode: one box, type any answer ----------

function playList(quiz: Quiz): void {
  const session = startSession(quiz, (attempt) => showResults(quiz, attempt));
  const slots = quiz.items.map(() => h("li", { class: "slot" }, " "));
  const input = h("input", {
    type: "text",
    class: "answer-input",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
  });

  function submit(): void {
    const idx = findMatch(input.value, quiz.items);
    if (idx >= 0 && !session.foundOrder.includes(idx)) {
      slots[idx].textContent = quiz.items[idx].canonical;
      slots[idx].classList.add("found");
      input.value = "";
      markFound(session, idx);
    } else {
      reject(input);
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
  const session = startSession(quiz, (attempt) => showResults(quiz, attempt));
  const order = shuffled(quiz.items.map((_, i) => i));
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
      input.value = quiz.items[idx].canonical;
      input.readOnly = true;
      input.classList.add("found");
      const next = nextUnanswered(idx);
      markFound(session, idx);
      next?.focus();
    } else {
      reject(input);
    }
  }

  const cards = order.map((idx) => {
    const input = h("input", {
      type: "text",
      class: "answer-input card-input",
      autocomplete: "off",
      autocapitalize: "off",
      spellcheck: "false",
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

function showResults(quiz: Quiz, attempt: Attempt): void {
  const foundSet = new Set(attempt.found);
  const rows = quiz.items.map((item) => {
    const cls = foundSet.has(item.canonical) ? "found" : "missed";
    if (quiz.mode === "prompt") {
      return h("li", { class: `card ${cls}` }, ...promptNode(quiz, item), h("div", { class: "card-answer" }, item.canonical));
    }
    return h("li", { class: cls }, item.canonical);
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
