import { adoptSettings, app, applyActiveTheme, loadAll, loadThemes, reloadHistory } from "./app";
import { bindSettingsShortcut, showWhenReady, subscribe } from "./bus";
import { h } from "./dom";
import { nav } from "./nav";
import { onHome, refreshBanner, refreshStatus, renderSettingsWindow } from "./shell";
import { showAttempt, showItem, showQuiz } from "./views/detail";
import { showHome } from "./views/home";
import { showPlay } from "./views/play";
import { settingsView } from "./views/settings";

const isSettingsWindow = location.hash === "#settings";

function fail(e: unknown): void {
  const root = document.getElementById("app")!;
  root.replaceChildren(h("p", { class: "error", style: "padding: 40px" }, String(e)));
  void showWhenReady();
}

if (isSettingsWindow) {
  // Settings window: renders only the settings page; its changes are
  // written to disk and broadcast to the main window.
  nav.home = () => renderSettingsWindow(settingsView());
  bindSettingsShortcut(() => {});
  loadAll()
    .then(() => {
      nav.home();
      void showWhenReady();
      return subscribe(async (msg) => {
        if (msg.kind === "themes") { await loadThemes(); nav.home(); }
      });
    })
    .catch(fail);
} else {
  nav.home = (tab) => { showHome(tab).catch(fail); };
  nav.quiz = showQuiz;
  nav.play = showPlay;
  nav.attempt = showAttempt;
  nav.item = showItem;
  bindSettingsShortcut(() => nav.home("settings"));
  loadAll()
    .then(async () => {
      await showHome("today");
      void showWhenReady();
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
        } else if (msg.kind === "play") {
          const quiz = app.quizzes.find((q) => q.id === msg.quizId);
          if (quiz) nav.play(quiz);
        }
      });
    })
    .catch(fail);
}
