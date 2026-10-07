import { appendAttempt, listQuizzes, readAsset, readAttempts } from "./backend";
import { makeAttempt, type Attempt, type ItemTiming } from "./attempt";
import { clear, formatClock, h } from "./dom";
import { bucketOf, DEFAULT_CPS, gradeOf, typingSpeed } from "./grade";
import { belongsTo, parseLog, type AnyAttempt } from "./log";
import { parseQuiz, type Item, type Quiz } from "./quiz/format";
import { findMatch, matchesItem } from "./quiz/match";
import { daysBetween, isDue, localDate, NEW_STATE, replay, type QuizState } from "./schedule";
import { shuffled } from "./shuffle";
import { itemStats, median, trouble } from "./stats";

// ---------- app state: the attempt log, loaded once and appended to ----------

let attempts: AnyAttempt[] = [];
let cps = DEFAULT_CPS;

async function loadLog(): Promise<void> {
  attempts = parseLog(await readAttempts());
  cps = typingSpeed(attempts) ?? DEFAULT_CPS;
}

function attemptsOf(quiz: Quiz): AnyAttempt[] {
  return attempts.filter((a) => belongsTo(a, quiz));
}

function stateOf(quiz: Quiz): QuizState {
  const own = attemptsOf(quiz);
  return own.length ? replay(own, (a) => gradeOf(a, cps)) : NEW_STATE;
}

function playable(quiz: Quiz, state: QuizState, today: string): boolean {
  if (quiz.kind === "calibration") return true;
  if (quiz.retired) return false;
  return isDue(state, today);
}

function recordAttempt(attempt: Attempt): void {
  attempts.push(attempt);
  if (attempt.kind === "calibration") cps = typingSpeed(attempts) ?? DEFAULT_CPS;
  appendAttempt(attempt).catch((e) => console.error("could not log attempt", e));
}

const app = document.getElementById("app")!;

function show(...nodes: (Node | null)[]): void {
  clear(app);
  app.append(...nodes.filter((n): n is Node => n !== null));
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

// ---------- home screen ----------

interface Entry {
  quiz: Quiz;
  state: QuizState;
}

function dueLabel(state: QuizState, today: string): string {
  if (state.dueDate === null) return "";
  const n = daysBetween(today, state.dueDate);
  if (n <= 0) return n === 0 ? "due today" : `${-n}d overdue`;
  return n === 1 ? "tomorrow" : `in ${n}d`;
}

function entryRow(e: Entry, today: string, canPlay: boolean): HTMLElement {
  const meta = [`${e.quiz.items.length}`, e.quiz.mode, dueLabel(e.state, today)].filter(Boolean).join(" · ");
  return h(
    "li",
    {},
    h("button", { class: `quiz-link ${canPlay ? "" : "muted"}`, onclick: () => showQuiz(e.quiz) }, e.quiz.title),
    h("span", { class: "muted" }, ` ${meta}`),
    canPlay ? h("button", { class: "quiet play", onclick: () => showPlay(e.quiz) }, "Play") : null,
  );
}

function section(name: string, rows: HTMLElement[]): HTMLElement | null {
  if (rows.length === 0) return null;
  return h("section", {}, h("h2", {}, name), h("ul", { class: "quiz-list" }, ...rows));
}

async function showHome(): Promise<void> {
  const files = await listQuizzes();
  const today = localDate(new Date());
  const entries: Entry[] = [];
  const errors: HTMLElement[] = [];
  for (const f of files) {
    try {
      const quiz = parseQuiz(f.source, f.path, f.dir);
      entries.push({ quiz, state: stateOf(quiz) });
    } catch (e) {
      errors.push(h("li", { class: "error" }, `${f.path}: ${(e as Error).message}`));
    }
  }

  const normal = entries.filter((e) => e.quiz.kind === "normal" && !e.quiz.retired);
  const due = normal
    .filter((e) => e.state.status !== "new" && isDue(e.state, today))
    .sort((a, b) => a.state.dueDate!.localeCompare(b.state.dueDate!));
  const fresh = normal.filter((e) => e.state.status === "new");
  const upcoming = normal
    .filter((e) => e.state.status === "learning" && !isDue(e.state, today))
    .sort((a, b) => a.state.dueDate!.localeCompare(b.state.dueDate!));
  const mastered = normal
    .filter((e) => e.state.status === "mastered" && !isDue(e.state, today))
    .sort((a, b) => a.state.dueDate!.localeCompare(b.state.dueDate!));
  const retired = entries.filter((e) => e.quiz.kind === "normal" && e.quiz.retired);
  const calibration = entries.filter((e) => e.quiz.kind === "calibration");

  const sections = [
    section("Due", due.map((e) => entryRow(e, today, true))),
    section("New", fresh.map((e) => entryRow(e, today, true))),
    section("Upcoming", upcoming.map((e) => entryRow(e, today, false))),
    section("Mastered", mastered.map((e) => entryRow(e, today, false))),
    section("Retired", retired.map((e) => entryRow(e, today, false))),
    section("Calibration", calibration.map((e) => entryRow(e, today, true))),
    errors.length ? section("Errors", errors) : null,
  ].filter((x): x is HTMLElement => x !== null);

  show(
    h("header", {}, h("h1", {}, "Quizzes"), h("div", { class: "muted small" }, `typing ${cps.toFixed(1)} chars/s`)),
    ...(sections.length ? sections : [h("p", { class: "muted" }, "quizzes/ is empty")]),
  );
}

// ---------- quiz page: status and history ----------

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${localDate(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function showQuiz(quiz: Quiz): void {
  const today = localDate(new Date());
  const state = stateOf(quiz);
  const own = attemptsOf(quiz);
  const canPlay = playable(quiz, state, today);

  const facts = [
    `${quiz.items.length} items`,
    quiz.mode,
    quiz.kind === "calibration" ? "calibration" : quiz.retired ? "retired" : state.status,
    state.intervalDays ? `interval ${state.intervalDays.toFixed(1)}d` : null,
    state.dueDate ? `due ${state.dueDate} (${dueLabel(state, today)})` : null,
    `${own.length} attempts`,
  ].filter(Boolean).join(" · ");

  const history = own
    .slice()
    .reverse()
    .map((a) =>
      h(
        "tr",
        {},
        h("td", {}, fmtDate(a.endedAt)),
        h("td", { class: "num" }, `${a.score}/${a.total}`),
        h("td", { class: "num" }, formatClock(a.durationSeconds)),
        h("td", { class: "num" }, gradeOf(a, cps).toFixed(2)),
        h("td", {}, a.cleared ? "cleared" : ""),
      ),
    );

  const stats = itemStats(quiz, own, cps)
    .map((st) => ({ st, t: trouble(st) }))
    .sort((a, b) => b.t - a.t || a.st.answer.localeCompare(b.st.answer))
    .map(({ st }) => {
      const med = median(st.latencies);
      return h(
        "tr",
        { class: st.last ?? "" },
        h("td", {}, st.answer),
        h("td", { class: "num" }, String(st.seen)),
        h("td", { class: "num" }, String(st.instant)),
        h("td", { class: "num" }, String(st.slow)),
        h("td", { class: "num" }, String(st.missed)),
        h("td", { class: "num" }, med === null ? "" : `${med.toFixed(1)}s`),
        h("td", {}, st.last ?? ""),
      );
    });

  const th = (...names: string[]) => h("tr", {}, ...names.map((n) => h("th", {}, n)));

  show(
    h(
      "header",
      {},
      h("h1", {}, quiz.title),
      h("div", { class: "muted small" }, facts),
    ),
    h(
      "div",
      { class: "actions" },
      canPlay ? h("button", { onclick: () => showPlay(quiz) }, "Play") : null,
      h("button", { class: "quiet", onclick: showHome }, "Back"),
    ),
    own.length
      ? h("section", {}, h("h2", {}, "Items"), h("table", { class: "stats" }, th("answer", "seen", "instant", "slow", "missed", "median latency", "last"), ...stats))
      : null,
    own.length
      ? h("section", {}, h("h2", {}, "Attempts"), h("table", { class: "stats" }, th("when", "score", "time", "grade", ""), ...history))
      : null,
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
    recordAttempt(attempt);
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

function showResults(quiz: Quiz, attempt: Attempt, order: number[]): void {
  const rows = order.map((idx) => {
    const item = quiz.items[idx];
    const bucket = bucketOf(attempt, idx, cps);
    const secs = attempt.items[idx].found && attempt.items[idx].acceptedMs !== undefined
      ? h("span", { class: "muted seconds" }, bucket)
      : null;
    if (quiz.mode === "prompt") {
      return h(
        "li",
        { class: `card ${bucket}` },
        ...promptNode(quiz, item),
        h("div", { class: "card-answer" }, item.canonical, " ", secs),
      );
    }
    return h("li", { class: bucket }, item.canonical, " ", secs);
  });

  const state = stateOf(quiz);
  const today = localDate(new Date());
  const status: Node[] = [
    h("span", { class: "score" }, `${attempt.score} / ${attempt.total}`),
    h("span", { class: "muted" }, formatClock(attempt.durationSeconds)),
  ];
  if (quiz.kind === "normal") {
    status.push(h("span", { class: attempt.cleared ? "cleared" : "muted" }, attempt.cleared ? "cleared" : "not cleared"));
    status.push(h("span", { class: "muted" }, `grade ${gradeOf(attempt, cps).toFixed(2)}`));
    status.push(h("span", { class: "muted" }, `next ${dueLabel(state, today)}`));
  }

  show(
    h("header", {}, h("h1", {}, quiz.title), h("div", { class: "status" }, ...status)),
    quiz.mode === "prompt" ? h("ol", { class: "prompt-grid" }, ...rows) : h("ol", { class: "slots" }, ...rows),
    h(
      "div",
      { class: "actions" },
      quiz.kind === "calibration" ? h("button", { onclick: () => showPlay(quiz) }, "Again") : null,
      h("button", { class: "quiet", onclick: () => showQuiz(quiz) }, "History"),
      h("button", { class: "quiet", onclick: showHome }, "Back"),
    ),
  );
}

loadLog()
  .then(showHome)
  .catch((e) => show(h("p", { class: "error" }, String(e))));
