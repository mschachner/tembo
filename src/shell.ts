// Page skeleton: title-bar drag strip, banner (home only), tabs, content,
// status line.
import { activeTheme, app, asset, dueCount } from "./app";
import { bannerImage, defaultBanner } from "./banner";
import { clear, h } from "./dom";
import { nav, type Tab } from "./nav";
import { localDate } from "./schedule";

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "library", label: "Library" },
  { id: "stats", label: "Stats" },
  { id: "settings", label: "Settings" },
];

function bannerNode(): HTMLElement {
  const theme = activeTheme();
  const wrap = h("div", { class: "banner", "data-tauri-drag-region": "" });
  const path = String(theme.bannerImage ?? "");
  if (path) {
    const img = bannerImage("");
    asset(app.root, path).then((url) => { img.src = url; }, () => wrap.prepend(defaultBanner()));
    wrap.append(img);
  } else {
    wrap.append(defaultBanner());
  }
  const due = dueCount();
  const today = new Date();
  const dateLabel = today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  wrap.append(
    h(
      "div",
      { class: "banner-text" },
      h("div", { class: "banner-title" }, "Tembo"),
      h("div", { class: "banner-sub" }, `${dateLabel} · ${due} due`),
    ),
  );
  return wrap;
}

function statusLine(): HTMLElement {
  const calib = app.attempts.filter((a) => a.version === 2 && a.kind === "calibration").at(-1);
  const parts = [
    `${app.cps.toFixed(1)} ch/s`,
    calib ? `calibrated ${localDate(new Date(calib.endedAt))}` : "uncalibrated",
    `${dueCount()} due`,
    `${app.attempts.length} attempts`,
    app.settings.preset,
  ];
  return h("footer", { class: "status-line" }, ...parts.map((p) => h("span", {}, p)));
}

export function renderHome(tab: Tab, content: Node): void {
  const root = document.getElementById("app")!;
  clear(root);
  root.append(
    bannerNode(),
    h(
      "nav",
      { class: "tabs" },
      ...TABS.map((t) =>
        h("button", { class: `tab ${t.id === tab ? "active" : ""}`, onclick: () => nav.home(t.id) }, t.label),
      ),
    ),
    h("main", { class: "page" }, content),
    statusLine(),
  );
}

// Screens other than the home tabs: a slim drag strip instead of the banner.
export function renderScreen(content: Node, opts: { wide?: boolean } = {}): void {
  const root = document.getElementById("app")!;
  clear(root);
  root.append(
    h("div", { class: "drag-strip", "data-tauri-drag-region": "" }),
    h("main", { class: `page ${opts.wide ? "wide" : ""}` }, content),
    statusLine(),
  );
}
