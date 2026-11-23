// Keyboard-driven panes, used by every screen except play and results. One
// pane has focus and each pane has a cursor row; ↑↓ or j/k move the cursor,
// Tab, or ←→ / h/l, move between panes, Enter activates the cursor row, and
// the other keys run whatever actions the legend shows for the current row.
import { h } from "./dom";
import { plainKey, setKeys, typing } from "./keys";
import { scheduleContrast } from "./contrast";

export interface Row {
  id: string;
  el: HTMLElement;
  activate?: () => void;
}

export interface Pane {
  id: string;
  el: HTMLElement;     // the pane; rows live somewhere inside it
  rows: Row[];
  body?: HTMLElement;  // scrolled by j/k when the pane has no rows
  onCursor?: (row: Row) => void;
}

export interface KeyAction {
  keys: string[];      // KeyboardEvent.key values
  hint: string;        // as shown in the legend
  label: string;       // empty: a key with no legend entry
  run: () => void;
}

interface Controller {
  scope: string;
  root: HTMLElement;
  legend: HTMLElement;
  panes: Pane[];
  focus: string;
  actions: (pane: Pane | null, row: Row | null) => KeyAction[];
}

// Remembered across redraws: the cursor row of each pane and the focused
// pane, per screen.
const cursors = new Map<string, string>();
const focused = new Map<string, string>();
let ctl: Controller | null = null;

const cursorKey = (pane: Pane) => `${ctl!.scope}:${pane.id}`;

function inDocumentOrder(panes: Pane[]): Pane[] {
  return panes.slice().sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

function cursorRow(pane: Pane): Row | null {
  const id = cursors.get(cursorKey(pane));
  return pane.rows.find((r) => r.id === id) ?? pane.rows[0] ?? null;
}

function focusedPane(): Pane | null {
  return ctl?.panes.find((p) => p.id === ctl!.focus) ?? null;
}

// Keys shown in every legend, after the screen's own.
const MOVE_HINTS: KeyAction[] = [
  { keys: [], hint: "↑↓", label: "Move", run: () => {} },
  { keys: [], hint: "tab", label: "Pane", run: () => {} },
];

function paint(): void {
  if (!ctl) return;
  for (const pane of ctl.panes) {
    pane.el.classList.toggle("focused", pane.id === ctl.focus);
    const cur = cursorRow(pane);
    for (const r of pane.rows) r.el.classList.toggle("cursor", r === cur);
  }
  const pane = focusedPane();
  const row = pane ? cursorRow(pane) : null;
  const shown = [...ctl.actions(pane, row), ...MOVE_HINTS.slice(0, Math.min(2, ctl.panes.length))].filter((a) => a.label);
  ctl.legend.replaceChildren(...shown.map((a) =>
    h("button", { class: "key", tabindex: "-1", onclick: () => a.run() }, h("kbd", {}, a.hint), " ", a.label)));
}

// Bring a row into view inside a pane that scrolls its own rows. The first
// row takes the pane back to its very top, so a group label above it shows
// too.
function revealInPane(pane: Pane, row: Row): void {
  const body = pane.body;
  if (body && body.scrollHeight > body.clientHeight) {
    const b = body.getBoundingClientRect(), r = row.el.getBoundingClientRect();
    if (row === pane.rows[0]) body.scrollTop = 0;
    else if (r.top < b.top) body.scrollTop -= b.top - r.top;
    else if (r.bottom > b.bottom) body.scrollTop += r.bottom - b.bottom;
  }
}

// The same, and then the window scrolls if the row is outside it.
function reveal(pane: Pane, row: Row): void {
  revealInPane(pane, row);
  row.el.scrollIntoView({ block: "nearest" });
}

// The details are redrawn for the new row first: that can change the
// page's height and move the row, so it is brought into view afterwards.
function setCursor(pane: Pane, row: Row, scroll = true): void {
  cursors.set(cursorKey(pane), row.id);
  pane.onCursor?.(row);
  if (scroll) reveal(pane, row);
  paint();
}

// Focus from the keyboard also brings the pane on screen when the page is
// scrolled (a short window scrolls the whole home screen).
function setFocus(pane: Pane, reveal = false): void {
  ctl!.focus = pane.id;
  focused.set(ctl!.scope, pane.id);
  if (reveal) {
    const r = pane.el.getBoundingClientRect();
    pane.el.scrollIntoView({ block: r.top < 0 || r.height > window.innerHeight ? "start" : "nearest" });
    // The pane may have been scrolled with the mouse since its cursor last moved.
    const cur = cursorRow(pane);
    if (cur) revealInPane(pane, cur);
  }
  paint();
}

function wire(pane: Pane): void {
  for (const row of pane.rows) {
    row.el.addEventListener("click", () => { setFocus(pane); setCursor(pane, row, false); });
    row.el.addEventListener("dblclick", () => row.activate?.());
  }
  pane.el.addEventListener("mousedown", () => { if (ctl?.focus !== pane.id) setFocus(pane); });
}

export function mountPanes(opts: {
  scope: string;
  root: HTMLElement;
  legend: HTMLElement;
  panes: Pane[];
  actions: (pane: Pane | null, row: Row | null) => KeyAction[];
}): void {
  ctl = { ...opts, panes: [], focus: "" };
  setPanes([], opts.panes);
  const remembered = focused.get(opts.scope);
  const start = ctl.panes.find((p) => p.id === remembered) ?? ctl.panes.find((p) => p.rows.length) ?? ctl.panes[0];
  if (start) ctl.focus = start.id;
  // Draw the details of each pane's cursor row, then (the page now has its
  // final height) bring remembered cursors into view: each inside its own
  // pane, and the focused pane's in the window too. A fresh screen, with
  // nothing remembered, opens at the top.
  for (const pane of [...ctl.panes]) {
    const cur = cursorRow(pane);
    if (cur) pane.onCursor?.(cur);
  }
  for (const pane of ctl.panes) {
    const cur = cursorRow(pane);
    if (!cur || !cursors.has(cursorKey(pane))) continue;
    if (pane.id === ctl.focus) reveal(pane, cur); else revealInPane(pane, cur);
  }
  paint();
  setKeys(onKey);
}

// Move focus to the pane with this id, if it is on screen.
export function focusPane(id: string): void {
  const pane = ctl?.panes.find((p) => p.id === id);
  if (pane) setFocus(pane, true);
}

// Replace the panes with these ids (they may be gone or rebuilt) and add
// the new ones; used when a detail area is redrawn for a new cursor row.
export function setPanes(removeIds: string[], add: Pane[]): void {
  if (!ctl) return;
  ctl.panes = inDocumentOrder([...ctl.panes.filter((p) => !removeIds.includes(p.id)), ...add]);
  add.forEach(wire);
  if (!ctl.panes.some((p) => p.id === ctl!.focus)) ctl.focus = ctl.panes[0]?.id ?? "";
  paint();
  // New detail panes may sit over art: their text colors follow it.
  scheduleContrast();
}

function move(delta: number): void {
  const pane = focusedPane();
  if (!pane) return;
  if (!pane.rows.length) { (pane.body ?? pane.el).scrollBy({ top: delta * 48 }); return; }
  const cur = cursorRow(pane);
  const i = cur ? pane.rows.indexOf(cur) : -1;
  const next = pane.rows[Math.max(0, Math.min(pane.rows.length - 1, i + delta))];
  if (next && next !== cur) setCursor(pane, next);
}

function cycle(delta: number): void {
  if (!ctl || !ctl.panes.length) return;
  const i = ctl.panes.findIndex((p) => p.id === ctl!.focus);
  setFocus(ctl.panes[(i + delta + ctl.panes.length) % ctl.panes.length], true);
}

// The nearest pane to the left or right of the focused one, preferring
// panes that overlap it vertically.
function sideways(dir: -1 | 1): void {
  const pane = focusedPane();
  if (!ctl || !pane) return;
  const a = pane.el.getBoundingClientRect();
  let best: Pane | null = null, bestScore = Infinity;
  for (const p of ctl.panes) {
    if (p === pane) continue;
    const b = p.el.getBoundingClientRect();
    const gap = dir > 0 ? b.left - a.right : a.left - b.right;
    if (gap < -1) continue;
    const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    const score = gap + (overlap > 0 ? 0 : 10_000 - overlap);
    if (score < bestScore) { bestScore = score; best = p; }
  }
  if (best) setFocus(best, true);
}

function onKey(e: KeyboardEvent): boolean {
  if (!ctl || !ctl.root.isConnected) return false;
  if (!plainKey(e) || typing(e)) return false;
  const pane = focusedPane();
  const row = pane ? cursorRow(pane) : null;
  switch (e.key) {
    case "Tab": cycle(e.shiftKey ? -1 : 1); return true;
    case "ArrowDown": case "j": move(1); return true;
    case "ArrowUp": case "k": move(-1); return true;
    case "ArrowLeft": case "h": sideways(-1); return true;
    case "ArrowRight": case "l": sideways(1); return true;
    case "PageDown": move(10); return true;
    case "PageUp": move(-10); return true;
    case "Home": case "g": if (pane?.rows[0]) setCursor(pane, pane.rows[0]); return true;
    case "End": case "G": if (pane?.rows.length) setCursor(pane, pane.rows.at(-1)!); return true;
  }
  const action = ctl.actions(pane, row).find((a) => a.keys.includes(e.key));
  if (action) { action.run(); return true; }
  if (e.key === "Enter" && row?.activate) { row.activate(); return true; }
  return false;
}

// ---------- building blocks ----------

export function paneEl(id: string, title: string, body: HTMLElement, opts: { cols?: string; narrowCols?: string; extra?: string; meta?: string } = {}): HTMLElement {
  const style = [opts.cols ? `--cols: ${opts.cols}` : null, opts.narrowCols ? `--cols-narrow: ${opts.narrowCols}` : null].filter(Boolean).join("; ");
  return h("section", { class: `pane ${opts.narrowCols ? "squeeze" : ""} ${opts.extra ?? ""}`, "data-pane": id, style: style || null },
    h("header", { class: "pane-title" }, h("span", {}, title), opts.meta ? h("span", { class: "pane-meta" }, opts.meta) : null),
    body);
}

// `wideOnly`: indices of the cells left out when the pane is narrow.
export function cells(xs: (string | Node | null)[], wideOnly: number[] = []): HTMLElement[] {
  return xs.map((x, i) => h("span", { class: wideOnly.includes(i) ? "cell wide-only" : "cell" }, x ?? ""));
}

// A pane of table rows: a sticky header row, then one row per entry. With
// `fit`, the rows share one grid, so `cols` may size a column to its widest
// cell (max-content, fit-content) and leave the rest to the text columns.
// A fitted table can give up columns when its pane is narrow: `narrow`
// names the ones to drop (by index) and the grid for those that stay.
export function tablePane<T>(opts: {
  id: string;
  title: string;
  cols: string;
  head: string[];
  entries: T[];
  key: (t: T, i: number) => string;
  cells: (t: T, i: number) => (string | Node | null)[];
  rowClass?: (t: T) => string;
  activate?: (t: T) => (() => void) | undefined;
  extra?: string;
  meta?: string;
  fit?: boolean;
  narrow?: { drop: number[]; cols: string };
}): Pane {
  const drop = opts.narrow?.drop ?? [];
  // The column header stays put above the rows, which scroll on their own:
  // nothing ever passes under the header, so it needs no background of its
  // own and the pane looks the same all the way down.
  const scroller = h("div", { class: "rows" });
  const body = h("div", { class: `pane-body table ${opts.fit ? "fit" : ""}` }, h("div", { class: "row head" }, ...cells(opts.head, drop)), scroller);
  const rows: Row[] = opts.entries.map((t, i) => {
    const el = h("div", { class: `row ${opts.rowClass?.(t) ?? ""}` }, ...cells(opts.cells(t, i), drop));
    scroller.append(el);
    return { id: opts.key(t, i), el, activate: opts.activate?.(t) };
  });
  return { id: opts.id, el: paneEl(opts.id, opts.title, body, { cols: opts.cols, narrowCols: opts.narrow?.cols, extra: opts.extra, meta: opts.meta }), rows, body: scroller };
}

export const BACK = (run: () => void, label = "Back"): KeyAction => ({ keys: ["Escape", "Backspace"], hint: "esc", label, run });
