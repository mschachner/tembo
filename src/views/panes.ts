// The home screen: the window below the banner is filled with bordered
// panes, a list on the left (quizzes on Today, series on Library and the
// Watering Hole) and the highlighted row's details on the right, all driven
// from the keyboard (see panes.ts). The quiz details are also the body of
// the quiz screen (detail.ts).
import {
  app, attemptsOf, entries, importSeries, inLibrary, locked, lockedQuizzes, lockReason, persistSettings, playable,
  removeSeries, seriesDue, seriesInLibrary, seriesStatus, stateOf, type SeriesStatus,
} from "../app";
import { tembo } from "../banner";
import { formatClock, h } from "../dom";
import { gradeOf } from "../grade";
import { isCalibration, type AnyAttempt } from "../log";
import { nav, type Tab } from "../nav";
import { focusPane, mountPanes, paneEl, setPanes, tablePane, type KeyAction, type Pane, type Row } from "../panes";
import { topicOf, type Item, type Quiz, type Series } from "../quiz/format";
import { localDate, type QuizState } from "../schedule";
import { openSettingsWindow } from "../bus";
import { itemStats, median, trouble, type ItemStats } from "../stats";
import { answerNode, dueLabel, fmtDate, promptNode } from "./common";
import { diagramDisplay, nodeData, nodeLabel } from "./diagram";
import { alertLine, groups } from "./home";
import { rich } from "../rich";
import { calendar, columns, figure, lines, segments, tile, tiles, type Fill } from "../charts";
import {
  activityByDay, byTopic, dayOf, forecast, formatDuration, histogram, instantBin, itemHistory, lastDays, latenciesOf,
  libraryKnowledge, longestStreak, pct, quizSummary, streak, troubleItems, bucketsOf, emptyBuckets,
} from "../insights";

const TAB_KEYS: [string, Tab][] = [["1", "today"], ["2", "library"], ["3", "watering-hole"], ["4", "stats"]];

// ---------- the list ----------

// A row of the list: a quiz (Today) or a series (Library, Watering Hole).
interface ListRow {
  id: string;
  title: string;
  meta: string;
  playable: boolean;     // filled marker
  locked: boolean;       // dotted marker, dimmer title
  proficient: boolean;   // the elephant stamp
}

interface ListGroup { name: string; rows: ListRow[] }

function quizRow(q: Quiz, today: string): ListRow {
  const st = stateOf(q);
  return {
    id: q.id, title: q.title, playable: playable(q, st, today), locked: locked(q), proficient: inLibrary(q) && st.status === "proficient",
    meta: locked(q) ? `locked · ${q.items.length}` : [dueLabel(st, today) || (st.status === "new" ? "new" : ""), `${q.items.length}`].filter(Boolean).join(" · "),
  };
}

// A series' row: its shape (chunks × levels) and where it stands.
function seriesRow(s: Series, today: string, inHole: boolean): ListRow {
  const mine = seriesInLibrary(s);
  const status = seriesStatus(s, today);
  const shape = [s.chunks.length > 1 ? `${s.chunks.length} chunks` : null, s.levels.length > 1 ? `${s.levels.length} levels` : null].filter(Boolean).join(" × ")
    || `${s.quizzes[0]?.items.length ?? 0} · ${s.quizzes[0]?.diagram ? "diagram" : s.quizzes[0]?.mode ?? ""}`;
  const where = !mine ? "" : status === "due" ? dueLabel(soonest(s), today) : status === "new" ? "new" : status === "upcoming" ? dueLabel(soonest(s), today) : status;
  return {
    id: s.id, title: s.title, playable: mine && s.quizzes.some((q) => playable(q, stateOf(q), today)), locked: false, proficient: mine && status === "proficient",
    meta: [shape, inHole && mine ? "in library" : where].filter(Boolean).join(" · "),
  };
}

// The state of the series' most pressing quiz, for its due label.
function soonest(s: Series): QuizState {
  const due = seriesDue(s);
  const q = s.quizzes.find((x) => !locked(x) && stateOf(x).dueDate === due) ?? s.quizzes[0];
  return stateOf(q);
}

function listPane(listGroups: ListGroup[], onCursor: (id: string) => void, activate: (id: string) => void, opts: { meta?: string } = {}): Pane {
  const body = h("div", { class: "pane-body" });
  const rows: Row[] = [];
  for (const g of listGroups) {
    if (!g.rows.length) continue;
    body.append(h("div", { class: "row-group" }, g.name));
    for (const r of g.rows) {
      const el = h("div", { class: `row quiz-row ${r.playable ? "playable" : ""} ${r.locked ? "locked" : ""}` },
        h("span", { class: "marker" }),
        h("span", { class: "row-title" }, r.title),
        r.proficient ? h("span", { class: "stamp", title: "proficient" }, tembo(16)) : null,
        h("span", { class: "row-meta" }, r.meta));
      body.append(el);
      rows.push({ id: r.id, el, activate: () => activate(r.id) });
    }
  }
  if (!rows.length) body.append(h("div", { class: "pane-empty" }, tembo(64)));
  const el = paneEl("list", "Quizzes", body, { extra: "list-pane", meta: opts.meta });
  return { id: "list", el, rows, body, onCursor: (row) => onCursor(row.id) };
}

// Series grouped by topic (first tag), untagged last; within a topic the
// ones with something to play come first, then by due date, then by title.
function byTopicGroups(series: Series[], today: string): ListGroup[] {
  const map = new Map<string, Series[]>();
  for (const s of series) {
    const t = topicOf(s) || "untagged";
    map.set(t, [...(map.get(t) ?? []), s]);
  }
  const rank = (s: Series) => !seriesInLibrary(s) ? 2 : s.quizzes.some((q) => playable(q, stateOf(q), today)) ? 0 : 1;
  const due = (s: Series) => (seriesInLibrary(s) ? seriesDue(s) : "~");
  return [...map.entries()]
    .sort((a, b) => (a[0] === "untagged" ? 1 : 0) - (b[0] === "untagged" ? 1 : 0) || a[0].localeCompare(b[0]))
    .map(([name, ss]) => ({ name, rows: ss.sort((a, b) => rank(a) - rank(b) || due(a).localeCompare(due(b)) || a.title.localeCompare(b.title, undefined, { numeric: true })).map((x) => seriesRow(x, today, false)) }));
}

// Series by where they stand, in the Library's order.
function byStatusGroups(series: Series[], today: string): ListGroup[] {
  const order: [SeriesStatus, string][] = [["due", "Due"], ["new", "New"], ["upcoming", "Upcoming"], ["proficient", "Proficient"], ["retired", "Retired"], ["calibration", "Calibration"]];
  const status = new Map(series.map((s) => [s.id, seriesStatus(s, today)]));
  const byDue = (a: Series, b: Series) => seriesDue(a).localeCompare(seriesDue(b)) || a.title.localeCompare(b.title, undefined, { numeric: true });
  return order.map(([st, name]) => ({ name, rows: series.filter((s) => status.get(s.id) === st).sort(byDue).map((s) => seriesRow(s, today, false)) }));
}

// ---------- series details ----------

const statusWord = (q: Quiz, today: string): string =>
  locked(q) ? "locked" : !inLibrary(q) ? "" : q.retired ? "retired" : stateOf(q).status === "new" ? "new" : stateOf(q).status === "proficient" ? "proficient" : dueLabel(stateOf(q), today) || "learning";

// The chunk × level grid: one row per chunk, one column per level, each
// cell saying where that quiz stands. Chunk labels and the level header are
// left out when there is only one.
function seriesGrid(s: Series, today: string): HTMLElement {
  const cellFill = (q: Quiz | undefined): string => {
    if (!q) return "none";
    if (locked(q)) return "locked";
    if (!inLibrary(q)) return "available";
    const st = stateOf(q);
    return st.status === "proficient" ? "proficient" : playable(q, st, today) ? "playable" : st.status === "new" ? "new" : "learning";
  };
  const cellText = (q: Quiz | undefined): string => !q ? "—" : !inLibrary(q) && !locked(q) ? `${q.items.length} items` : statusWord(q, today);
  const labels = s.chunks.length > 1;
  const header = s.levels.length > 1
    ? h("div", { class: "grid-row head" }, labels ? h("span", { class: "grid-cell corner" }) : null, ...s.levels.map((l) => h("span", { class: "grid-cell" }, l)))
    : null;
  const rows = s.chunks.map((c) => h("div", { class: "grid-row" },
    labels ? h("span", { class: "grid-cell chunk" }, c) : null,
    ...s.levels.map((l) => {
      const q = s.quizzes.find((x) => x.chunk === c && x.level === l);
      return h("span", { class: `grid-cell ${cellFill(q)}`, title: q?.title ?? "" }, cellText(q));
    })));
  return figure("Grid", h("div", { class: "series-grid", style: `--cols: ${labels ? "minmax(0, 1.2fr) " : ""}repeat(${s.levels.length}, minmax(0, 1fr))` }, header, ...rows),
    `${s.chunks.length} chunk${s.chunks.length === 1 ? "" : "s"} × ${s.levels.length} level${s.levels.length === 1 ? "" : "s"}`);
}

// A series with one quiz is shown as that quiz; otherwise the head sums
// the series up, the grid shows the shape, and the Quizzes pane lists each
// quiz for opening.
export function seriesPanes(s: Series, back: () => void, today: string): { head: HTMLElement; panes: Pane[]; grid: HTMLElement } {
  if (s.quizzes.length === 1) return detailPanes(s.quizzes[0], back, today);
  const mine = seriesInLibrary(s);
  const status = seriesStatus(s, today);
  const live = s.quizzes.filter((q) => !q.retired);
  const open = live.filter((q) => !locked(q));
  const own = live.flatMap((q) => attemptsOf(q));
  const facts = [
    mine ? status : "not in library",
    mine && (status === "due" || status === "upcoming") ? dueLabel(soonest(s), today) : null,
    `${s.quizzes.length} quizzes`,
    `${s.quizzes.reduce((n, q) => n + q.items.length, 0)} items`,
    s.tags.length ? s.tags.join(", ") : null,
  ].filter(Boolean).join(" · ");
  const counts = { proficient: open.filter((q) => stateOf(q).status === "proficient").length, learning: open.filter((q) => stateOf(q).status === "learning").length, fresh: open.filter((q) => stateOf(q).status === "new").length, locked: live.length - open.length };
  const know = mine ? libraryKnowledge(open, attemptsOf, app.cps) : null;
  const tileRow = mine ? tiles(
    tile("Quizzes", `${counts.proficient}/${live.length}`, [`${counts.learning} learning`, `${counts.fresh} new`, counts.locked ? `${counts.locked} locked` : null].filter(Boolean).join(" · ")),
    know ? tile("Known", `${know.known}/${know.items}`, `${know.shaky} shaky · ${know.unknown} unknown`) : null,
    tile("Attempts", String(own.length), own.length ? `${own.filter((a) => a.cleared).length} cleared` : null),
  ) : null;
  const head = h("section", { class: "pane detail-head" },
    h("div", { class: "detail-title" }, s.title),
    h("div", { class: "muted small" }, facts),
    tileRow);

  const chunkCol = s.chunks.length > 1, levelCol = s.levels.length > 1;
  const quizzes = s.quizzes.slice().sort((a, b) => s.chunks.indexOf(a.chunk) - s.chunks.indexOf(b.chunk) || s.levels.indexOf(a.level) - s.levels.indexOf(b.level));
  const table = tablePane<Quiz>({
    id: "quizzes", title: "Quizzes", entries: quizzes, key: (q) => q.id,
    cols: [chunkCol ? "minmax(0, 1fr)" : null, levelCol ? "minmax(0, 1fr)" : null, "11ch", "6ch", "8ch"].filter(Boolean).join(" "),
    head: [chunkCol ? "chunk" : null, levelCol ? "level" : null, "status", "items", "attempts"].filter((x): x is string => x !== null),
    rowClass: (q) => locked(q) ? "locked" : inLibrary(q) && stateOf(q).status === "proficient" ? "instant" : "",
    cells: (q) => [...(chunkCol ? [q.chunk] : []), ...(levelCol ? [q.level] : []), mine ? statusWord(q, today) : q.diagram ? "diagram" : q.mode, String(q.items.length), String(attemptsOf(q).length)],
    activate: (q) => () => nav.quiz(q),
  });
  const grid = h("div", { class: "detail-grid rich" }, h("div", { class: "figures one" }, seriesGrid(s, today)), h("div", { class: "tables" }, table.el));
  return { head, panes: [table], grid };
}

// ---------- quiz details ----------

const bucketFill = (b: string | null): Fill | null => b === "instant" ? "instant" : b === "slow" || b === "untimed" ? "slow" : b === "missed" ? "missed" : null;

function unit(value: string, u: string): HTMLElement {
  return h("span", {}, value, h("span", { class: "unit" }, u));
}

// Figures for a quiz that has been played: key numbers, then charts.
// `full` (the quiz screen) adds the rest of the numbers; the home screen's
// detail area shows the essentials.
function quizFigures(q: Quiz, own: AnyAttempt[], today: string, full: boolean): { tileRow: HTMLElement; charts: HTMLElement } {
  const st = stateOf(q);
  const sm = quizSummary(q, own, app.cps);
  const last = own.at(-1)!;
  const n = q.items.length;
  const tileRow = tiles(
    tile("Attempts", String(sm.attempts), sm.daysPlayed > 1 ? `${sm.daysPlayed} days` : null),
    tile("Cleared", String(sm.clears), pct(sm.clears, sm.attempts)),
    tile("Best", `${sm.bestScore ?? 0}/${n}`, sm.bestTime !== null ? `${formatClock(sm.bestTime)} best time` : null),
    tile("Last grade", gradeOf(last, app.cps).toFixed(2), `${last.score}/${last.total} · ${formatClock(last.durationSeconds)}`),
    tile("Known", `${sm.known}/${n}`, `${sm.shaky} shaky · ${sm.unknown} unknown`),
    tile("Median latency", sm.medianLatency === null ? "–" : unit(sm.medianLatency.toFixed(1), "s"), full && sm.meanTime !== null ? `${formatClock(sm.meanTime)} mean time` : null),
    full ? tile("Interval", st.intervalDays ? unit(st.intervalDays.toFixed(st.intervalDays < 10 ? 1 : 0), "d") : "–", st.dueDate ? dueLabel(st, today) : null) : null,
    full ? tile("First played", sm.firstPlayed ?? "–", sm.lastPlayed && sm.lastPlayed !== sm.firstPlayed ? `last ${sm.lastPlayed}` : null) : null,
  );

  const dates = own.map((a) => dayOf(a));
  const tips = own.map((a, i) => `${fmtDate(a.endedAt)}: ${a.score}/${a.total}, grade ${sm.grades[i].toFixed(2)}, ${formatClock(a.durationSeconds)}${a.cleared ? ", cleared" : ""}`);
  const progress = figure("Progress", lines(
    [{ points: sm.scores, fill: "accent", name: "score" }, { points: sm.grades, fill: "fg2", name: "grade" }],
    { max: 1, labels: own.length > 1 ? [dates[0], dates.at(-1)!] : undefined, tips, height: full ? 88 : 64 }),
    `${own.length} attempt${own.length === 1 ? "" : "s"}`);

  const width = 0.5, bins = 12;
  const hist = histogram(sm.latencies, width, bins);
  const latency = figure("Recall latency", columns(
    hist.map((v, i) => ({ value: v, label: i === bins - 1 ? `${i * width}s+` : `${i * width}`, tip: `${i * width}–${i === bins - 1 ? "…" : `${(i + 1) * width}s`}: ${v} answer${v === 1 ? "" : "s"}` })),
    { height: full ? 88 : 64, labels: "ends", marker: instantBin(width) / bins, markerTip: `instant below ${sm.medianLatency === null ? "" : ""}${(instantBin(width) * width).toFixed(1)}s` }),
    sm.medianLatency === null ? undefined : `median ${sm.medianLatency.toFixed(1)}s`);

  const results = figure("Results", segments([
    { value: sm.buckets.instant, fill: "instant", label: "instant" },
    { value: sm.buckets.slow, fill: "slow", label: "slow" },
    { value: sm.buckets.missed, fill: "missed", label: "missed" },
  ]), "all attempts");

  const charts = h("div", { class: `figures ${full ? "three" : "two"}` }, progress, latency, full ? results : null);
  return { tileRow, charts };
}

// How many of the latest attempts the answer key's history column shows.
const KEY_HISTORY = 16;

// A key row's id, and the item a row id names (undefined for other rows).
const keyRowId = (i: number) => `item:${i}`;
export function keyItem(q: Quiz, rowId: string | undefined): Item | undefined {
  const m = /^item:(\d+)$/.exec(rowId ?? "");
  return m ? q.items[Number(m[1])] : undefined;
}

// The answer key of a quiz that has been played: every item, clue then
// answer, with how it has gone; in quiz order, or the most troublesome
// first. `full` (the quiz screen) adds the data columns, each item's result
// in the latest attempts, and all the counts. With `hidden` the answers are
// left out (and nothing links or opens), so the key can't spoil a quiz that
// is waiting to be played; that leaves nothing to show for a quiz whose
// items have no clues.
function keyPane(q: Quiz, own: AnyAttempt[], back: () => void, opts: { full: boolean; hidden: boolean; worstFirst: boolean }): Pane | null {
  const withClue = q.items.some((it) => it.prompt);
  const data = opts.full || !withClue ? q.columns : [];
  if (opts.hidden && !withClue && !data.length) return null;
  const stats = itemStats(q, own, app.cps);
  const shown = own.slice(-KEY_HISTORY);
  const hist = opts.full ? itemHistory(shown, app.cps, q.items.map((it) => it.canonical)) : [];
  const rows = q.items.map((item, i) => ({ item, i, s: stats[i] }));
  if (opts.worstFirst) rows.sort((a, b) => trouble(b.s) - trouble(a.s) || a.i - b.i);

  const med = (s: ItemStats) => { const m = median(s.latencies); return m === null ? "" : `${m.toFixed(1)}s`; };
  const strip = (i: number) => h("span", { class: "key-history" }, ...hist[i].map((b, k) =>
    h("i", { class: bucketFill(b) ? `c-${bucketFill(b)}` : "empty", title: `${fmtDate(shown[k].endedAt)}: ${b ?? "not in quiz"}` })));
  const head = [
    ...(withClue ? [q.promptLabel.toLowerCase() || "clue"] : []),
    ...data.map((c) => c.toLowerCase()),
    ...(opts.hidden ? [] : [q.answerLabel.toLowerCase() || "answer"]),
    ...(opts.full ? ["history", "seen", "instant", "slow", "missed", "median"] : ["missed", "slow", "median"]),
  ];
  const cols = [
    // The answers take the room left over; without them, the clues do.
    ...(withClue ? [opts.hidden ? "minmax(0, 1fr)" : "fit-content(34%)"] : []),
    ...data.map(() => "fit-content(20%)"),
    ...(opts.hidden ? [] : ["minmax(0, 1fr)"]),
    ...Array.from({ length: opts.full ? 6 : 3 }, () => "max-content"),
  ];
  return tablePane({
    id: "key", title: opts.hidden ? "Clues" : "Answer key", entries: rows, key: (r) => keyRowId(r.i), extra: "key", fit: true,
    cols: cols.join(" "), head,
    meta: [opts.hidden ? "answers hidden until played" : null, opts.worstFirst ? "worst first" : "quiz order", opts.full && shown.length ? `history: last ${shown.length}, oldest left` : null].filter(Boolean).join(" · "),
    rowClass: (r) => r.s.last ?? "",
    cells: (r) => [
      ...(withClue ? [h("span", { class: "key-clue" }, ...(r.item.prompt ? promptNode(q, r.item, !opts.hidden) : []))] : []),
      ...data.map((_, k) => r.item.data[k] ?? ""),
      ...(opts.hidden ? [] : [h("span", { class: "key-answer" }, answerNode(r.item, rich(r.item.canonical)))]),
      ...(opts.full ? [strip(r.i), String(r.s.seen), String(r.s.instant)] : []),
      ...(opts.full ? [String(r.s.slow), String(r.s.missed)] : [String(r.s.missed), String(r.s.slow)]),
      med(r.s),
    ],
    activate: (r) => opts.hidden ? undefined : () => nav.item(q, r.item.canonical, back),
  });
}

// A diagram quiz's key is also drawn: the diagram filled in, each node
// colored by how it last went.
function keyDiagram(q: Quiz, own: AnyAttempt[]): HTMLElement {
  const stats = itemStats(q, own, app.cps);
  return figure("Diagram", diagramDisplay(q, (idx, node) => {
    const last = stats[idx].last;
    if (last) { node.classList.add(last === "untimed" ? "slow" : last); node.title = last; }
    node.append(...[nodeLabel(q, idx), h("div", { class: "dnode-answer" }, answerNode(q.items[idx], rich(q.items[idx].canonical))), nodeData(q, idx)]
      .filter((x): x is HTMLElement => x !== null));
  }).el, "by last result");
}

// The head (title, facts, figures) and the panes below it: the answer key
// and the attempts, newest first, or for a quiz not played yet, its
// prompts. On the quiz screen (`full`) the key comes first, above the
// charts. `back` returns to the screen these are shown on, from the item
// and attempt screens. `key` says whether the answer key is there and
// whether it shows its answers.
export function detailPanes(q: Quiz, back: () => void, today: string, full = false, worstFirst = false): { head: HTMLElement; panes: Pane[]; grid: HTMLElement; key: "shown" | "hidden" | null } {
  const mine = inLibrary(q);
  const st = stateOf(q);
  const own = attemptsOf(q).filter((a) => !isCalibration(a) || q.kind === "calibration");
  const isLocked = locked(q);
  const facts = [
    isLocked ? "locked" : mine ? (q.kind === "calibration" ? "calibration" : q.retired ? "retired" : st.status) : "not in library",
    isLocked ? lockReason(q) : mine ? dueLabel(st, today) : null,
    `${q.items.length} ${q.diagram ? "blanks" : q.mode === "prompt" ? "prompts" : "answers"}`,
    q.tags.length ? q.tags.join(", ") : null,
    q.columns.length ? q.columns.join(", ").toLowerCase() : null,
    !full && st.intervalDays ? `interval ${st.intervalDays.toFixed(1)}d` : null,
  ].filter(Boolean).join(" · ");
  const figs = own.length ? quizFigures(q, own, today, full) : null;
  const head = h("section", { class: "pane detail-head" },
    h("div", { class: "detail-title" }, q.title),
    h("div", { class: "muted small" }, facts),
    figs?.tileRow ?? null);

  // A quiz waiting to be played today keeps its answers to itself.
  const hidden = q.kind === "normal" && awaitingToday({ quiz: q, state: st }, today);
  const key = own.length ? keyPane(q, own, back, { full, hidden, worstFirst }) : null;
  const panes: Pane[] = [];
  if (own.length) {
    if (key) panes.push(key);
    panes.push(tablePane({
      id: "attempts", title: "Attempts", entries: own.slice().reverse(), key: (a) => a.endedAt,
      cols: "17ch 6ch 5ch 5ch minmax(7ch, 1fr)", head: ["when", "score", "time", "grade", ""],
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
  // On the quiz screen the key (with a diagram quiz's drawing) leads and
  // takes the height it needs; elsewhere it sits beside the attempts.
  const lead = full && key ? key : null;
  const rest = panes.filter((p) => p !== lead);
  const tables = h("div", { class: `tables ${rest.length === 2 ? "two" : ""}` }, ...rest.map((p) => p.el));
  const grid = h("div", { class: "detail-grid rich" },
    lead?.el ?? null, lead && q.diagram && !hidden ? keyDiagram(q, own) : null,
    figs?.charts ?? null, rest.length ? tables : null);
  return { head, panes, grid, key: key ? (hidden ? "hidden" : "shown") : null };
}

// ---------- today ----------

// Due per day for the coming week, today first.
function forecastFigure(today: string, days = 7): HTMLElement {
  const fc = forecast(entries(), today, days);
  const dayName = (d: string, i: number) => i === 0 ? "today" : new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }).toLowerCase();
  return figure("Coming up", columns(
    fc.map((f, i) => ({ value: f.due, label: dayName(f.date, i), tip: `${f.date}: ${f.due} due${f.quizzes.length ? ` — ${f.quizzes.join(", ")}` : ""}` })),
    { height: 44, labels: "all" }),
    `${fc.reduce((a, f) => a + f.due, 0)} this week`);
}

// A quiz that is due today and hasn't been played yet today: its answers stay
// hidden until it has been played, so they don't spoil the attempt.
function awaitingToday(e: { quiz: Quiz; state: QuizState }, today: string): boolean {
  return playable(e.quiz, e.state, today) && !attemptsOf(e.quiz).some((a) => dayOf(a) === today);
}

// Items that went badly in their last few appearances, across the library,
// leaving out quizzes still waiting to be played today.
function needsWorkPane(today: string, limit = 12, perQuiz = 3): Pane | null {
  const quizzes = entries().filter((e) => e.quiz.kind === "normal" && !e.quiz.retired && !awaitingToday(e, today)).map((e) => e.quiz);
  const items = troubleItems(quizzes, attemptsOf, app.cps, limit, perQuiz);
  if (!items.length) return null;
  const dots = (recent: string[]) => h("span", { class: "dots" }, ...recent.map((b) => h("i", { class: `c-${bucketFill(b) ?? "muted"}`, title: b })));
  return tablePane({
    id: "needs-work", title: "Needs work", entries: items, key: (x) => `${x.quiz.id}:${x.stats.answer}`, extra: "bottom",
    fit: true, cols: "fit-content(45%) minmax(0, 1fr) max-content max-content max-content", head: ["item", "quiz", "recent", "missed", "slow"],
    rowClass: (x) => x.stats.last ?? "",
    cells: (x) => [rich(x.stats.answer), x.quiz.title, dots(x.recent), String(x.stats.missed), String(x.stats.slow)],
    activate: (x) => () => nav.item(x.quiz, x.stats.answer, () => nav.home("today")),
    meta: "last few attempts, newest right",
  });
}

function todaysResultsPane(todays: AnyAttempt[], tab: Tab): Pane {
  return tablePane({
    id: "results", title: "Today's results", entries: todays, key: (a) => a.endedAt, extra: "bottom",
    fit: true, cols: "max-content minmax(0, 1fr) max-content max-content max-content max-content", head: ["when", "quiz", "score", "time", "grade", ""],
    cells: (a) => [fmtDate(a.endedAt).slice(11), a.title, `${a.score}/${a.total}`, formatClock(a.durationSeconds), gradeOf(a, app.cps).toFixed(2), a.cleared ? "cleared" : ""],
    activate: (a) => { const q = attemptQuiz(a); return q ? () => nav.attempt(q, a, () => nav.home(tab)) : undefined; },
  });
}

// Nothing left to play: the elephant, the day's tally, and the week ahead.
function donePane(todays: AnyAttempt[], today: string): HTMLElement {
  const cleared = todays.filter((a) => a.cleared).length;
  const b = emptyBuckets();
  for (const a of todays) bucketsOf(a, app.cps, b);
  const firsts = todays.filter((a) => a.cleared && !app.attempts.some((x) => x.cleared && x.endedAt < a.endedAt && ("quizId" in x ? x.quizId : x.quiz) === ("quizId" in a ? a.quizId : a.quiz))).length;
  const seconds = todays.reduce((s, a) => s + a.durationSeconds, 0);
  const days = new Set(app.attempts.filter((a) => !isCalibration(a)).map(dayOf));
  const run = streak(days, today);
  return h("section", { class: "pane detail-empty done" },
    h("div", { class: "done-mark" },
      tembo(96),
      h("div", { class: "empty-title" }, "Done for today"),
      h("div", { class: "empty-slot" } /* copy slot: Mark's own words for the done state */)),
    h("div", { class: "done-facts" },
    todays.length
      ? tiles(
          tile("Attempts", String(todays.length), formatDuration(seconds)),
          tile("Cleared", String(cleared), firsts ? `${firsts} first clear${firsts === 1 ? "" : "s"}` : null),
          tile("Instant", String(b.instant), `${b.slow} slow · ${b.missed} missed`),
          tile("Streak", unit(String(run), run === 1 ? " day" : " days"), null))
      : null,
    forecastFigure(today)));
}

// ---------- stats ----------

function statsContent(root: HTMLElement): Pane[] {
  const today = localDate(new Date());
  const normal = app.attempts.filter((a) => !isCalibration(a));
  const lib = entries().filter((e) => e.quiz.kind === "normal" && !e.quiz.retired && !locked(e.quiz));
  const all = emptyBuckets();
  const latencies: number[] = [];
  for (const a of normal) { bucketsOf(a, app.cps, all); latencies.push(...latenciesOf(a, app.cps)); }
  const byDay = activityByDay(normal, app.cps);
  const days = new Set(byDay.keys());
  const run = streak(days, today);
  const know = libraryKnowledge(lib.map((e) => e.quiz), attemptsOf, app.cps);
  const status = { proficient: lib.filter((e) => e.state.status === "proficient").length, learning: lib.filter((e) => e.state.status === "learning").length, fresh: lib.filter((e) => e.state.status === "new").length };
  const seconds = normal.reduce((s, a) => s + a.durationSeconds, 0);
  const med = median(latencies);

  const top = h("section", { class: "pane detail-head" }, tiles(
    tile("Attempts", String(normal.length), `${days.size} day${days.size === 1 ? "" : "s"}`),
    tile("Cleared", String(normal.filter((a) => a.cleared).length), pct(normal.filter((a) => a.cleared).length, normal.length)),
    tile("Streak", unit(String(run), run === 1 ? " day" : " days"), `longest ${longestStreak(days)}`),
    tile("Practice", formatDuration(seconds), normal.length ? `${formatClock(seconds / normal.length)} per attempt` : null),
    tile("Items known", `${know.known}/${know.items}`, `${know.shaky} shaky · ${know.unknown} unknown`),
    tile("Quizzes", String(lib.length), `${status.proficient} proficient · ${status.learning} learning · ${status.fresh} new`),
    tile("Median latency", med === null ? "–" : unit(med.toFixed(1), "s"), `${pct(all.instant, all.instant + all.slow + all.missed)} instant`),
    tile("Typing", unit(app.cps.toFixed(1), " ch/s"), null),
  ));

  // Activity
  const counts = new Map([...byDay].map(([d, r]) => [d, r.attempts]));
  const act = figure("Activity", calendar(counts, 20, today, localDate), `${days.size} active days`);
  const library = figure("Library", segments([
    { value: status.proficient, fill: "instant", label: "proficient" },
    { value: status.learning, fill: "accent", label: "learning" },
    { value: status.fresh, fill: "muted", label: "new" },
  ]), lockedQuizzes().length ? `${lockedQuizzes().length} quiz${lockedQuizzes().length === 1 ? "" : "zes"} waiting` : undefined);
  const knowledge = figure("Items", segments([
    { value: know.known, fill: "instant", label: "known" },
    { value: know.shaky, fill: "slow", label: "shaky" },
    { value: know.unknown, fill: "missed", label: "unknown" },
  ]), "by last appearance");

  // Last 30 days
  const last30 = lastDays(today, 30);
  const daily = figure("Last 30 days", columns(last30.map((d) => {
    const r = byDay.get(d);
    return { value: 0, label: d.slice(5), stack: [{ value: r?.cleared ?? 0, fill: "instant" as Fill }, { value: (r?.attempts ?? 0) - (r?.cleared ?? 0), fill: "muted" as Fill }],
      tip: `${d}: ${r?.attempts ?? 0} attempt${r?.attempts === 1 ? "" : "s"}, ${r?.cleared ?? 0} cleared` };
  }), { height: 72, labels: "ends" }), `${last30.reduce((s, d) => s + (byDay.get(d)?.attempts ?? 0), 0)} attempts`);
  const gradeTrend = figure("Grade by day", lines(
    [{ points: last30.map((d) => { const r = byDay.get(d); return r ? r.grades.reduce((a, b) => a + b, 0) / r.grades.length : null; }), fill: "accent" }],
    { max: 1, height: 72, labels: [last30[0].slice(5), last30.at(-1)!.slice(5)], tips: last30.map((d) => { const r = byDay.get(d); return r ? `${d}: mean grade ${(r.grades.reduce((a, b) => a + b, 0) / r.grades.length).toFixed(2)} over ${r.attempts}` : `${d}: no attempts`; }) }),
    "mean grade of the day's attempts");

  // Results by week (last 12 weeks, Monday-based)
  const weekOf = (d: string) => { const dt = new Date(d + "T12:00:00"); dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); return localDate(dt); };
  const weeks = Array.from({ length: 12 }, (_, i) => weekOf(lastDays(today, 1 + 7 * (11 - i))[0]));
  const perWeek = new Map(weeks.map((w) => [w, emptyBuckets()]));
  for (const a of normal) { const w = weekOf(dayOf(a)); const b = perWeek.get(w); if (b) bucketsOf(a, app.cps, b); }
  const weekly = figure("Results by week", columns(weeks.map((w) => {
    const b = perWeek.get(w)!, t = b.instant + b.slow + b.missed || 1;
    return { value: 0, label: w.slice(5), stack: [{ value: b.instant / t, fill: "instant" as Fill }, { value: b.slow / t, fill: "slow" as Fill }, { value: b.missed / t, fill: "missed" as Fill }],
      tip: `week of ${w}: ${b.instant} instant, ${b.slow} slow, ${b.missed} missed` };
  }), { height: 72, max: 1, labels: "ends" }), "share of answers");
  const width = 0.5, bins = 12;
  const hist = histogram(latencies, width, bins);
  const latency = figure("Recall latency", columns(
    hist.map((v, i) => ({ value: v, label: i === bins - 1 ? `${i * width}s+` : `${i * width}`, tip: `${i * width}–${i === bins - 1 ? "…" : `${(i + 1) * width}s`}: ${v}` })),
    { height: 72, labels: "ends", marker: instantBin(width) / bins, markerTip: "instant threshold" }), med === null ? undefined : `median ${med.toFixed(1)}s`);
  const fc = forecast(entries(), today, 14);
  const ahead = figure("Next two weeks", columns(fc.map((f, i) => ({ value: f.due, label: i === 0 ? "today" : f.date.slice(5), tip: `${f.date}: ${f.due} due${f.quizzes.length ? ` — ${f.quizzes.join(", ")}` : ""}` })), { height: 72, labels: "ends" }),
    `${fc.reduce((a, f) => a + f.due, 0)} due`);

  // Tables
  const topics = byTopic(lib, attemptsOf, app.cps);
  const topicPane = tablePane({
    id: "topics", title: "By topic", entries: topics, key: (t) => t.topic,
    cols: "minmax(0, 1fr) 6ch 8ch 7ch 6ch 6ch minmax(60px, 0.6fr)", head: ["topic", "quizzes", "proficient", "attempts", "cleared", "instant", ""],
    cells: (t) => [t.topic, String(t.quizzes), String(t.proficient), String(t.attempts), String(t.cleared), pct(t.buckets.instant, t.buckets.instant + t.buckets.slow + t.buckets.missed),
      segments([{ value: t.buckets.instant, fill: "instant", label: "instant" }, { value: t.buckets.slow, fill: "slow", label: "slow" }, { value: t.buckets.missed, fill: "missed", label: "missed" }], { legend: false })],
  });
  const needs = needsWorkPane(today, 24, 5);
  const recent = tablePane({
    id: "recent", title: "Recent attempts", entries: normal.slice().reverse(), key: (a) => a.endedAt,
    cols: "17ch minmax(0, 1fr) 6ch 5ch 5ch 7ch", head: ["when", "quiz", "score", "time", "grade", ""],
    cells: (a) => [fmtDate(a.endedAt), a.title, `${a.score}/${a.total}`, formatClock(a.durationSeconds), gradeOf(a, app.cps).toFixed(2), a.cleared ? "cleared" : ""],
    activate: (a) => { const q = attemptQuiz(a); return q ? () => nav.attempt(q, a, () => nav.home("stats")) : undefined; },
  });
  const dayRows = tablePane({
    id: "days", title: "By day", entries: [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])), key: ([d]) => d,
    cols: "minmax(0, 1fr) 9ch 8ch 7ch 7ch", head: ["day", "attempts", "cleared", "time", "grade"],
    cells: ([d, r]) => [d, String(r.attempts), String(r.cleared), formatDuration(r.seconds), (r.grades.reduce((a, b) => a + b, 0) / r.grades.length).toFixed(2)],
  });
  if (needs) needs.el.classList.remove("bottom");

  root.classList.add("stats-scroll");
  root.append(
    top,
    h("div", { class: "fig-row" }, act, library, knowledge),
    h("div", { class: "fig-row" }, daily, gradeTrend),
    h("div", { class: "fig-row" }, weekly, latency, ahead),
    h("div", { class: "fig-row tables-row" }, topicPane.el, needs?.el ?? null),
    h("div", { class: "fig-row tables-row" }, recent.el, dayRows.el),
  );
  return [topicPane, ...(needs ? [needs] : []), recent, dayRows];
}

// ---------- the screen ----------

function attemptQuiz(a: AnyAttempt): Quiz | undefined {
  return app.quizzes.find((q) => q.id === ("quizId" in a ? a.quizId : undefined)) ?? app.quizzes.find((q) => q.title === a.title);
}

export function panesView(tab: Tab): { el: HTMLElement; mount: () => void } {
  const today = localDate(new Date());
  const legend = h("nav", { class: "keys" });
  const root = h("div", { class: "panes" });
  let selectedQuiz: Quiz | null = null;
  let selectedSeries: Series | null = null;

  if (tab === "stats") {
    const panes = statsContent(root);
    const actions = (_p: Pane | null, row: Row | null): KeyAction[] => [
      ...(row?.activate ? [{ keys: ["Enter"], hint: "enter", label: "Open", run: row.activate }] : []),
      ...globalActions(tab),
    ];
    return { el: h("div", { class: "panes-wrap" }, legend, root), mount: () => mountPanes({ scope: tab, root, legend, panes, actions }) };
  }

  // Left: the list for this tab — quizzes on Today, series elsewhere.
  const g = groups(today);
  const byTopicMode = tab !== "today" && app.settings.groupBy === "topic";
  const listGroups: ListGroup[] =
    tab === "today" ? [
      { name: "Due", rows: g.due.map((e) => quizRow(e.quiz, today)) },
      { name: "New", rows: g.fresh.map((e) => quizRow(e.quiz, today)) },
    ]
    : tab === "library" ? (() => {
      const mine = app.series.filter(seriesInLibrary);
      return byTopicMode ? byTopicGroups(mine, today) : byStatusGroups(mine, today);
    })()
    : (() => {
      const shown = app.series.filter((s) => seriesStatus(s, today) !== "calibration")
        .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
      return byTopicMode ? byTopicGroups(shown, today).map((gr) => ({ ...gr, rows: gr.rows.map((r) => ({ ...r, meta: seriesRow(app.series.find((x) => x.id === r.id)!, today, true).meta })) })) : [
        { name: "Available", rows: shown.filter((x) => !seriesInLibrary(x)).map((x) => seriesRow(x, today, true)) },
        { name: "In your library", rows: shown.filter(seriesInLibrary).map((x) => seriesRow(x, today, true)) },
      ];
    })();

  // Right: details of the cursor row, redrawn as the cursor moves.
  const detail = h("div", { class: "detail" });
  let detailIds: string[] = [];
  const quizById = (id: string) => app.quizzes.find((q) => q.id === id);
  const seriesById = (id: string) => app.series.find((x) => x.id === id);
  const showDetail = (id: string) => {
    const q = tab === "today" ? quizById(id) : undefined;
    const s = tab === "today" ? undefined : seriesById(id);
    if (!q && !s) return;
    selectedQuiz = q ?? (s!.quizzes.length === 1 ? s!.quizzes[0] : null);
    selectedSeries = s ?? null;
    const d = q ? detailPanes(q, () => nav.home(tab), today) : seriesPanes(s!, () => nav.home(tab), today);
    detail.replaceChildren(d.head, d.grid);
    setPanes(detailIds, d.panes);
    detailIds = d.panes.map((p) => p.id);
  };
  // The quiz a series' Enter and `p` go to: its first playable quiz.
  const playableIn = (s: Series): Quiz | undefined => s.quizzes.find((q) => playable(q, stateOf(q), today));
  const activate = (id: string) => {
    const q = tab === "today" ? quizById(id) : undefined;
    if (q) { if (playable(q, stateOf(q), today)) nav.play(q); else nav.quiz(q); return; }
    const s = seriesById(id);
    if (!s) return;
    if (s.quizzes.length === 1) { const only = s.quizzes[0]; if (tab !== "watering-hole" && playable(only, stateOf(only), today)) nav.play(only); else nav.quiz(only); return; }
    const next = tab === "watering-hole" ? undefined : playableIn(s);
    if (next) nav.play(next); else focusPane("quizzes");
  };
  const list = listPane(listGroups, showDetail, activate, { meta: tab === "today" ? undefined : byTopicMode ? "by topic" : "by status" });
  const todays = app.attempts.filter((a) => localDate(new Date(a.endedAt)) === today && !isCalibration(a)).slice().reverse();
  const fixed: Pane[] = [];

  if (tab === "today" && !list.rows.length) {
    // Nothing left: the done state takes the top row.
    root.append(donePane(todays, today));
    root.classList.add("today", "done");
  } else {
    if (!list.rows.length) {
      detail.append(h("div", { class: "pane detail-empty" }, tembo(120), h("div", { class: "empty-slot" } /* copy slot: Mark's own words for the empty state */)));
    }
    fixed.push(list);
    root.append(list.el, tab === "today" ? h("div", { class: "right" }, forecastFigure(today), detail) : detail);
    if (tab === "today") root.classList.add("today");
  }

  // Bottom (Today): items that need work, and today's results.
  if (tab === "today") {
    const needs = needsWorkPane(today);
    const results = todays.length ? todaysResultsPane(todays, tab) : null;
    if (needs || results) {
      root.append(h("div", { class: `bottom-row ${needs && results ? "two" : ""}` }, needs?.el ?? null, results?.el ?? null));
      root.classList.add("with-bottom");
      if (needs) fixed.push(needs);
      if (results) fixed.push(results);
    }
  }

  const actions = (p: Pane | null, row: Row | null): KeyAction[] => {
    const out: KeyAction[] = [];
    if (p?.id === "list" && tab === "today" && selectedQuiz) {
      const q = selectedQuiz;
      const canPlay = playable(q, stateOf(q), today);
      out.push({ keys: ["Enter"], hint: "enter", label: canPlay ? "Play" : "Open", run: () => activate(q.id) });
      if (canPlay) out.push({ keys: ["p"], hint: "p", label: "Play", run: () => nav.play(q) });
      out.push({ keys: ["o"], hint: "o", label: canPlay ? "Open" : "", run: () => nav.quiz(q) });
    } else if (p?.id === "list" && selectedSeries) {
      const s = selectedSeries;
      const only = s.quizzes.length === 1 ? s.quizzes[0] : null;
      const next = tab === "watering-hole" ? undefined : playableIn(s);
      if (tab === "watering-hole") {
        out.push({ keys: ["Enter", "o"], hint: "enter", label: only ? "Open" : "Quizzes", run: () => activate(s.id) });
        if (app.library.includes(s.id)) out.push({ keys: ["x"], hint: "x", label: "Remove", run: () => act(() => removeSeries(s)) });
        else if (!seriesInLibrary(s)) out.push({ keys: ["i"], hint: "i", label: "Import", run: () => act(() => importSeries(s)) });
      } else {
        out.push({ keys: ["Enter"], hint: "enter", label: next ? "Play" : only ? "Open" : "Quizzes", run: () => activate(s.id) });
        if (next) out.push({ keys: ["p"], hint: "p", label: "Play", run: () => nav.play(next) });
        out.push({ keys: ["o"], hint: "o", label: next ? (only ? "Open" : "Quizzes") : "", run: () => { if (only) nav.quiz(only); else focusPane("quizzes"); } });
        // Back to the Watering Hole, out of rotation; history is kept.
        if (app.library.includes(s.id)) out.push({ keys: ["x"], hint: "x", label: "To Watering Hole", run: () => act(() => removeSeries(s)) });
      }
    } else if (p?.id === "quizzes" && row) {
      const q = quizById(row.id);
      if (q && playable(q, stateOf(q), today)) out.push({ keys: ["p"], hint: "p", label: "Play", run: () => nav.play(q) });
      if (row.activate) out.push({ keys: ["Enter"], hint: "enter", label: "Open", run: row.activate });
    } else if (row?.activate) {
      out.push({ keys: ["Enter"], hint: "enter", label: "Open", run: row.activate });
    }
    if (tab !== "today") {
      out.push({ keys: ["t"], hint: "t", label: byTopicMode ? "By status" : "By topic", run: () => {
        app.settings.groupBy = byTopicMode ? "status" : "topic";
        persistSettings();
        nav.home(tab);
      } });
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
