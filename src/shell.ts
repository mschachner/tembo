// Page skeleton: title-bar drag strip, banner (home only), tabs, content,
// status line.
import { activeTheme, app, asset, dueCount } from "./app";
import { bannerImage, defaultBanner } from "./banner";
import { clear, h } from "./dom";
import { applyEdge } from "./edge";
import { nav, type Tab } from "./nav";
import { openSettingsWindow } from "./bus";
import { scheduleContrast } from "./contrast";
import { indexForStagger } from "./motion";
import { localDate } from "./schedule";

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "library", label: "Library" },
  { id: "watering-hole", label: "Watering Hole" },
  { id: "stats", label: "Stats" },
];

// Settings opens in its own window, from a gear in the top-right corner.
const GEAR_PATH = "M19.64 10.42 L22.12 10.72 L22.12 13.28 L19.64 13.58 L18.52 16.28 L20.06 18.25 L18.25 20.06 L16.28 18.52 L13.58 19.64 L13.28 22.12 L10.72 22.12 L10.42 19.64 L7.72 18.52 L5.75 20.06 L3.94 18.25 L5.48 16.28 L4.36 13.58 L1.88 13.28 L1.88 10.72 L4.36 10.42 L5.48 7.72 L3.94 5.75 L5.75 3.94 L7.72 5.48 L10.42 4.36 L10.72 1.88 L13.28 1.88 L13.58 4.36 L16.28 5.48 L18.25 3.94 L20.06 5.75 L18.52 7.72 Z M15.2 12 A3.2 3.2 0 1 0 8.8 12 A3.2 3.2 0 1 0 15.2 12 Z";

function gearButton(): HTMLElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.innerHTML = `<path d="${GEAR_PATH}" fill="currentColor" fill-rule="evenodd" />`;
  return h("button", {
    class: "settings-gear", title: "Settings", "aria-label": "Settings",
    onclick: (e: Event) => {
      (e.currentTarget as HTMLButtonElement).blur();
      void openSettingsWindow(() => nav.home("settings"));
    },
  }, svg);
}

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
    ...TABS.map((t, i) =>
      h("button", {
        class: `tab ${t.id === tab ? "active" : ""}`, "data-key": String(i + 1), tabindex: "-1",
        onclick: (e: Event) => {
          (e.currentTarget as HTMLButtonElement).blur();
          nav.home(t.id);
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
  indexForStagger(document.getElementById("app")!);
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

export function renderHome(tab: Tab, content: Node, opts: { panes?: boolean } = {}): void {
  currentTab = tab;
  const root = document.getElementById("app")!;
  clear(root);
  root.dataset.layout = opts.panes ? "panes" : "page";
  root.append(backdropNode(), bannerNode(tab), tabBarNode(tab), h("main", { class: opts.panes ? "page panes-page" : "page" }, content), statusLine(), gearButton());
  scheduleContrast();
  indexForStagger(document.getElementById("app")!);
}

// Screens other than the home tabs: a slim drag strip instead of the banner.
export function renderScreen(content: Node, opts: { wide?: boolean } = {}): void {
  const root = document.getElementById("app")!;
  clear(root);
  root.dataset.layout = "page";
  root.append(
    h("div", { class: "drag-strip", "data-tauri-drag-region": "" }),
    h("main", { class: `page ${opts.wide ? "wide" : ""}` }, content),
    statusLine(),
    gearButton(),
  );
  indexForStagger(document.getElementById("app")!);
}
