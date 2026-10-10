// Keyboard control of the settings page. Every control row, group heading,
// preset row and the tab bar is a row; ↑↓ or j/k move between rows, Tab
// jumps to the next group, ←→ or h/l adjust sliders, pick choices and move
// along rows of buttons, Enter presses, toggles or starts editing, r resets
// a changed value to the preset's, and Escape closes settings.
//
// The page is redrawn after many changes; the cursor is kept by row id.
import { h } from "../dom";
import { setKeys, typing } from "../keys";

const ROWS = ".settings-tabs, .preset-row, .preset-actions, .save-preset, details.group > summary, .control";
const ITEMS = "button:not(.control-reset):not(.preset-delete), input, summary";

let cursor = { id: "", item: 0, index: 0 };

type Kind = "tabs" | "range" | "choice" | "presets" | "summary" | "buttons";

function kindOf(row: HTMLElement): Kind {
  if (row.matches(".settings-tabs")) return "tabs";
  if (row.matches("summary")) return "summary";
  if (row.matches(".preset-row")) return "presets";
  if (row.querySelector("input[type=range]")) return "range";
  if (row.matches(".control") && row.querySelector(".presets")) return "choice";
  return "buttons";
}

function rowId(row: HTMLElement): string {
  if (row.matches(".settings-tabs")) return "tabs";
  if (row.matches(".preset-row")) return `presets:${row.querySelector(".preset-row-label")?.textContent}`;
  if (row.matches(".preset-actions")) return "preset-actions";
  if (row.matches(".save-preset")) return "save-preset";
  if (row.matches("summary")) return `group:${row.textContent}`;
  const group = row.closest("details")?.querySelector(":scope > summary")?.textContent ?? "";
  return `ctl:${row.dataset.key ?? `${group}:${row.querySelector("label")?.textContent ?? ""}`}`;
}

const visible = (el: Element) => el.getClientRects().length > 0;

export function mountSettingsNav(root: HTMLElement, close: () => void): void {
  const legend = h("nav", { class: "keys settings-keys" });
  root.append(legend);

  const rows = () => [...root.querySelectorAll<HTMLElement>(ROWS)].filter((r) => visible(r) && !r.classList.contains("disabled"));
  const itemsOf = (row: HTMLElement) =>
    (row.matches("summary") ? [row] : [...row.querySelectorAll<HTMLElement>(ITEMS)]).filter(visible);

  function current(): { row: HTMLElement | null; list: HTMLElement[]; i: number } {
    const list = rows();
    let i = list.findIndex((r) => rowId(r) === cursor.id);
    if (i < 0) i = Math.max(0, Math.min(list.length - 1, cursor.index));
    return { row: list[i] ?? null, list, i };
  }

  function item(row: HTMLElement): HTMLElement | null {
    const items = itemsOf(row);
    if (!items.length) return null;
    // Choice rows and the tab bar point at their selected button.
    const k = kindOf(row);
    if (k === "choice" || k === "tabs") return items.find((b) => b.classList.contains("active")) ?? items[0];
    return items[Math.max(0, Math.min(items.length - 1, cursor.item))];
  }

  function select(row: HTMLElement, list: HTMLElement[], itemIndex = cursor.item, scroll = true): void {
    const id = rowId(row);
    if (id !== cursor.id) itemIndex = kindOf(row) === "presets"
      ? Math.max(0, itemsOf(row).findIndex((b) => b.parentElement?.classList.contains("active")))
      : itemIndex;
    cursor = { id, item: itemIndex, index: list.indexOf(row) };
    if (scroll) row.scrollIntoView({ block: "nearest" });
    paint();
  }

  function paint(): void {
    for (const el of root.querySelectorAll(".nav-row, .nav-item")) el.classList.remove("nav-row", "nav-item");
    const { row } = current();
    if (!row) return;
    row.classList.add("nav-row");
    const it = item(row);
    if (it && it !== row) it.classList.add("nav-item");
    legend.replaceChildren(...hints(row, it).map(([k, label]) => h("span", { class: "key" }, h("kbd", {}, k), " ", label)));
  }

  function hints(row: HTMLElement, it: HTMLElement | null): [string, string][] {
    if (it instanceof HTMLInputElement && it.type === "text" && document.activeElement === it) return [["enter", "Done"], ["esc", "Cancel"]];
    const out: [string, string][] = [["↑↓", "Move"]];
    const k = kindOf(row);
    if (k === "range") out.push(["←→", "Adjust"]);
    else if (k === "choice" || k === "tabs") out.push(["←→", "Choose"]);
    else if (k === "summary") out.push(["enter", (row.parentElement as HTMLDetailsElement).open ? "Close" : "Open"]);
    else if (k === "presets") {
      out.push(["←→", "Select"], ["enter", "Apply"]);
      if (it?.parentElement?.querySelector(".preset-delete")) out.push(["x", "Delete"]);
    } else if (it) {
      if (row.closest(".color-col")) out.push(["←→", "Column"]);
      else if (itemsOf(row).length > 1) out.push(["←→", "Select"]);
      const input = it as HTMLInputElement;
      const verb = it.tagName === "BUTTON" ? (it.textContent ?? "").trim()
        : input.type === "checkbox" ? "Toggle" : input.type === "color" ? "Pick color" : "Edit";
      out.push(["enter", verb]);
    }
    if (row.classList.contains("overridden")) out.push(["r", "Reset"]);
    out.push(["tab", "Group"], ["esc", "Close"]);
    return out;
  }

  function press(row: HTMLElement): void {
    const it = item(row);
    if (!it) return;
    if (it instanceof HTMLInputElement) {
      if (it.type === "checkbox") it.click();
      else if (it.type === "color") {
        const picker = it as HTMLInputElement & { showPicker?: () => void };
        try { if (picker.showPicker) picker.showPicker(); else it.click(); } catch { it.click(); }
      } else if (it.type === "text") { it.focus(); it.select(); paint(); }
      return;
    }
    it.click();
    // A click may redraw the page (which remounts this) or open a group.
    if (it.isConnected) paint();
  }

  function sideways(row: HTMLElement, dir: -1 | 1, big: boolean): void {
    const k = kindOf(row);
    if (k === "summary") {
      const d = row.parentElement as HTMLDetailsElement;
      if (d.open !== (dir > 0)) row.click();
      paint();
      return;
    }
    if (k === "range") {
      const r = row.querySelector<HTMLInputElement>("input[type=range]")!;
      const step = Number(r.step) || 1;
      const v = Math.max(Number(r.min), Math.min(Number(r.max), Number(r.value) + dir * step * (big ? 10 : 1)));
      r.value = String(Math.round(v / step) * step);
      r.dispatchEvent(new Event("input", { bubbles: true }));
      r.dispatchEvent(new Event("change", { bubbles: true }));
      paint();
      return;
    }
    // In the color grid, ←→ move between columns.
    const col = row.closest(".color-col");
    if (col) {
      const cols = [...root.querySelectorAll(".color-col")];
      const at = [...col.querySelectorAll(".control")].indexOf(row);
      const next = cols[cols.indexOf(col) + dir]?.querySelectorAll<HTMLElement>(".control");
      if (next?.length) select(next[Math.min(at, next.length - 1)], rows());
      return;
    }
    const items = itemsOf(row);
    if (!items.length) return;
    if (k === "choice" || k === "tabs") {
      const i = items.indexOf(item(row)!);
      const next = items[i + dir];
      if (next) { next.click(); if (next.isConnected) paint(); }
      return;
    }
    cursor.item = Math.max(0, Math.min(items.length - 1, cursor.item + dir));
    paint();
  }

  function nextGroup(dir: -1 | 1): void {
    const { list, i } = current();
    for (let j = i + dir; j >= 0 && j < list.length; j += dir) {
      if (list[j].matches("summary, .settings-tabs")) { select(list[j], list); return; }
    }
  }

  // Remember a field's value when editing starts, for Escape.
  root.addEventListener("focusin", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.matches?.("input[type=text]")) t.dataset.orig = t.value;
    const row = t.closest?.<HTMLElement>(ROWS);
    if (row) { const list = rows(); const items = itemsOf(row); select(row, list, Math.max(0, items.indexOf(t)), false); }
  });
  root.addEventListener("focusout", () => window.setTimeout(paint, 0));
  root.addEventListener("mousedown", (e) => {
    const row = (e.target as HTMLElement).closest?.<HTMLElement>(ROWS);
    if (!row || !root.contains(row)) return;
    const items = itemsOf(row);
    const hit = items.findIndex((x) => x.contains(e.target as Node));
    select(row, rows(), hit >= 0 ? hit : cursor.item, false);
  });

  setKeys((e) => {
    if (!root.isConnected || e.metaKey || e.ctrlKey || e.altKey) return false;
    if (typing(e)) {
      const field = e.target as HTMLInputElement;
      if (!root.contains(field)) return false;
      if (e.key === "Enter") {
        field.blur();
        const save = field.closest(".save-preset")?.querySelector("button");
        if (save) save.click();
        paint();
        return true;
      }
      if (e.key === "Escape") {
        if (field.dataset.orig !== undefined) field.value = field.dataset.orig;
        field.blur();
        paint();
        return true;
      }
      return false;
    }
    const { row, list, i } = current();
    switch (e.key) {
      case "ArrowDown": case "j": if (list[i + 1]) select(list[i + 1], list); return true;
      case "ArrowUp": case "k": if (i > 0) select(list[i - 1], list); return true;
      case "ArrowLeft": case "h": if (row) sideways(row, -1, e.shiftKey); return true;
      case "ArrowRight": case "l": if (row) sideways(row, 1, e.shiftKey); return true;
      case "Tab": nextGroup(e.shiftKey ? -1 : 1); return true;
      case "Enter": case " ": if (row) press(row); return true;
      case "Escape": close(); return true;
      case "r": {
        const reset = row?.classList.contains("overridden") ? row.querySelector<HTMLButtonElement>(".control-reset") : null;
        reset?.click();
        return true;
      }
      case "x": {
        const del = row && kindOf(row) === "presets" ? item(row)?.parentElement?.querySelector<HTMLButtonElement>(".preset-delete") : null;
        del?.click();
        return true;
      }
      case "1": case "2": {
        cursor = { id: "tabs", item: 0, index: 0 };
        root.querySelectorAll<HTMLButtonElement>(".settings-tabs .tab")[Number(e.key) - 1]?.click();
        return true;
      }
    }
    return false;
  });

  const { row, list } = current();
  if (row) select(row, list, cursor.item, false);
}
