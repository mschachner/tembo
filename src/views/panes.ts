// The home screen: the window below the banner is filled with bordered
// panes, a quiz list on the left and the highlighted quiz's details on the
// right, all driven from the keyboard (see panes.ts). The quiz details are
// also the body of the quiz screen (detail.ts).
import { app, attemptsOf, baseOf, entries, importQuiz, inLibrary, locked, lockedVariants, persistSettings, playable, removeQuiz, stateOf } from "../app";
import { tembo } from "../banner";
import { formatClock, h } from "../dom";
import { gradeOf } from "../grade";
import { isCalibration, type AnyAttempt } from "../log";
import { nav, type Tab } from "../nav";
import { mountPanes, paneEl, setPanes, tablePane, type KeyAction, type Pane, type Row } from "../panes";
import { topicOf, type Quiz } from "../quiz/format";
import { localDate } from "../schedule";
import { openSettingsWindow } from "../bus";
import { itemStats, median, trouble, type ItemStats } from "../stats";
import { dueLabel, fmtDate } from "./common";
import { alertLine, groups } from "./home";
import { rich } from "../rich";
import { calendar, columns, figure, heatmap, lines, segments, tile, tiles, type Fill } from "../charts";
import {
  activityByDay, byTopic, dayOf, forecast, formatDuration, histogram, instantBin, itemHistory, lastDays, latenciesOf,
  libraryKnowledge, longestStreak, pct, quizSummary, streak, troubleItems, bucketsOf, emptyBuckets,
} from "../insights";

const TAB_KEYS: [string, Tab][] = [["1", "today"], ["2", "library"], ["3", "watering-hole"], ["4", "stats"]];

// ---------- quiz list ----------

interface ListGroup { name: string; quizzes: Quiz[] }

function quizMeta(q: Quiz, today: string, inHole = false): string {
  if (locked(q)) return `locked · ${q.items.length}`;
  if (!inLibrary(q)) return `${q.items.length} · ${q.diagram ? "diagram" : q.mode}`;
  if (inHole) return `${q.items.length} · ${q.diagram ? "diagram" : q.mode} · in library`;
  const st = stateOf(q);
  return [dueLabel(st, today) || (st.status === "new" ? "new" : ""), `${q.items.length}`].filter(Boolean).join(" · ");
}

function listPane(listGroups: ListGroup[], today: string, onCursor: (q: Quiz) => void, activate: (q: Quiz) => void, opts: { inHole?: boolean; meta?: string } = {}): Pane {
  const body = h("div", { class: "pane-body" });
  const rows: Row[] = [];
  for (const g of listGroups) {
    if (!g.quizzes.length) continue;
    body.append(h("div", { class: "row-group" }, g.name));
    for (const q of g.quizzes) {
      const proficient = inLibrary(q) && stateOf(q).status === "proficient";
      const el = h("div", { class: `row quiz-row ${playable(q, stateOf(q), today) ? "playable" : ""} ${locked(q) ? "locked" : ""}` },
        h("span", { class: "marker" }),
        h("span", { class: "row-title" }, q.title),
        proficient ? h("span", { class: "stamp", title: "proficient" }, tembo(16)) : null,
        h("span", { class: "row-meta" }, quizMeta(q, today, opts.inHole)));
      body.append(el);
      rows.push({ id: q.id, el, activate: () => activate(q) });
    }
  }
  if (!rows.length) body.append(h("div", { class: "pane-empty" }, tembo(64)));
  const el = paneEl("list", "Quizzes", body, { extra: "list-pane", meta: opts.meta });
  return { id: "list", el, rows, body, onCursor: (row) => { const q = app.quizzes.find((x) => x.id === row.id); if (q) onCursor(q); } };
}

// Quizzes grouped by their first tag, untagged last; within a topic the
// playable ones come first, then by due date, then by title.
function byTopicGroups(quizzes: Quiz[], today: string): ListGroup[] {
  const map = new Map<string, Quiz[]>();
  for (const q of quizzes) {
    const t = topicOf(q) || "untagged";
    map.set(t, [...(map.get(t) ?? []), q]);
  }
  const rank = (q: Quiz) => locked(q) ? 3 : !inLibrary(q) ? 2 : playable(q, stateOf(q), today) ? 0 : 1;
  const due = (q: Quiz) => (inLibrary(q) ? stateOf(q).dueDate ?? "" : "~");
  return [...map.entries()]
    .sort((a, b) => (a[0] === "untagged" ? 1 : 0) - (b[0] === "untagged" ? 1 : 0) || a[0].localeCompare(b[0]))
    .map(([name, qs]) => ({ name, quizzes: qs.sort((a, b) => rank(a) - rank(b) || due(a).localeCompare(due(b)) || a.title.localeCompare(b.title, undefined, { numeric: true })) }));
}

// ---------- quiz details ----------

const bucketFill = (b: string | null): Fill | null => b === "instant" ? "instant" : b === "slow" || b === "untimed" ? "slow" : b === "missed" ? "missed" : null;

function unit(value: string, u: string): HTMLElement {
  return h("span", {}, value, h("span", { class: "unit" }, u));
}

// Figures for a quiz that has been played: key numbers, then charts.
// `full` (the quiz screen) adds the rest of the numbers and the item ×
// attempt history; the home screen's detail area shows the essentials.
function quizFigures(q: Quiz, own: AnyAttempt[], today: string, full: boolean): { tileRow: HTMLElement; charts: HTMLElement; history: HTMLElement | null } {
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

  let history: HTMLElement | null = null;
  if (full) {
    const stats = itemStats(q, own, app.cps).map((s) => ({ s, t: trouble(s) })).sort((a, b) => b.t - a.t || a.s.answer.localeCompare(b.s.answer)).map(({ s }) => s);
    const shown = own.slice(-40);
    const hist2 = itemHistory(shown, app.cps, stats.map((s) => s.answer));
    history = figure("Item history", heatmap(
      stats.map((s, i) => ({ label: rich(s.answer), cells: hist2[i].map((b, k) => ({ fill: bucketFill(b), tip: `${s.answer} · ${fmtDate(shown[k].endedAt)}: ${b ?? "not in quiz"}` })) })),
    ), `worst first · ${shown.length === own.length ? "every attempt" : `last ${shown.length} attempts`}, oldest left`);
  }
  return { tileRow, charts, history };
}

// The head (title, facts, figures) and the panes below it: items worst
// first and attempts newest first, or for a quiz not played yet, its
// prompts. `back` returns to the screen these are shown on, from the item
// and attempt screens.
export function detailPanes(q: Quiz, back: () => void, today: string, full = false): { head: HTMLElement; panes: Pane[]; grid: HTMLElement } {
  const mine = inLibrary(q);
  const st = stateOf(q);
  const own = attemptsOf(q).filter((a) => !isCalibration(a) || q.kind === "calibration");
  const isLocked = locked(q);
  const facts = [
    isLocked ? "locked" : mine ? (q.kind === "calibration" ? "calibration" : q.retired ? "retired" : st.status) : "not in library",
    isLocked ? `unlocks when ${baseOf(q)?.title ?? q.after} is proficient` : mine ? dueLabel(st, today) : null,
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
  const tables = h("div", { class: `tables ${panes.length === 2 ? "two" : ""}` }, ...panes.map((p) => p.el));
  const grid = h("div", { class: "detail-grid rich" }, figs?.charts ?? null, figs?.history ?? null, panes.length ? tables : null);
  return { head, panes, grid };
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

// Items that went badly in their last few appearances, across the library.
function needsWorkPane(limit = 12, perQuiz = 3): Pane | null {
  const items = troubleItems(entries().map((e) => e.quiz).filter((q) => q.kind === "normal" && !q.retired), attemptsOf, app.cps, limit, perQuiz);
  if (!items.length) return null;
  const dots = (recent: string[]) => h("span", { class: "dots" }, ...recent.map((b) => h("i", { class: `c-${bucketFill(b) ?? "muted"}`, title: b })));
  return tablePane({
    id: "needs-work", title: "Needs work", entries: items, key: (x) => `${x.quiz.id}:${x.stats.answer}`, extra: "bottom",
    cols: "minmax(0, 1.2fr) minmax(0, 1fr) 6ch 7ch 5ch", head: ["item", "quiz", "recent", "missed", "slow"],
    rowClass: (x) => x.stats.last ?? "",
    cells: (x) => [rich(x.stats.answer), x.quiz.title, dots(x.recent), String(x.stats.missed), String(x.stats.slow)],
    activate: (x) => () => nav.item(x.quiz, x.stats.answer, () => nav.home("today")),
    meta: "last few attempts, newest right",
  });
}

function todaysResultsPane(todays: AnyAttempt[], tab: Tab): Pane {
  return tablePane({
    id: "results", title: "Today's results", entries: todays, key: (a) => a.endedAt, extra: "bottom",
    cols: "7ch minmax(0, 1fr) 7ch 6ch 6ch 8ch", head: ["when", "quiz", "score", "time", "grade", ""],
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
      tembo(110),
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
  ]), lockedVariants().length ? `${lockedVariants().length} harder variant${lockedVariants().length === 1 ? "" : "s"} waiting` : undefined);
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
    cols: "minmax(0, 1fr) 7ch 10ch 8ch 7ch 8ch minmax(60px, 0.6fr)", head: ["topic", "quizzes", "proficient", "attempts", "cleared", "instant", ""],
    cells: (t) => [t.topic, String(t.quizzes), String(t.proficient), String(t.attempts), String(t.cleared), pct(t.buckets.instant, t.buckets.instant + t.buckets.slow + t.buckets.missed),
      segments([{ value: t.buckets.instant, fill: "instant", label: "instant" }, { value: t.buckets.slow, fill: "slow", label: "slow" }, { value: t.buckets.missed, fill: "missed", label: "missed" }], { legend: false })],
  });
  const needs = needsWorkPane(24, 5);
  const recent = tablePane({
    id: "recent", title: "Recent attempts", entries: normal.slice().reverse(), key: (a) => a.endedAt,
    cols: "17ch minmax(0, 1fr) 7ch 6ch 6ch 8ch", head: ["when", "quiz", "score", "time", "grade", ""],
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
  let selected: Quiz | null = null;

  if (tab === "stats") {
    const panes = statsContent(root);
    const actions = (_p: Pane | null, row: Row | null): KeyAction[] => [
      ...(row?.activate ? [{ keys: ["Enter"], hint: "enter", label: "Open", run: row.activate }] : []),
      ...globalActions(tab),
    ];
    return { el: h("div", { class: "panes-wrap" }, legend, root), mount: () => mountPanes({ scope: tab, root, legend, panes, actions }) };
  }

  // Left: the list for this tab.
  const g = groups(today);
  const byTopicMode = tab !== "today" && app.settings.groupBy === "topic";
  const hole = tab === "watering-hole";
  const listGroups: ListGroup[] =
    tab === "today" ? [
      { name: "Due", quizzes: g.due.map((e) => e.quiz) },
      { name: "New", quizzes: g.fresh.map((e) => e.quiz) },
    ]
    : tab === "library" ? (byTopicMode
      ? byTopicGroups([...g.due, ...g.fresh, ...g.upcoming, ...g.proficient, ...g.locked, ...g.retired].map((e) => e.quiz), today)
      : [
        { name: "Due", quizzes: g.due.map((e) => e.quiz) },
        { name: "New", quizzes: g.fresh.map((e) => e.quiz) },
        { name: "Upcoming", quizzes: g.upcoming.map((e) => e.quiz) },
        { name: "Proficient", quizzes: g.proficient.map((e) => e.quiz) },
        { name: "Locked", quizzes: g.locked.map((e) => e.quiz) },
        { name: "Retired", quizzes: g.retired.map((e) => e.quiz) },
        { name: "Calibration", quizzes: g.calibration.map((e) => e.quiz) },
      ])
    : (() => {
      // Harder variants arrive with their base quiz, so they aren't listed.
      const shown = app.quizzes.filter((q) => q.kind === "normal" && !q.retired && !q.after)
        .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
      return byTopicMode ? byTopicGroups(shown, today) : [
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
  const list = listPane(listGroups, today, showDetail, activate, { inHole: hole && byTopicMode, meta: tab === "today" ? undefined : byTopicMode ? "by topic" : "by status" });
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
    const needs = needsWorkPane();
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
    if (p?.id === "list" && selected) {
      const q = selected;
      if (tab === "watering-hole") {
        out.push({ keys: ["Enter", "o"], hint: "enter", label: "Open", run: () => nav.quiz(q) });
        if (app.library.includes(q.id)) out.push({ keys: ["x"], hint: "x", label: "Remove", run: () => act(() => removeQuiz(q)) });
        else if (!inLibrary(q)) out.push({ keys: ["i"], hint: "i", label: "Import", run: () => act(() => importQuiz(q)) });
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
