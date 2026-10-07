import { app, entries, loadQuizzes, type Entry } from "../app";
import { approveDraft, listDrafts, newDraft, openPath, type QuizFile } from "../backend";
import { parseQuiz } from "../quiz/format";
import { tembo } from "../banner";
import { h } from "../dom";
import { median } from "../stats";
import { itemLatency } from "../grade";
import { nav, type Tab } from "../nav";
import { isCalibration } from "../log";
import { isDue, localDate } from "../schedule";
import { renderHome } from "../shell";
import { attemptRow, dueLabel, th } from "./common";
import { settingsView } from "./settings";

function entryRow(e: Entry, today: string, canPlay: boolean): HTMLElement {
  const meta = [`${e.quiz.items.length}`, e.quiz.mode, dueLabel(e.state, today)].filter(Boolean).join(" · ");
  return h(
    "li",
    { class: "entry" },
    h("button", { class: `quiz-link ${canPlay ? "" : "muted"}`, onclick: () => nav.quiz(e.quiz) }, e.quiz.title),
    h("span", { class: "muted meta" }, meta),
    e.state.status === "mastered" ? h("span", { class: "stamp", title: "mastered" }, tembo(22)) : null,
    canPlay ? h("button", { class: "play", onclick: () => nav.play(e.quiz) }, "Play") : null,
  );
}

function section(name: string, rows: Node[]): HTMLElement | null {
  if (rows.length === 0) return null;
  return h("section", {}, h("h2", {}, name), h("ul", { class: "quiz-list" }, ...rows));
}

// ---------- authoring: new quiz, drafts awaiting approval ----------

let drafts: QuizFile[] = [];

function folderName(dir: string): string {
  return dir.split("/").filter(Boolean).pop() ?? dir;
}

function authoringActions(tab: Tab): HTMLElement {
  return h(
    "div",
    { class: "actions" },
    h("button", { onclick: async () => { const file = await newDraft(); await openPath(file); nav.home(tab); } }, "New quiz"),
    h("button", { class: "quiet", onclick: () => openPath(`${app.root}/quizzes`) }, "Open quizzes folder"),
  );
}

function draftsSection(tab: Tab): HTMLElement | null {
  const rows = drafts.map((d) => {
    const name = folderName(d.dir);
    let summary: string;
    let ok = true;
    try {
      const q = parseQuiz(d.source, d.path, d.dir);
      summary = `${q.title || "(untitled)"} · ${q.items.length} · ${q.mode}`;
    } catch (e) {
      summary = (e as Error).message;
      ok = false;
    }
    return h(
      "li",
      { class: "entry" },
      h("span", { class: "mono small" }, name),
      h("span", { class: `meta ${ok ? "muted" : "error"}` }, summary),
      h("button", { class: "quiet", onclick: () => openPath(d.path) }, "Edit"),
      ok ? h("button", { class: "play", onclick: async () => {
        try { await approveDraft(name); nav.home(tab); } catch (e) { alertLine(String(e)); }
      } }, "Approve") : null,
    );
  });
  return section("Drafts", rows);
}

function alertLine(msg: string): void {
  // Non-blocking error line at the top of the page (no browser dialogs).
  const page = document.querySelector(".page");
  page?.prepend(h("p", { class: "error" }, msg));
}

function groups(today: string) {
  const all = entries();
  const normal = all.filter((e) => e.quiz.kind === "normal" && !e.quiz.retired);
  const byDue = (a: Entry, b: Entry) => a.state.dueDate!.localeCompare(b.state.dueDate!);
  return {
    due: normal.filter((e) => e.state.status !== "new" && isDue(e.state, today)).sort(byDue),
    fresh: normal.filter((e) => e.state.status === "new"),
    upcoming: normal.filter((e) => e.state.status === "learning" && !isDue(e.state, today)).sort(byDue),
    mastered: normal.filter((e) => e.state.status === "mastered" && !isDue(e.state, today)).sort(byDue),
    retired: all.filter((e) => e.quiz.kind === "normal" && e.quiz.retired),
    calibration: all.filter((e) => e.quiz.kind === "calibration"),
  };
}

function todayView(today: string): Node {
  const g = groups(today);
  const todays = app.attempts.filter((a) => localDate(new Date(a.endedAt)) === today && !isCalibration(a));
  const nothingLeft = g.due.length === 0 && g.fresh.length === 0;
  const parts: (HTMLElement | null)[] = [];
  if (nothingLeft) {
    parts.push(
      h(
        "div",
        { class: "empty" },
        tembo(120),
        h("div", { class: "empty-title" }, "No quizzes left today"),
        h("div", { class: "empty-slot" } /* copy slot: Mark's own words for the empty state */),
        authoringActions("today"),
      ),
      draftsSection("today"),
      todays.length
        ? h(
            "section",
            {},
            h("h2", {}, "Today's results"),
            h(
              "table",
              { class: "stats" },
              th("when", "quiz", "score", "time", "grade", ""),
              ...todays.slice().reverse().map((a) => {
                const quiz = app.quizzes.find((q) => q.id === ("quizId" in a ? a.quizId : undefined)) ?? app.quizzes.find((q) => q.title === a.title);
                return quiz ? attemptRow(quiz, a, () => nav.attempt(quiz, a, () => nav.home("today"))) : h("tr", {}, h("td", {}, a.title));
              }),
            ),
          )
        : null,
    );
  } else {
    parts.push(section("Due", g.due.map((e) => entryRow(e, today, true))));
    parts.push(section("New", g.fresh.map((e) => entryRow(e, today, true))));
  }
  parts.push(section("Coming up", [...g.upcoming, ...g.mastered].sort((a, b) => a.state.dueDate!.localeCompare(b.state.dueDate!)).slice(0, 3).map((e) => entryRow(e, today, false))));
  return h("div", {}, ...parts);
}

function libraryView(today: string): Node {
  const g = groups(today);
  const sections = [
    authoringActions("library"),
    draftsSection("library"),
    section("Due", g.due.map((e) => entryRow(e, today, true))),
    section("New", g.fresh.map((e) => entryRow(e, today, true))),
    section("Upcoming", g.upcoming.map((e) => entryRow(e, today, false))),
    section("Mastered", g.mastered.map((e) => entryRow(e, today, false))),
    section("Retired", g.retired.map((e) => entryRow(e, today, false))),
    section("Calibration", g.calibration.map((e) => entryRow(e, today, true))),
    app.quizErrors.length ? section("Errors", app.quizErrors.map((m) => h("li", { class: "error" }, m))) : null,
  ];
  return h("div", {}, ...sections);
}

function statsView(): Node {
  const normal = app.attempts.filter((a) => !isCalibration(a));
  const latencies: number[] = [];
  const buckets = { instant: 0, slow: 0, missed: 0 };
  for (const a of normal) {
    if (a.version !== 2) continue;
    for (let i = 0; i < a.items.length; i++) {
      const lat = itemLatency(a, i, app.cps);
      if (lat === null) buckets.missed++;
      else { latencies.push(lat); if (lat < 1.5) buckets.instant++; else buckets.slow++; }
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

  const recent = normal.slice().reverse().slice(0, 30).map((a) => {
    const quiz = app.quizzes.find((q) => q.id === ("quizId" in a ? a.quizId : undefined)) ?? app.quizzes.find((q) => q.title === a.title);
    return quiz ? attemptRow(quiz, a, () => nav.attempt(quiz, a, () => nav.home("stats"))) : h("tr", {}, h("td", {}, a.title));
  });

  return h(
    "div",
    {},
    h("div", { class: "muted small" }, facts),
    h("section", {}, h("h2", {}, "By day"), h("table", { class: "stats" }, th("day", "attempts", "cleared"),
      ...[...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([d, r]) =>
        h("tr", {}, h("td", {}, d), h("td", { class: "num" }, String(r.attempts)), h("td", { class: "num" }, String(r.cleared)))))),
    h("section", {}, h("h2", {}, "Recent attempts"), h("table", { class: "stats" }, th("when", "quiz", "score", "time", "grade", ""), ...recent)),
  );
}

export async function showHome(tab: Tab = "today"): Promise<void> {
  await loadQuizzes();
  drafts = await listDrafts();
  const today = localDate(new Date());
  const content =
    tab === "today" ? todayView(today)
    : tab === "library" ? libraryView(today)
    : tab === "stats" ? statsView()
    : settingsView();
  renderHome(tab, content);
}
