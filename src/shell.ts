// Page skeleton: title-bar drag strip, banner (home only), tabs, content,
// status line.
import { activeTheme, app, asset, dueCount } from "./app";
import { bannerImage, defaultBanner } from "./banner";
import { clear, h } from "./dom";
import { applyEdge } from "./edge";
import { nav, type Tab } from "./nav";
import { openSettingsWindow } from "./bus";
import { scheduleContrast } from "./contrast";
import { localDate } from "./schedule";

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "library", label: "Library" },
  { id: "stats", label: "Stats" },
  { id: "settings", label: "Settings" },
];

// The art's media (photo or drawing) is kept across redraws, so adjusting
// settings doesn't reload it. A different photo fades in over the old one.
let media: { key: string; el: HTMLElement | SVGSVGElement } | null = null;

function mediaFor(path: string, bannerH: number): { el: HTMLElement | SVGSVGElement; previous: Element | null } {
  const key = path ? `img:${path}` : "drawn";
  if (media && media.key === key) {
    if (!path) (media.el as SVGSVGElement).style.height = `${bannerH}px`;
    return { el: media.el, previous: null };
  }
  const previous = media?.el ?? null;
  let el: HTMLElement | SVGSVGElement;
  if (path) {
    const img = bannerImage("");
    img.classList.add("entering");
    asset(app.root, path).then(
      async (url) => {
        img.src = url;
        await img.decode().catch(() => {});
        img.classList.remove("entering");
        scheduleContrast();
        window.setTimeout(() => { if (previous && previous !== media?.el) previous.remove(); }, 350);
      },
      () => img.replaceWith(defaultBanner()),
    );
    el = img;
  } else {
    // The drawn landscape keeps the banner's proportions; below it the
    // front hill's color continues down to the edge.
    el = defaultBanner();
    el.style.height = `${bannerH}px`;
  }
  media = { key, el };
  return { el, previous: path ? previous : null };
}

// The banner art lives in a backdrop layer behind the page, so its edge can
// sit anywhere from 30% of the banner's height down into the body (300%).
function backdropNode(): HTMLElement {
  const theme = activeTheme();
  const bannerH = Number(theme.bannerHeight);
  const pos = Math.max(30, Math.min(300, Number(theme.bannerEdgePos ?? 100)));
  const artH = (bannerH * pos) / 100;
  const art = h("div", { class: "banner-art" });
  // Images cover whichever is taller, the banner or the art; when the edge
  // is raised they are cut off rather than squashed.
  art.style.height = `${artH}px`;
  art.style.setProperty("--art-height", `${Math.max(artH, bannerH)}px`);
  const path = String(theme.bannerImage ?? "");
  const { el, previous } = mediaFor(path, bannerH);
  if (previous) art.append(previous);
  art.append(el);
  if (!path) art.style.background = "var(--banner-hills)";
  applyEdge(art, (bannerH * Number(theme.edgeSmooth)) / 100, (bannerH * Number(theme.edgeDither)) / 100, artH);
  return h("div", { class: "backdrop" }, art);
}

let currentTab: Tab = "today";

function tabsNode(tab: Tab): HTMLElement {
  return h(
    "nav",
    { class: "tabs" },
    ...TABS.map((t) =>
      h("button", {
        class: t.id === "settings" ? "tab action" : `tab ${t.id === tab ? "active" : ""}`,
        onclick: (e: Event) => {
          (e.currentTarget as HTMLButtonElement).blur();
          if (t.id === "settings") openSettingsWindow(() => nav.home("settings"));
          else nav.home(t.id);
        },
      }, t.label),
    ),
  );
}

// Banner: title plate, and in the "card" tab style the tabs sit inside it.
function bannerNode(tab: Tab): HTMLElement {
  const due = dueCount();
  const now = new Date();
  const dateLabel = `${now.toLocaleDateString("en-GB", { weekday: "long" })} ${now.getDate()} ${now.toLocaleDateString("en-GB", { month: "long" })}`;
  const style = String(activeTheme().tabs ?? "pill");
  return h(
    "div",
    { class: "banner", "data-tauri-drag-region": "" },
    h(
      "div",
      { class: "banner-text" },
      h("div", { class: "banner-title" }, "Tembo"),
      h("div", { class: "banner-sub" }, `${dateLabel} · ${due} due`),
      style === "card" ? tabsNode(tab) : null,
    ),
  );
}

// Tab bar below the banner; empty in the "card" style.
function tabBarNode(tab: Tab): HTMLElement {
  const style = String(activeTheme().tabs ?? "pill");
  const root = document.getElementById("app")!;
  root.dataset.tabs = style;
  root.dataset.surfaces = String(activeTheme().surfaces ?? "plates");
  return h("div", { class: "tabs-wrap" }, style === "card" ? null : tabsNode(tab));
}

// Redraw the banner and its art (for live changes in Settings). No-op on
// screens without a banner.
export function refreshBanner(): void {
  if (!document.querySelector(".backdrop")) return;
  document.querySelector(".backdrop")?.replaceWith(backdropNode());
  document.querySelector(".banner")?.replaceWith(bannerNode(currentTab));
  document.querySelector(".tabs-wrap")?.replaceWith(tabBarNode(currentTab));
  scheduleContrast();
}

export function refreshStatus(): void {
  document.querySelector(".status-line")?.replaceWith(statusLine());
}

// Is the home screen showing (as opposed to play, results or detail)?
export function onHome(): Tab | null {
  return document.querySelector(".backdrop") ? currentTab : null;
}

// The settings window: a drag strip and the settings page, nothing else.
export function renderSettingsWindow(content: Node): void {
  const root = document.getElementById("app")!;
  clear(root);
  root.append(
    h("div", { class: "drag-strip", "data-tauri-drag-region": "" }),
    h("main", { class: "page settings-window" }, content),
  );
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
  currentTab = tab;
  const root = document.getElementById("app")!;
  clear(root);
  root.append(backdropNode(), bannerNode(tab), tabBarNode(tab), h("main", { class: "page" }, content), statusLine());
  scheduleContrast();
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
