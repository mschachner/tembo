// The home screen in the "panes" layout: the window below the banner is
// filled with bordered panes, a quiz list on the left and the highlighted
// quiz's details on the right, all driven from the keyboard (see panes.ts).
import { app, attemptsOf, importQuiz, inLibrary, playable, removeQuiz, stateOf, type Entry } from "../app";
import { tembo } from "../banner";
import { formatClock, h } from "../dom";
import { gradeOf } from "../grade";
import { isCalibration, type AnyAttempt } from "../log";
import { nav, type Tab } from "../nav";
import { mountPanes, setPanes, type KeyAction, type Pane, type Row } from "../panes";
import type { Quiz } from "../quiz/format";
import { localDate } from "../schedule";
import { openSettingsWindow } from "../bus";
import { itemStats, median, trouble } from "../stats";
import { dueLabel, fmtDate } from "./common";
import { alertLine, groups, statsView } from "./home";

const TAB_KEYS: [string, Tab][] = [["1", "today"], ["2", "library"], ["3", "watering-hole"], ["4", "stats"]];
const SPARK = "▁▂▃▄▅▆▇█";

function pane(id: string, title: string, body: HTMLElement, opts: { cols?: string; extra?: string; meta?: string } = {}): HTMLElement {
  return h("section", { class: `pane ${opts.extra ?? ""}`, "data-pane": id, style: opts.cols ? `--cols: ${opts.cols}` : null },
    h("header", { class: "pane-title" }, h("span", {}, title), opts.meta ? h("span", { class: "pane-meta" }, opts.meta) : null),
    body);
}

function cells(...xs: (string | Node | null)[]): HTMLElement[] {
  return xs.map((x) => h("span", { class: "cell" }, x ?? ""));
}

// ---------- quiz list ----------

interface ListGroup { name: string; quizzes: Quiz[] }

function quizMeta(q: Quiz, today: string): string {
  if (!inLibrary(q)) return `${q.items.length} · ${q.diagram ? "diagram" : q.mode}`;
  const st = stateOf(q);
  return [dueLabel(st, today) || (st.status === "new" ? "new" : ""), `${q.items.length}`].filter(Boolean).join(" · ");
}

function listPane(listGroups: ListGroup[], today: string, onCursor: (q: Quiz) => void, activate: (q: Quiz) => void): Pane {
  const body = h("div", { class: "pane-body" });
  const rows: Row[] = [];
  for (const g of listGroups) {
    if (!g.quizzes.length) continue;
    body.append(h("div", { class: "row-group" }, g.name));
    for (const q of g.quizzes) {
      const proficient = inLibrary(q) && stateOf(q).status === "proficient";
      const el = h("div", { class: `row quiz-row ${playable(q, stateOf(q), today) ? "playable" : ""}` },
        h("span", { class: "marker" }),
        h("span", { class: "row-title" }, q.title),
        proficient ? h("span", { class: "stamp", title: "proficient" }, tembo(16)) : null,
        h("span", { class: "row-meta" }, quizMeta(q, today)));
      body.append(el);
      rows.push({ id: q.id, el, activate: () => activate(q) });
    }
  }
  if (!rows.length) body.append(h("div", { class: "pane-empty" }, tembo(64)));
  const el = pane("list", "Quizzes", body, { extra: "list-pane" });
  return { id: "list", el, rows, body, onCursor: (row) => { const q = app.quizzes.find((x) => x.id === row.id); if (q) onCursor(q); } };
}

// ---------- detail ----------

function sparkline(attempts: AnyAttempt[]): string {
  return attempts.slice(-24).map((a) => SPARK[Math.round(Math.max(0, Math.min(1, gradeOf(a, app.cps))) * 7)]).join("");
}

function detailPanes(q: Quiz, tab: Tab, today: string): { head: HTMLElement; panes: Pane[]; grid: HTMLElement } {
  const mine = inLibrary(q);
  const st = stateOf(q);
  const own = attemptsOf(q).filter((a) => !isCalibration(a) || q.kind === "calibration");
  const facts = [
    mine ? (q.kind === "calibration" ? "calibration" : q.retired ? "retired" : st.status) : "not in library",
    mine ? dueLabel(st, today) : null,
    `${q.items.length} ${q.diagram ? "blanks" : q.mode === "prompt" ? "prompts" : "answers"}`,
    q.columns.length ? q.columns.join(", ").toLowerCase() : null,
    st.intervalDays ? `interval ${st.intervalDays.toFixed(1)}d` : null,
    own.length ? `${own.length} attempt${own.length === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");
  const last = own.at(-1);
  const head = h("section", { class: "pane detail-head" },
    h("div", { class: "detail-title" }, q.title),
    h("div", { class: "muted small" }, facts),
    own.length
      ? h("div", { class: "detail-spark" },
          h("span", { class: "spark mono", title: "grade per attempt" }, sparkline(own)),
          h("span", { class: "muted small mono" }, `last ${gradeOf(last!, app.cps).toFixed(2)} · ${last!.score}/${last!.total} · ${formatClock(last!.durationSeconds)}`))
      : null);

  const back = () => nav.home(tab);
  const panes: Pane[] = [];
  if (own.length) {
    // Items, worst first.
    const stats = itemStats(q, own, app.cps).filter((s) => s.seen > 0)
      .map((s) => ({ s, t: trouble(s) }))
      .sort((a, b) => b.t - a.t || a.s.answer.localeCompare(b.s.answer));
    const body = h("div", { class: "pane-body" }, h("div", { class: "row head" }, ...cells("answer", "missed", "slow", "median", "last")));
    const rows: Row[] = stats.map(({ s }) => {
      const med = median(s.latencies);
      const el = h("div", { class: `row ${s.last ?? ""}` }, ...cells(s.answer, String(s.missed), String(s.slow), med === null ? "" : `${med.toFixed(1)}s`, s.last ?? ""));
      body.append(el);
      return { id: s.answer, el, activate: () => nav.item(q, s.answer, back) };
    });
    panes.push({ id: "items", el: pane("items", "Items", body, { cols: "minmax(0, 1fr) 7ch 5ch 7ch 8ch" }), rows, body });

    const abody = h("div", { class: "pane-body" }, h("div", { class: "row head" }, ...cells("when", "score", "time", "grade", "")));
    const arows: Row[] = own.slice().reverse().map((a) => {
      const el = h("div", { class: "row" }, ...cells(fmtDate(a.endedAt), `${a.score}/${a.total}`, formatClock(a.durationSeconds), gradeOf(a, app.cps).toFixed(2), a.cleared ? "cleared" : ""));
      abody.append(el);
      return { id: a.endedAt, el, activate: () => nav.attempt(q, a, back) };
    });
    panes.push({ id: "attempts", el: pane("attempts", "Attempts", abody, { cols: "17ch 7ch 6ch 6ch minmax(0, 1fr)" }), rows: arows, body: abody });
  } else if (!q.diagram && (q.mode === "prompt" || q.columns.length)) {
    // Not played yet: what the quiz asks, without the answers.
    const labels = [q.mode === "prompt" ? (q.promptLabel || "prompt") : null, ...q.columns.map((c) => c.toLowerCase())].filter((x): x is string => x !== null);
    const body = h("div", { class: "pane-body" }, h("div", { class: "row head" }, ...cells(...labels)));
    const rows: Row[] = q.items.map((it, i) => {
      const el = h("div", { class: "row" }, ...cells(...(q.mode === "prompt" ? [it.prompt?.text ?? ""] : []), ...it.data));
      body.append(el);
      return { id: String(i), el };
    });
    panes.push({ id: "preview", el: pane("preview", q.mode === "prompt" ? "Prompts" : "Clues", body, { cols: `repeat(${labels.length}, minmax(0, 1fr))` }), rows, body });
  }
  const grid = h("div", { class: `detail-grid ${panes.length === 2 ? "two" : ""}` }, ...panes.map((p) => p.el));
  return { head, panes, grid };
}

// ---------- the screen ----------

function attemptQuiz(a: AnyAttempt): Quiz | undefined {
  return app.quizzes.find((q) => q.id === ("quizId" in a ? a.quizId : undefined)) ?? app.quizzes.find((q) => q.title === a.title);
}

export function panesView(tab: Tab): { el: HTMLElement; mount: () => void } {
  const today = localDate(new Date());
  const legend = h("nav", { class: "keys" });
  const root = h("div", { class: "panes" });
  let selected: Quiz | null = null;

  if (tab === "stats") {
    const body = h("div", { class: "pane-body" }, statsView());
    const p: Pane = { id: "stats", el: pane("stats", "Stats", body, { extra: "full" }), rows: [], body };
    root.append(p.el);
    return { el: h("div", { class: "panes-wrap" }, legend, root), mount: () => mountPanes({ scope: tab, root, legend, panes: [p], actions: () => globalActions(tab) }) };
  }

  // Left: the list for this tab.
  const g = groups(today);
  const listGroups: ListGroup[] =
    tab === "today" ? [
      { name: "Due", quizzes: g.due.map((e) => e.quiz) },
      { name: "New", quizzes: g.fresh.map((e) => e.quiz) },
      { name: "Coming up", quizzes: [...g.upcoming, ...g.proficient].sort(byDue).map((e) => e.quiz) },
    ]
    : tab === "library" ? [
      { name: "Due", quizzes: g.due.map((e) => e.quiz) },
      { name: "New", quizzes: g.fresh.map((e) => e.quiz) },
      { name: "Upcoming", quizzes: g.upcoming.map((e) => e.quiz) },
      { name: "Proficient", quizzes: g.proficient.map((e) => e.quiz) },
      { name: "Retired", quizzes: g.retired.map((e) => e.quiz) },
      { name: "Calibration", quizzes: g.calibration.map((e) => e.quiz) },
    ]
    : (() => {
      const shown = app.quizzes.filter((q) => q.kind === "normal" && !q.retired)
        .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
      return [
        { name: "Available", quizzes: shown.filter((q) => !inLibrary(q)) },
        { name: "In your library", quizzes: shown.filter(inLibrary) },
      ];
    })();

  // Right: details of the cursor quiz, redrawn as the cursor moves.
  const detail = h("div", { class: "detail" });
  let detailIds: string[] = [];
  const showDetail = (q: Quiz) => {
    selected = q;
    const d = detailPanes(q, tab, today);
    detail.replaceChildren(d.head, d.grid);
    setPanes(detailIds, d.panes);
    detailIds = d.panes.map((p) => p.id);
  };
  const activate = (q: Quiz) => {
    if (tab === "watering-hole") nav.quiz(q);
    else if (playable(q, stateOf(q), today)) nav.play(q);
    else nav.quiz(q);
  };
  const list = listPane(listGroups, today, showDetail, activate);
  if (!list.rows.length) {
    detail.append(h("div", { class: "pane detail-empty" },
      tembo(120),
      tab === "today" ? h("div", { class: "empty-title" }, "No quizzes left today") : null,
      h("div", { class: "empty-slot" } /* copy slot: Mark's own words for the empty state */)));
  }
  root.append(list.el, detail);

  // Bottom (Today): today's results.
  const fixed: Pane[] = [list];
  if (tab === "today") {
    const todays = app.attempts.filter((a) => localDate(new Date(a.endedAt)) === today && !isCalibration(a)).slice().reverse();
    if (todays.length) {
      const body = h("div", { class: "pane-body" }, h("div", { class: "row head" }, ...cells("when", "quiz", "score", "time", "grade", "")));
      const rows: Row[] = todays.map((a) => {
        const q = attemptQuiz(a);
        const el = h("div", { class: "row" }, ...cells(fmtDate(a.endedAt).slice(11), a.title, `${a.score}/${a.total}`, formatClock(a.durationSeconds), gradeOf(a, app.cps).toFixed(2), a.cleared ? "cleared" : ""));
        body.append(el);
        return { id: a.endedAt, el, activate: q ? () => nav.attempt(q, a, () => nav.home(tab)) : undefined };
      });
      const p: Pane = { id: "results", el: pane("results", "Today's results", body, { extra: "bottom", cols: "7ch minmax(0, 1fr) 7ch 6ch 6ch 8ch" }), rows, body };
      root.append(p.el);
      root.classList.add("with-bottom");
      fixed.push(p);
    }
  }

  const actions = (p: Pane | null, row: Row | null): KeyAction[] => {
    const out: KeyAction[] = [];
    if (p?.id === "list" && selected) {
      const q = selected;
      if (tab === "watering-hole") {
        out.push({ keys: ["Enter", "o"], hint: "enter", label: "Open", run: () => nav.quiz(q) });
        if (inLibrary(q)) out.push({ keys: ["x"], hint: "x", label: "Remove", run: () => act(() => removeQuiz(q)) });
        else out.push({ keys: ["i"], hint: "i", label: "Import", run: () => act(() => importQuiz(q)) });
      } else {
        const canPlay = playable(q, stateOf(q), today);
        out.push({ keys: ["Enter"], hint: "enter", label: canPlay ? "Play" : "Open", run: () => activate(q) });
        if (canPlay) {
          out.push({ keys: ["p"], hint: "p", label: "Play", run: () => nav.play(q) });
          out.push({ keys: ["o"], hint: "o", label: "Open", run: () => nav.quiz(q) });
        } else {
          out.push({ keys: ["o"], hint: "o", label: "", run: () => nav.quiz(q) });
        }
      }
    } else if (row?.activate) {
      out.push({ keys: ["Enter"], hint: "enter", label: "Open", run: row.activate });
    }
    return [...out, ...globalActions(tab)];
  };
  const act = async (fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { alertLine(String(e)); }
    nav.home(tab);
  };

  return {
    el: h("div", { class: "panes-wrap" }, legend, root),
    mount: () => mountPanes({ scope: tab, root, legend, panes: fixed, actions }),
  };
}

function byDue(a: Entry, b: Entry): number {
  return a.state.dueDate!.localeCompare(b.state.dueDate!);
}

function globalActions(tab: Tab): KeyAction[] {
  return [
    // Legend-only entries (no keys of their own; panes.ts handles Tab).
    { keys: [], hint: "tab", label: "Pane", run: () => {} },
    { keys: [], hint: "1–4", label: "Tabs", run: () => {} },
    ...TAB_KEYS.map(([k, t]) => ({ keys: [k], hint: k, label: "", run: () => { if (t !== tab) nav.home(t); } })),
    { keys: [","], hint: "⌘,", label: "Settings", run: () => void openSettingsWindow(() => nav.home("settings")) },
  ];
}
