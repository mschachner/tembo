import { app, attemptsOf, persistSettings, recordAttempt, stateOf } from "../app";
import { tembo } from "../banner";
import { celebrate } from "../celebrate";
import { makeAttempt, type Attempt, type ItemTiming } from "../attempt";
import { formatClock, h } from "../dom";
import { bucketOf, gradeOf } from "../grade";
import { nav } from "../nav";
import type { Item, Quiz } from "../quiz/format";
import { findMatch, matchesItem } from "../quiz/match";
import { renderScreen } from "../shell";
import { shuffled } from "../shuffle";
import { sounds } from "../sound";
import { answerNode, dueLabel, promptNode } from "./common";
import { rich } from "../rich";
import { diagramDisplay, nearestInDirection, nodeData, nodeLabel } from "./diagram";
import { plainKey, setKeys, typing } from "../keys";

interface Session {
  quiz: Quiz;
  order: number[];
  startedAt: Date;
  foundOrder: number[];
  timing: ItemTiming[];
  rejected: number;
  locked: Map<number, string>;   // prompt mode: items locked out, with the last wrong guess
  lockoutAfter: number;          // wrong guesses that lock an item; 0 for never
  everFound: Set<string>;   // answers found in any earlier attempt of this quiz
  finished: boolean;
  timer: number;
  clock: HTMLElement;
  score: HTMLElement;
  giveUp: HTMLButtonElement;
  elapsedMs: () => number;
  finish: (gaveUp: boolean) => void;
}

// Prompt quizzes lock an item after the configured number of wrong
// guesses. The calibration quiz never does: it measures typing.
function lockoutOf(quiz: Quiz): number {
  if (quiz.mode !== "prompt" || quiz.kind !== "normal") return 0;
  return Math.max(0, Math.round(app.settings.play?.lockoutGuesses ?? 1));
}

// Every item found or locked out: nothing left to answer.
function allSettled(session: Session): boolean {
  return session.foundOrder.length + session.locked.size === session.quiz.items.length;
}

function startSession(quiz: Quiz, order: number[], onFinish: (attempt: Attempt) => void): Session {
  const session: Session = {
    quiz, order, startedAt: new Date(), foundOrder: [],
    timing: quiz.items.map(() => ({ wrong: 0 })),
    rejected: 0, locked: new Map(), lockoutAfter: lockoutOf(quiz), everFound: new Set(attemptsOf(quiz).flatMap((a) => a.found)), finished: false, timer: 0,
    clock: h("span", { class: "clock mono" }, "0:00"),
    score: h("span", { class: "score mono" }, `0 / ${quiz.items.length}`),
    giveUp: h("button", { class: "quiet give-up", onclick: () => session.finish(true) }, h("kbd", {}, "esc esc"), " Give up"),
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

// Records the find and says whether it was the first time ever for this item.
function markFound(session: Session, idx: number, typed: string): boolean {
  const first = !session.everFound.has(session.quiz.items[idx].canonical);
  session.foundOrder.push(idx);
  session.timing[idx].acceptedMs = session.elapsedMs();
  session.timing[idx].typedChars = typed.length;
  session.score.textContent = `${session.foundOrder.length} / ${session.quiz.items.length}`;
  session.score.classList.remove("bump");
  void session.score.offsetWidth; // restart the animation
  session.score.classList.add("bump");
  if (allSettled(session)) session.finish(false);
  else if (first) sounds.firstFind();
  else sounds.accept();
  return first;
}

// Marks an answer found for the first time ever.
function firstMark(): HTMLElement {
  return h("span", { class: "first-mark", "data-tip": "first time" }, "\u2726");
}

type AnswerBox = HTMLInputElement | HTMLTextAreaElement;

// Browsers scroll a newly focused box into view only once it is off screen,
// which on a long quiz means working at the very bottom of the window. Keep
// the current box out of the bottom (and top) eighth instead.
function focusBox(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.focus({ preventScroll: true });
  const r = el.getBoundingClientRect();
  const wh = window.innerHeight;
  if (r.bottom <= wh * 0.875 && r.top >= wh * 0.125) return;
  const smooth = document.documentElement.dataset.motion === "on";
  window.scrollBy({ top: r.top + r.height / 2 - wh * 0.45, behavior: smooth ? "smooth" : "auto" });
}

function reject(session: Session, input: AnswerBox, idx?: number): void {
  session.rejected++;
  if (idx !== undefined) {
    session.timing[idx].wrong++;
    (session.timing[idx].guesses ??= []).push(input.value.trim());
  }
  sounds.reject();
  input.classList.remove("shake");
  void input.offsetWidth;
  input.classList.add("shake");
  input.select();
}

// A rejected guess on a prompt item; says whether it locked the item out.
function wrongGuess(session: Session, input: AnswerBox, idx: number): boolean {
  reject(session, input, idx);
  const n = session.lockoutAfter;
  if (n === 0 || session.timing[idx].wrong < n) return false;
  session.locked.set(idx, input.value.trim());
  session.timing[idx].locked = true;
  return true;
}

// What replaces a locked item's box: the last wrong guess, struck through,
// then the correct answer.
function lockedAnswer(session: Session, idx: number, cls: string): HTMLElement {
  return h("div", { class: `${cls} locked`, "data-tip": "locked" },
    h("s", { class: "guess" }, session.locked.get(idx) ?? ""), " ",
    h("span", { class: "correct" }, session.quiz.items[idx].canonical));
}

// The calibration quiz can't be given up: a partial attempt would measure
// nothing, and the Watering Hole unlocks once it has been played.
function canGiveUp(quiz: Quiz): boolean {
  return quiz.kind !== "calibration";
}

function playHeader(session: Session, toggle: Node | null = null): HTMLElement {
  return h(
    "header",
    { class: "play-header" },
    h("h1", {}, session.quiz.title),
    session.quiz.note ? h("p", { class: "play-note muted" }, session.quiz.note) : null,
    h("div", { class: "status" }, session.clock, session.score, toggle, canGiveUp(session.quiz) ? session.giveUp : null),
  );
}

// Keys during play. The answer boxes handle typing, Enter and Escape (which
// clears a box); here: Escape in an empty box, pressed twice, gives up
// (except on the calibration quiz);
// ⌘L switches between list and cards; and typing while no box has focus
// goes to the first open box.
function playKeys(session: Session, focusFirst: () => void, toggleView?: () => void): void {
  let armed = 0;
  const disarm = () => {
    window.clearTimeout(armed); armed = 0;
    session.giveUp.classList.remove("armed");
    session.giveUp.replaceChildren(h("kbd", {}, "esc esc"), " Give up");
  };
  setKeys((e) => {
    if (session.finished) return false;
    if (e.key === "Escape" && plainKey(e) && canGiveUp(session.quiz)) {
      const box = (e.target as HTMLElement).closest?.("input, textarea") as AnswerBox | null;
      if (box && box.value !== "") { disarm(); return false; }
      if (armed) { disarm(); session.finish(true); return true; }
      session.giveUp.classList.add("armed");
      session.giveUp.replaceChildren(h("kbd", {}, "esc"), " again to give up");
      armed = window.setTimeout(disarm, 2500);
      return true;
    }
    if (armed && !["Shift", "Meta", "Alt", "Control"].includes(e.key)) disarm();
    if (toggleView && e.metaKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === "l") { toggleView(); return true; }
    if (!typing(e) && plainKey(e) && (e.key.length === 1 || e.key === "Enter")) {
      focusFirst();
      return e.key === "Enter";
    }
    return false;
  });
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
  return h("div", { class: "view-toggle", "data-tip": "⌘L" }, ...buttons);
}

// Switch a toggle to its other view, as a click would.
function flip(toggle: HTMLElement): void {
  toggle.querySelector<HTMLButtonElement>("button:not(.active)")?.click();
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
  if (quiz.diagram) playDiagram(quiz);
  else if (quiz.mode === "prompt") playPrompt(quiz);
  else playList(quiz);
}

// Diagrams keep file order (the position is the clue, so there is nothing
// to shuffle). In prompt mode each blank node is an answer box; in list
// mode answers go in one box and land in their nodes.
function playDiagram(quiz: Quiz): void {
  const order = quiz.items.map((_, i) => i);
  const session = startSession(quiz, order, (attempt) => showResults(quiz, attempt, order));
  const found = (idx: number) => session.foundOrder.includes(idx);
  const answer = (idx: number) => h("div", { class: "dnode-answer" }, rich(quiz.items[idx].canonical));

  if (quiz.mode === "list") {
    const input = answerInput();
    const display = diagramDisplay(quiz, (idx, node) =>
      node.append(...[nodeLabel(quiz, idx), h("div", { class: "dnode-answer vacant" }), nodeData(quiz, idx)].filter((x): x is HTMLElement => x !== null)));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") input.value = "";
      if (e.key !== "Enter") return;
      e.preventDefault();
      const idx = findMatch(input.value, quiz.items);
      if (idx >= 0 && !found(idx)) {
        const node = display.nodeOf.get(idx)!;
        const shown = answer(idx);
        node.querySelector(".dnode-answer")!.replaceWith(shown);
        node.classList.add("found");
        const typed = input.value;
        input.value = "";
        if (markFound(session, idx, typed)) shown.append(firstMark());
      } else {
        reject(session, input);
      }
    });
    renderScreen(h("div", {}, playHeader(session), input, display.el), { wide: true });
    playKeys(session, () => input.focus());
    input.focus();
    return;
  }

  const inputs = new Map<number, HTMLInputElement>();
  const settled = (idx: number) => found(idx) || session.locked.has(idx);
  const open = () => order.filter((idx) => !settled(idx));
  const nextOpen = (after: number) => {
    for (let k = 1; k < order.length; k++) {
      const idx = (after + k) % order.length;
      if (!settled(idx)) return inputs.get(idx) ?? null;
    }
    return null;
  };
  // Up/Down always move to the nearest open node that way; Left/Right do
  // when the box is empty or with Option held, so they still move the caret
  // inside a typed answer.
  const ARROWS: Record<string, [number, number]> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

  function submit(idx: number): void {
    const input = inputs.get(idx)!;
    if (input.value.trim() === "") { focusBox(nextOpen(idx)); return; }
    if (matchesItem(input.value, quiz.items[idx])) {
      const typed = input.value;
      const shown = answer(idx);
      input.replaceWith(shown);
      inputs.delete(idx);
      display.nodeOf.get(idx)!.classList.add("found");
      const next = nextOpen(idx);
      if (markFound(session, idx, typed)) shown.append(firstMark());
      focusBox(next);
    } else if (wrongGuess(session, input, idx)) {
      input.replaceWith(lockedAnswer(session, idx, "dnode-answer"));
      inputs.delete(idx);
      display.nodeOf.get(idx)!.classList.add("locked");
      const next = nextOpen(idx);
      if (allSettled(session)) session.finish(false);
      else focusBox(next);
    }
  }

  const display = diagramDisplay(quiz, (idx, node) => {
    const input = answerInput();
    const fit = () => { input.style.width = `${Math.max(4, input.value.length + 1)}ch`; };
    fit();
    input.addEventListener("input", fit);
    input.addEventListener("focus", () => { session.timing[idx].focusedMs = session.elapsedMs(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); submit(idx); return; }
      if (e.key === "Escape") { input.value = ""; fit(); return; }
      const dir = ARROWS[e.key];
      const vertical = e.key === "ArrowUp" || e.key === "ArrowDown";
      if (dir && (vertical || e.altKey || input.value === "")) {
        e.preventDefault();
        const to = nearestInDirection(quiz, idx, dir, open());
        if (to !== null) focusBox(inputs.get(to));
      }
    });
    // A click anywhere on the node goes to its box.
    node.addEventListener("mousedown", (e) => {
      if (e.target !== input && inputs.has(idx)) { e.preventDefault(); input.focus(); }
    });
    inputs.set(idx, input);
    node.append(...[nodeLabel(quiz, idx), input, nodeData(quiz, idx)].filter((x): x is HTMLElement => x !== null));
  });

  renderScreen(h("div", {}, playHeader(session), display.el), { wide: true });
  playKeys(session, () => focusBox(inputs.get(open()[0])));
  focusBox(inputs.get(order[0]));
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
      if (markFound(session, idx, typed)) slots[idx].append(" ", firstMark());
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
  playKeys(session, () => input.focus());
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
  const settled = (idx: number) => found(idx) || session.locked.has(idx);
  // Typed-but-unsubmitted text, kept across a switch of view.
  const drafts = new Map<number, string>();
  let inputs = new Map<number, AnswerBox>();
  let switching = false;

  function nextUnanswered(after: number): AnswerBox | null {
    const pos = order.indexOf(after);
    for (let k = 1; k <= order.length; k++) {
      const idx = order[(pos + k) % order.length];
      if (!settled(idx) && idx !== after) return inputs.get(idx) ?? null;
    }
    return null;
  }
  const firstUnanswered = () => inputs.get(order.find((idx) => !settled(idx)) ?? -1) ?? null;

  function submit(idx: number): void {
    const input = inputs.get(idx)!;
    if (input.value.trim() === "") { focusBox(nextUnanswered(idx)); return; }
    if (matchesItem(input.value, quiz.items[idx])) {
      const typed = input.value;
      drafts.delete(idx);
      // Swap the box for the answer as text, which wraps freely.
      const shown = h("div", { class: "card-answer accepted" }, quiz.items[idx].canonical);
      input.replaceWith(shown);
      inputs.delete(idx);
      const next = nextUnanswered(idx);
      if (markFound(session, idx, typed)) shown.append(" ", firstMark());
      focusBox(next);
    } else if (wrongGuess(session, input, idx)) {
      drafts.delete(idx);
      input.replaceWith(lockedAnswer(session, idx, "card-answer"));
      inputs.delete(idx);
      const next = nextUnanswered(idx);
      if (allSettled(session)) session.finish(false);
      else focusBox(next);
    }
  }

  function box(idx: number, input: AnswerBox): Node {
    if (found(idx)) return h("div", { class: "card-answer accepted" }, quiz.items[idx].canonical);
    if (session.locked.has(idx)) return lockedAnswer(session, idx, "card-answer");
    input.value = drafts.get(idx) ?? "";
    input.addEventListener("input", () => drafts.set(idx, input.value));
    input.addEventListener("focus", () => {
      // Switching views refocuses the same box; that isn't a new look at the prompt.
      if (!settled(idx) && !switching) session.timing[idx].focusedMs = session.elapsedMs();
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
    focusBox(active !== undefined ? inputs.get(active) : firstUnanswered());
    switching = false;
  });

  renderScreen(h("div", {}, playHeader(session, toggle), current), { wide: true });
  playKeys(session, () => focusBox(firstUnanswered()), () => flip(toggle));
  focusBox(inputs.get(order[0]));
}

export function showResults(quiz: Quiz, attempt: Attempt, order: number[]): void {
  // Earlier attempts of this quiz: for first-ever finds and a first clear.
  const prior = attemptsOf(quiz).filter((a) => a.endedAt < attempt.endedAt);
  const before = new Set(prior.flatMap((a) => a.found));
  const firstFinds = new Set(attempt.found.filter((ans) => !before.has(ans)));
  const firstClear = attempt.cleared && quiz.kind === "normal" && !prior.some((a) => a.cleared);
  const tag = (idx: number) => attempt.items[idx].found
    ? h("span", { class: "muted seconds mono" }, bucketOf(attempt, idx, app.cps), firstFinds.has(attempt.items[idx].answer) ? firstMark() : null)
    : null;
  // The wrong guesses made on an item, struck through, ahead of its answer.
  const guesses = (idx: number) => (attempt.items[idx].guesses ?? []).flatMap((g) => [h("s", { class: "guess" }, g), " "]);

  // Prompts and answers link to their Wikipedia articles here, where a
  // quiz says so (never during play).
  function listing(view: View): HTMLElement {
    if (quiz.diagram) {
      return diagramDisplay(quiz, (idx, node) => {
        const bucket = bucketOf(attempt, idx, app.cps);
        const item = quiz.items[idx];
        node.classList.add(bucket);
        node.dataset.tip = bucket;
        node.append(...[nodeLabel(quiz, idx), h("div", { class: "dnode-answer" }, ...guesses(idx), answerNode(item, rich(item.canonical))), nodeData(quiz, idx)]
          .filter((x): x is HTMLElement => x !== null));
      }).el;
    }
    if (quiz.mode === "prompt" && view === "cards") {
      return h("ol", { class: "prompt-grid" }, ...order.map((idx) => {
        const item = quiz.items[idx];
        return h("li", { class: `card ${bucketOf(attempt, idx, app.cps)}` },
          ...promptNode(quiz, item, true), cardData(item), h("div", { class: "card-answer" }, ...guesses(idx), answerNode(item), " ", tag(idx)));
      }));
    }
    if (quiz.mode === "prompt" || quiz.columns.length) {
      return h("table", { class: "quiz-table" }, tableHead(quiz), h("tbody", {}, ...order.map((idx) => {
        const item = quiz.items[idx];
        return h("tr", { class: bucketOf(attempt, idx, app.cps) },
          quiz.mode === "prompt" ? h("td", { class: "prompt-cell" }, ...promptNode(quiz, item, true)) : null,
          ...dataCells(quiz, item),
          h("td", { class: "answer-cell" }, ...guesses(idx), answerNode(item), " ", tag(idx)));
      })));
    }
    return h("ol", { class: "slots" }, ...order.map((idx) =>
      h("li", { class: bucketOf(attempt, idx, app.cps) }, answerNode(quiz.items[idx]), " ", tag(idx))));
  }

  let current = listing(viewOf(quiz));
  const toggle = quiz.mode === "prompt" && !quiz.diagram
    ? viewToggle(quiz, (v) => { const next = listing(v); current.replaceWith(next); current = next; })
    : null;

  const state = stateOf(quiz);
  const status: Node[] = [
    h("span", { class: "score mono" }, `${attempt.score} / ${attempt.total}`),
    h("span", { class: "muted mono" }, formatClock(attempt.durationSeconds)),
  ];
  if (quiz.kind === "normal") {
    status.push(firstClear
      ? h("span", { class: "cleared stamp first-clear" }, tembo(18), "First clear")
      : h("span", { class: attempt.cleared ? "cleared stamp" : "muted" }, attempt.cleared ? "cleared" : "not cleared"));
    if (firstFinds.size) status.push(h("span", { class: "muted first-count" }, firstMark(), ` ${firstFinds.size} first-time`));
    status.push(h("span", { class: "muted mono" }, `grade ${gradeOf(attempt, app.cps).toFixed(2)}`));
    status.push(h("span", { class: "muted" }, `next ${dueLabel(state)}`));
  }
  if (toggle) status.push(toggle);

  const actions = [
    { keys: ["Enter", "Escape"], hint: "enter", label: "Home", run: () => nav.home() },
    ...(quiz.kind === "calibration" ? [{ keys: ["a"], hint: "a", label: "Again", run: () => showPlay(quiz) }] : []),
    { keys: ["d"], hint: "d", label: "Details", run: () => nav.attempt(quiz, attempt, () => showResults(quiz, attempt, order)) },
    { keys: ["q"], hint: "q", label: "Quiz", run: () => nav.quiz(quiz) },
    ...(toggle ? [{ keys: ["v"], hint: "v", label: "", run: () => flip(toggle) }] : []),
  ];

  if (firstClear) { sounds.firstClear(); celebrate(); }
  renderScreen(
    h(
      "div",
      { class: firstClear ? "first-clear-page" : "" },
      h("header", {}, h("h1", {}, quiz.title), h("div", { class: "status" }, ...status)),
      current,
      h("div", { class: "actions keys" }, ...actions.filter((a) => a.label).map((a) =>
        h("button", { class: "key", onclick: a.run }, h("kbd", {}, a.hint), " ", a.label))),
    ),
    { wide: true },
  );
  setKeys((e) => {
    if (!plainKey(e) || typing(e)) return false;
    const a = actions.find((x) => x.keys.includes(e.key));
    if (a) a.run();
    return !!a;
  });
}
