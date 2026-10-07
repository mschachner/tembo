import { loadAll } from "./app";
import { h } from "./dom";
import { nav } from "./nav";
import { showAttempt, showItem, showQuiz } from "./views/detail";
import { showHome } from "./views/home";
import { showPlay } from "./views/play";

nav.home = (tab) => { showHome(tab).catch(fail); };
nav.quiz = showQuiz;
nav.play = showPlay;
nav.attempt = showAttempt;
nav.item = showItem;

function fail(e: unknown): void {
  const root = document.getElementById("app")!;
  root.replaceChildren(h("p", { class: "error", style: "padding: 40px" }, String(e)));
}

loadAll().then(() => nav.home()).catch(fail);
