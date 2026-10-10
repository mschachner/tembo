// The home screen: the window below the banner is filled with bordered
// panes, a quiz list on the left and the highlighted quiz's details on the
// right, all driven from the keyboard (see panes.ts). The quiz details are
// also the body of the quiz screen (detail.ts).
import { app, attemptsOf, importQuiz, inLibrary, playable, removeQuiz, stateOf, type Entry } from "../app";
import { tembo } from "../banner";
import { formatClock, h } from "../dom";
import { gradeOf, INSTANT_SECONDS, itemLatency } from "../grade";
import { isCalibration, type AnyAttempt } from "../log";
import { nav, type Tab } from "../nav";
import { mountPanes, paneEl, setPanes, tablePane, type KeyAction, type Pane, type Row } from "../panes";
import type { Quiz } from "../quiz/format";
import { localDate } from "../schedule";
import { openSettingsWindow } from "../bus";
import { itemStats, median, trouble, type ItemStats } from "../stats";
import { dueLabel, fmtDate } from "./common";
import { alertLine, groups } from "./home";
import { rich } from "../rich";

const TAB_KEYS: [string, Tab][] = [["1", "today"], ["2", "library"], ["3", "watering-hole"], ["4", "stats"]];
const SPARK = "▁▂▃▄▅▆▇█";

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
  const el = paneEl("list", "Quizzes", body, { extra: "list-pane" });
  return { id: "list", el, rows, body, onCursor: (row) => { const q = app.quizzes.find((x) => x.id === row.id); if (q) onCursor(q); } };
}

// ---------- quiz details ----------

function sparkline(attempts: AnyAttempt[]): string {
  return attempts.slice(-24).map((a) => SPARK[Math.round(Math.max(0, Math.min(1, gradeOf(a, app.cps))) * 7)]).join("");
}

// The head (title, facts, grade sparkline) and the panes below it: items
// worst first and attempts newest first, or for a quiz not played yet, its
// prompts. `full` (the quiz screen) shows every item column; the home
// screen's narrower detail area shows fewer. `back` returns to the screen
// these are shown on, from the item and attempt screens.
export function detailPanes(q: Quiz, back: () => void, today: string, full = false): { head: HTMLElement; panes: Pane[]; grid: HTMLElement } {
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

  const panes: Pane[] = [];
  if (own.length) {
    const stats = itemStats(q, own, app.cps).filter((s) => s.seen > 0)
      .map((s) => ({ s, t: trouble(s) }))
      .sort((a, b) => b.t - a.t || a.s.answer.localeCompare(b.s.answer))
      .map(({ s }) => s);
    const med = (s: ItemStats) => { const m = median(s.latencies); return m === null ? "" : `${m.toFixed(1)}s`; };
    panes.push(tablePane<ItemStats>({
      id: "items", title: "Items", entries: stats, key: (s) => s.answer,
      rowClass: (s) => s.last ?? "",
      activate: (s) => () => nav.item(q, s.answer, back),
      ...(full
        ? { cols: "minmax(0, 1fr) 5ch 8ch 5ch 7ch 7ch 8ch", head: ["answer", "seen", "instant", "slow", "missed", "median", "last"],
            cells: (s) => [rich(s.answer), String(s.seen), String(s.instant), String(s.slow), String(s.missed), med(s), s.last ?? ""] }
        : { cols: "minmax(0, 1fr) 7ch 5ch 7ch 8ch", head: ["answer", "missed", "slow", "median", "last"],
            cells: (s) => [rich(s.answer), String(s.missed), String(s.slow), med(s), s.last ?? ""] }),
    }));
    panes.push(tablePane({
      id: "attempts", title: "Attempts", entries: own.slice().reverse(), key: (a) => a.endedAt,
      cols: "17ch 7ch 6ch 6ch minmax(0, 1fr)", head: ["when", "score", "time", "grade", ""],
      cells: (a) => [fmtDate(a.endedAt), `${a.score}/${a.total}`, formatClock(a.durationSeconds), gradeOf(a, app.cps).toFixed(2), a.cleared ? "cleared" : ""],
      activate: (a) => () => nav.attempt(q, a, back),
    }));
  } else if (!q.diagram && (q.mode === "prompt" || q.columns.length)) {
    // Not played yet: what the quiz asks, without the answers.
    const labels = [q.mode === "prompt" ? (q.promptLabel || "prompt") : null, ...q.columns.map((c) => c.toLowerCase())].filter((x): x is string => x !== null);
    panes.push(tablePane({
      id: "preview", title: q.mode === "prompt" ? "Prompts" : "Clues", entries: q.items, key: (_, i) => String(i),
      cols: `repeat(${labels.length}, minmax(0, 1fr))`, head: labels,
      cells: (it) => [...(q.mode === "prompt" ? [it.prompt?.text ?? ""] : []), ...it.data],
    }));
  }
  const grid = h("div", { class: `detail-grid ${panes.length === 2 ? "two" : ""}` }, ...panes.map((p) => p.el));
  return { head, panes, grid };
}

// ---------- stats ----------

function statsPanes(root: HTMLElement): Pane[] {
  const normal = app.attempts.filter((a) => !isCalibration(a));
  const latencies: number[] = [];
  const buckets = { instant: 0, slow: 0, missed: 0 };
  for (const a of normal) {
    if (a.version !== 2) continue;
    for (let i = 0; i < a.items.length; i++) {
      const lat = itemLatency(a, i, app.cps);
      if (lat === null) buckets.missed++;
      else { latencies.push(lat); if (lat < INSTANT_SECONDS) buckets.instant++; else buckets.slow++; }
    }
  }
  const byDay = new Map<string, { attempts: number; cleared: number }>();
  for (const a of normal) {
    const d = localDate(new Date(a.endedAt));
    const row = byDay.get(d) ?? { attempts: 0, cleared: 0 };
    row.attempts++;
    if (a.cleared) row.cleared++;
    byDay.set(d, row);
  }
  const med = median(latencies);
  const facts = [
    `${normal.length} attempts`,
    `${normal.filter((a) => a.cleared).length} cleared`,
    `${buckets.instant} instant · ${buckets.slow} slow · ${buckets.missed} missed`,
    med === null ? null : `median latency ${med.toFixed(1)}s`,
    `typing ${app.cps.toFixed(1)} ch/s`,
  ].filter(Boolean).join(" · ");

  const days = tablePane({
    id: "days", title: "By day", entries: [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])), key: ([d]) => d,
    cols: "minmax(0, 1fr) 9ch 8ch", head: ["day", "attempts", "cleared"],
    cells: ([d, r]) => [d, String(r.attempts), String(r.cleared)],
  });
  const recent = tablePane({
    id: "recent", title: "Recent attempts", entries: normal.slice().reverse(), key: (a) => a.endedAt,
    cols: "17ch minmax(0, 1fr) 7ch 6ch 6ch 8ch", head: ["when", "quiz", "score", "time", "grade", ""],
    cells: (a) => [fmtDate(a.endedAt), a.title, `${a.score}/${a.total}`, formatClock(a.durationSeconds), gradeOf(a, app.cps).toFixed(2), a.cleared ? "cleared" : ""],
    activate: (a) => { const q = attemptQuiz(a); return q ? () => nav.attempt(q, a, () => nav.home("stats")) : undefined; },
  });
  root.classList.add("stats-panes");
  root.append(h("section", { class: "pane detail-head full" }, h("div", { class: "muted small" }, facts)), recent.el, days.el);
  return [recent, days];
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
    const panes = statsPanes(root);
    const actions = (_p: Pane | null, row: Row | null): KeyAction[] => [
      ...(row?.activate ? [{ keys: ["Enter"], hint: "enter", label: "Open", run: row.activate }] : []),
      ...globalActions(tab),
    ];
    return { el: h("div", { class: "panes-wrap" }, legend, root), mount: () => mountPanes({ scope: tab, root, legend, panes, actions }) };
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
    const d = detailPanes(q, () => nav.home(tab), today);
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
      const p = tablePane({
        id: "results", title: "Today's results", entries: todays, key: (a) => a.endedAt, extra: "bottom",
        cols: "7ch minmax(0, 1fr) 7ch 6ch 6ch 8ch", head: ["when", "quiz", "score", "time", "grade", ""],
        cells: (a) => [fmtDate(a.endedAt).slice(11), a.title, `${a.score}/${a.total}`, formatClock(a.durationSeconds), gradeOf(a, app.cps).toFixed(2), a.cleared ? "cleared" : ""],
        activate: (a) => { const q = attemptQuiz(a); return q ? () => nav.attempt(q, a, () => nav.home(tab)) : undefined; },
      });
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
    { keys: [], hint: "1–4", label: "Tabs", run: () => {} },
    ...TAB_KEYS.map(([k, t]) => ({ keys: [k], hint: k, label: "", run: () => { if (t !== tab) nav.home(t); } })),
    // [ and ] step through the tabs.
    { keys: ["["], hint: "[", label: "", run: () => stepTab(tab, -1) },
    { keys: ["]"], hint: "]", label: "", run: () => stepTab(tab, 1) },
    { keys: [","], hint: "⌘,", label: "Settings", run: () => void openSettingsWindow(() => nav.home("settings")) },
  ];
}

function stepTab(tab: Tab, delta: number): void {
  const i = TAB_KEYS.findIndex(([, t]) => t === tab);
  const next = TAB_KEYS[(i + delta + TAB_KEYS.length) % TAB_KEYS.length][1];
  nav.home(next);
}
