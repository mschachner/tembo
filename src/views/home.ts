import { entries, loadQuizzes, locked, lockedVariants, stateOf, type Entry } from "../app";
import { h } from "../dom";
import { type Tab } from "../nav";
import { isDue } from "../schedule";
import { renderHome, renderScreen } from "../shell";
import { settingsView } from "./settings";
import { panesView } from "./panes";

export function alertLine(msg: string): void {
  // Non-blocking error line at the top of the page (no browser dialogs).
  const page = document.querySelector(".page");
  page?.prepend(h("p", { class: "error" }, msg));
}

export function groups(today: string) {
  const all = entries();
  // Locked variants (explicitly imported or not) wait in their own group.
  const normal = all.filter((e) => e.quiz.kind === "normal" && !e.quiz.retired && !locked(e.quiz));
  const byDue = (a: Entry, b: Entry) => a.state.dueDate!.localeCompare(b.state.dueDate!);
  return {
    due: normal.filter((e) => e.state.status !== "new" && isDue(e.state, today)).sort(byDue),
    fresh: normal.filter((e) => e.state.status === "new"),
    upcoming: normal.filter((e) => e.state.status === "learning" && !isDue(e.state, today)).sort(byDue),
    proficient: normal.filter((e) => e.state.status === "proficient" && !isDue(e.state, today)).sort(byDue),
    locked: lockedVariants().map((quiz) => ({ quiz, state: stateOf(quiz) })),
    retired: all.filter((e) => e.quiz.kind === "normal" && e.quiz.retired),
    calibration: all.filter((e) => e.quiz.kind === "calibration"),
  };
}

export async function showHome(tab: Tab = "today"): Promise<void> {
  await loadQuizzes();
  if (tab === "settings") {
    // Reachable only if the settings window can't open.
    renderScreen(settingsView());
    return;
  }
  const view = panesView(tab);
  renderHome(tab, view.el);
  view.mount();
}
