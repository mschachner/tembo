import { adoptSettings, app, applyActiveTheme, loadAll, loadQuizzes, loadThemes, reloadHistory } from "./app";
import { bindSettingsShortcut, showWhenReady, subscribe, toggleSettingsWindow } from "./bus";
import { syncNow } from "./backend";
import { h } from "./dom";
import { nav } from "./nav";
import { lastTab, onHome, refreshBanner, refreshStatus, renderSettingsWindow } from "./shell";
import { showAttempt, showItem, showQuiz } from "./views/detail";
import { showHome } from "./views/home";
import { showPlay } from "./views/play";
import { settingsView } from "./views/settings";
import { mountSettingsNav } from "./views/settingsNav";

const isSettingsWindow = location.hash === "#settings";

function fail(e: unknown): void {
  const root = document.getElementById("app")!;
  root.replaceChildren(h("p", { class: "error", style: "padding: 40px" }, String(e)));
  void showWhenReady();
}

if (isSettingsWindow) {
  // Settings window: renders only the settings page; its changes are
  // written to disk and broadcast to the main window.
  nav.home = () => {
    const view = settingsView() as HTMLElement;
    renderSettingsWindow(view);
    mountSettingsNav(view, () => void toggleSettingsWindow(() => {}));
  };
  bindSettingsShortcut(() => {});
  loadAll()
    .then(() => {
      nav.home();
      void showWhenReady();
      return subscribe(async (msg) => {
        if (msg.kind === "themes") { await loadThemes(); nav.home(); }
        // The main window saves the quiz views; keep them, so this window's
        // next save doesn't write back stale ones.
        if (msg.kind === "settings") app.settings.views = msg.settings.views ?? {};
      });
    })
    .catch(fail);
} else {
  nav.home = (tab) => { showHome(tab ?? lastTab()).catch(fail); };
  nav.quiz = showQuiz;
  nav.play = showPlay;
  nav.attempt = showAttempt;
  nav.item = showItem;
  bindSettingsShortcut(() => nav.home("settings"));
  loadAll()
    .then(async () => {
      await showHome("today");
      void showWhenReady();
      // Check the remote whenever the window comes back to the front, at most every five minutes.
      let lastSync = Date.now();
      window.addEventListener("focus", () => {
        if (Date.now() - lastSync < 5 * 60_000) return;
        lastSync = Date.now();
        void syncNow();
      });
      return subscribe(async (msg) => {
        if (msg.kind === "settings") {
          adoptSettings(msg.settings);
          refreshBanner();
          refreshStatus();
        } else if (msg.kind === "themes") {
          await loadThemes();
          applyActiveTheme();
          const tab = onHome();
          if (tab) nav.home(tab);
        } else if (msg.kind === "history") {
          await reloadHistory();
          nav.home(onHome() ?? "today");
        } else if (msg.kind === "synced") {
          // New quizzes or history from the remote. Don't interrupt a quiz in progress.
          await loadQuizzes();
          await reloadHistory();
          const tab = onHome();
          if (tab) nav.home(tab);
        } else if (msg.kind === "play") {
          const quiz = app.quizzes.find((q) => q.id === msg.quizId);
          if (quiz) nav.play(quiz);
        }
      });
    })
    .catch(fail);
}
