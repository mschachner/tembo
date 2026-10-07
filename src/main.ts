import { appendAttempt, listQuizzes } from "./backend";
import { makeAttempt, type Attempt } from "./attempt";
import { clear, formatClock, h } from "./dom";
import { parseQuiz, type Quiz } from "./quiz/format";
import { findMatch } from "./quiz/match";

const app = document.getElementById("app")!;

function show(...nodes: Node[]): void {
  clear(app);
  app.append(...nodes);
}

// ---------- quiz list ----------

async function showList(): Promise<void> {
  const files = await listQuizzes();
  const rows = files.map((f) => {
    try {
      const quiz = parseQuiz(f.source, f.path);
      return h(
        "li",
        {},
        h("button", { class: "quiz-link", onclick: () => showPlay(quiz) }, quiz.title),
        h("span", { class: "muted" }, ` ${quiz.items.length} · ${formatClock(quiz.timeSeconds)}`),
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

// ---------- playing ----------

function showPlay(quiz: Quiz): void {
  if (quiz.mode === "prompt") {
    // Prompt mode is parsed but not yet playable.
    show(
      h("p", { class: "muted" }, "prompt mode: not implemented yet"),
      h("button", { onclick: showList }, "Back"),
    );
    return;
  }

  const startedAt = new Date();
  const foundOrder: number[] = [];
  let finished = false;

  const slots = quiz.items.map(() => h("li", { class: "slot" }, " "));
  const input = h("input", {
    type: "text",
    class: "answer-input",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
  });
  const clock = h("span", { class: "clock" }, formatClock(quiz.timeSeconds));
  const score = h("span", { class: "score" }, `0 / ${quiz.items.length}`);

  function tick(): void {
    const elapsed = (Date.now() - startedAt.getTime()) / 1000;
    const remaining = quiz.timeSeconds - elapsed;
    clock.textContent = formatClock(remaining);
    if (remaining <= 0) finish();
  }
  const timer = window.setInterval(tick, 200);

  function submit(): void {
    const text = input.value;
    const idx = findMatch(text, quiz.items);
    if (idx >= 0 && !foundOrder.includes(idx)) {
      foundOrder.push(idx);
      slots[idx].textContent = quiz.items[idx].canonical;
      slots[idx].classList.add("found");
      score.textContent = `${foundOrder.length} / ${quiz.items.length}`;
      input.value = "";
      if (foundOrder.length === quiz.items.length) finish();
    } else {
      // Wrong or duplicate: leave the text, select it so typing replaces it.
      input.classList.remove("shake");
      void input.offsetWidth; // restart the animation
      input.classList.add("shake");
      input.select();
    }
  }

  function finish(): void {
    if (finished) return;
    finished = true;
    window.clearInterval(timer);
    const attempt = makeAttempt(quiz, startedAt, new Date(), foundOrder);
    appendAttempt(attempt).catch((e) => console.error("could not log attempt", e));
    showResults(quiz, attempt);
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
    if (e.key === "Escape") { input.value = ""; }
  });

  show(
    h(
      "header",
      { class: "play-header" },
      h("h1", {}, quiz.title),
      h("div", { class: "status" }, clock, score, h("button", { class: "quiet", onclick: finish }, "Give up")),
    ),
    input,
    h("ol", { class: "slots" }, ...slots),
  );
  input.focus();
}

// ---------- results ----------

function showResults(quiz: Quiz, attempt: Attempt): void {
  const foundSet = new Set(attempt.found);
  const rows = quiz.items.map((item) =>
    h("li", { class: foundSet.has(item.canonical) ? "found" : "missed" }, item.canonical),
  );
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
    h("ol", { class: "slots" }, ...rows),
    h(
      "div",
      { class: "actions" },
      h("button", { onclick: () => showPlay(quiz) }, "Again"),
      h("button", { class: "quiet", onclick: showList }, "Back"),
    ),
  );
}

showList().catch((e) => show(h("p", { class: "error" }, String(e))));
