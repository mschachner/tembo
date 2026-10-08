// Keyboard-driven panes for the home screen's "panes" layout. One pane has
// focus and each pane has a cursor row; arrow keys or j/k move the cursor,
// Tab moves between panes, Enter activates the cursor row, and the other
// keys run whatever actions the legend shows for the current row.
import { h } from "./dom";

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
  label: string;
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
// pane, per tab.
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

function paint(): void {
  if (!ctl) return;
  for (const pane of ctl.panes) {
    pane.el.classList.toggle("focused", pane.id === ctl.focus);
    const cur = cursorRow(pane);
    for (const r of pane.rows) r.el.classList.toggle("cursor", r === cur);
  }
  const pane = focusedPane();
  const row = pane ? cursorRow(pane) : null;
  // Unlabeled actions are keys only.
  ctl.legend.replaceChildren(...ctl.actions(pane, row).filter((a) => a.label).map((a) =>
    h("button", { class: "key", tabindex: "-1", onclick: () => a.run() }, h("kbd", {}, a.hint), " ", a.label)));
}

function setCursor(pane: Pane, row: Row, scroll = true): void {
  cursors.set(cursorKey(pane), row.id);
  if (scroll) row.el.scrollIntoView({ block: "nearest" });
  pane.onCursor?.(row);
  paint();
}

function setFocus(pane: Pane): void {
  ctl!.focus = pane.id;
  focused.set(ctl!.scope, pane.id);
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
  for (const pane of ctl.panes) {
    const cur = cursorRow(pane);
    if (cur) { cur.el.scrollIntoView({ block: "nearest" }); pane.onCursor?.(cur); }
  }
  paint();
}

// Replace the panes with these ids (they may be gone or rebuilt) and add
// the new ones; used when a detail area is redrawn for a new cursor row.
export function setPanes(removeIds: string[], add: Pane[]): void {
  if (!ctl) return;
  ctl.panes = inDocumentOrder([...ctl.panes.filter((p) => !removeIds.includes(p.id)), ...add]);
  add.forEach(wire);
  if (!ctl.panes.some((p) => p.id === ctl!.focus)) ctl.focus = ctl.panes[0]?.id ?? "";
  paint();
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
  setFocus(ctl.panes[(i + delta + ctl.panes.length) % ctl.panes.length]);
}

window.addEventListener("keydown", (e) => {
  if (!ctl || !ctl.root.isConnected) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if ((e.target as HTMLElement).closest?.("input, textarea, select")) return;
  const pane = focusedPane();
  const row = pane ? cursorRow(pane) : null;
  let handled = true;
  switch (e.key) {
    case "Tab": cycle(e.shiftKey ? -1 : 1); break;
    case "ArrowDown": case "j": move(1); break;
    case "ArrowUp": case "k": move(-1); break;
    case "PageDown": move(10); break;
    case "PageUp": move(-10); break;
    case "Enter": row?.activate?.(); break;
    default: {
      const action = ctl.actions(pane, row).find((a) => a.keys.includes(e.key));
      if (action) action.run(); else handled = false;
    }
  }
  if (handled) e.preventDefault();
});
