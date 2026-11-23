// Small charts in the theme's colors, for the quiz details and the Stats
// tab. Horizontal positions are percentages of the drawing, so a chart
// fills whatever width its pane gives it, while heights are in pixels so
// marks keep their size. Every mark carries a tooltip (data-tip, see
// tip.ts); the numbers are also in the tables and facts beside each chart.
import { h } from "./dom";

const NS = "http://www.w3.org/2000/svg";

// Fill names map to CSS classes (c-accent, c-instant, ...) that set `color`;
// marks are drawn in currentColor.
export type Fill = "accent" | "instant" | "slow" | "missed" | "muted" | "fg2" | "line";

function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number | null | undefined> = {}, ...children: (Node | null)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  for (const c of children) if (c) el.append(c);
  return el;
}

const pct = (x: number) => `${(Math.round(x * 1000) / 1000).toFixed(3)}%`;

// A column: 4px rounded data-end, square at the baseline.
function bar(x: string, w: string, top: number, bottom: number, fill: Fill): SVGGElement {
  const hgt = Math.max(0, bottom - top);
  const g = s("g", { class: `c-${fill}` });
  if (hgt <= 0) return g;
  const r = Math.min(4, hgt / 2);
  g.append(s("rect", { x, width: w, y: top, height: hgt, rx: r }));
  if (hgt > r) g.append(s("rect", { x, width: w, y: bottom - r, height: r }));
  return g;
}

export interface Column {
  value: number;
  label?: string;        // under the column
  tip?: string;          // hover text
  fill?: Fill;
  stack?: { value: number; fill: Fill }[];   // bottom to top; replaces value/fill
}

export interface ColumnsOpts {
  height?: number;       // px of the plot
  max?: number;          // top of the scale (default: the largest column)
  labels?: "all" | "ends" | "none";
  marker?: number;       // a vertical hairline at this fraction (0–1) of the width, e.g. a threshold
  markerTip?: string;
  highlight?: number;    // index of a column drawn in the accent (the others muted)
}

// Column chart. Each slot has one column (or a stack with 2px surface gaps).
export function columns(cols: Column[], opts: ColumnsOpts = {}): HTMLElement {
  const H = opts.height ?? 72;
  const n = Math.max(1, cols.length);
  const total = (c: Column) => c.stack ? c.stack.reduce((a, p) => a + p.value, 0) : c.value;
  const max = Math.max(opts.max ?? 0, ...cols.map(total), 1e-9);
  const slot = 100 / n;
  const wFrac = n <= 8 ? 0.42 : n <= 20 ? 0.6 : 0.72;
  const svg = s("svg", { class: "chart-svg", width: "100%", height: H, viewBox: null });
  svg.style.height = `${H}px`;
  svg.append(s("line", { class: "grid", x1: "0", x2: "100%", y1: H - 0.5, y2: H - 0.5 }));
  cols.forEach((c, i) => {
    const x = pct(slot * (i + (1 - wFrac) / 2));
    const w = pct(slot * wFrac);
    const tip = c.tip ?? (c.label ? `${c.label}: ${total(c)}` : String(total(c)));
    // Hover target: the whole slot, so short and empty columns have one too.
    const g = s("g", { class: "col", "data-tip": tip }, s("rect", { class: "hit", x: pct(slot * i), width: pct(slot), y: 0, height: H }));
    if (c.stack) {
      let bottom = H - 1;
      const parts = c.stack.filter((p) => p.value > 0);
      parts.forEach((p, k) => {
        const hgt = (p.value / max) * (H - 2);
        const top = bottom - hgt;
        const last = k === parts.length - 1;
        if (last) g.append(bar(x, w, top, bottom, p.fill));
        else g.append(s("rect", { class: `c-${p.fill}`, x, width: w, y: top, height: Math.max(0, hgt - 2) }));
        bottom = top;
      });
    } else {
      const fill = opts.highlight !== undefined ? (i === opts.highlight ? "accent" : "muted") : (c.fill ?? "accent");
      g.append(bar(x, w, H - 1 - (c.value / max) * (H - 2), H - 1, fill));
    }
    svg.append(g);
  });
  if (opts.marker !== undefined) {
    // The hairline itself is too thin to point at; a wider clear line carries its tooltip.
    const x = pct(opts.marker * 100);
    svg.append(s("line", { class: "marker", x1: x, x2: x, y1: 0, y2: H }));
    if (opts.markerTip) svg.append(s("line", { class: "marker-hit", x1: x, x2: x, y1: 0, y2: H, "data-tip": opts.markerTip }));
  }
  const wrap = h("div", { class: "chart columns" }, svg);
  const mode = opts.labels ?? (n <= 12 ? "all" : "ends");
  if (mode === "all" && cols.some((c) => c.label)) {
    const row = h("div", { class: "chart-labels mono", style: `grid-template-columns: repeat(${n}, 1fr)` });
    cols.forEach((c) => row.append(h("span", {}, c.label ?? "")));
    wrap.append(row);
  } else if (mode === "ends" && cols.some((c) => c.label)) {
    wrap.append(h("div", { class: "chart-labels mono ends-row" }, h("span", {}, cols[0].label ?? ""), h("span", {}, cols[n - 1].label ?? "")));
  }
  return wrap;
}

export interface Series { points: (number | null)[]; fill: Fill; name?: string }

export interface LineOpts {
  height?: number;
  min?: number;          // default 0
  max?: number;          // default the largest point
  labels?: string[];     // one per x, shown at the ends
  tips?: string[];       // one per x
  grid?: number[];       // fractions (0–1) of the range to rule; default [0, .5, 1]
}

// Line chart of one or more series over the same x positions. 2px lines,
// an 8px end marker with a 2px surface ring, legend when there are two.
export function lines(series: Series[], opts: LineOpts = {}): HTMLElement {
  const H = opts.height ?? 72;
  const n = Math.max(...series.map((sr) => sr.points.length), 1);
  const lo = opts.min ?? 0;
  const hi = Math.max(opts.max ?? -Infinity, ...series.flatMap((sr) => sr.points.filter((p): p is number => p !== null)), lo + 1e-9);
  const yOf = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  const xOf = (i: number) => n === 1 ? 50 : (i / (n - 1)) * 100;
  const svg = s("svg", { class: "chart-svg", width: "100%", height: H });
  svg.style.height = `${H}px`;
  for (const f of opts.grid ?? [0, 0.5, 1]) {
    const y = Math.round(H - f * (H - 1)) - 0.5;
    svg.append(s("line", { class: "grid", x1: "0", x2: "100%", y1: y, y2: y }));
  }
  // The plot is a 100×100 box stretched to the drawing; strokes don't scale.
  const plot = s("svg", { class: "plot", viewBox: "0 0 100 100", preserveAspectRatio: "none", width: "100%", height: "100%" });
  for (const sr of series) {
    const pts = sr.points.map((p, i) => (p === null ? null : `${xOf(i)},${yOf(p)}`)).filter((x): x is string => x !== null);
    if (pts.length > 1) plot.append(s("polyline", { class: `c-${sr.fill}`, points: pts.join(" ") }));
  }
  svg.append(plot);
  // End markers.
  for (const sr of series) {
    for (let i = sr.points.length - 1; i >= 0; i--) {
      const p = sr.points[i];
      if (p === null) continue;
      svg.append(s("svg", { class: `marker c-${sr.fill}`, x: pct(xOf(i)), y: `${((yOf(p) / 100) * (H - 1)).toFixed(1)}`, overflow: "visible" }, s("circle", { r: 4 })));
      break;
    }
  }
  // Hit targets: one slot per x.
  if (opts.tips) {
    const slot = 100 / n;
    opts.tips.forEach((t, i) => svg.append(s("rect", { class: "hit", x: pct(slot * i), width: pct(slot), y: 0, height: H, "data-tip": t })));
  }
  const wrap = h("div", { class: "chart lines" }, svg);
  if (opts.labels?.length) {
    wrap.append(h("div", { class: "chart-labels mono ends-row" }, h("span", {}, opts.labels[0]), h("span", {}, opts.labels.at(-1) ?? "")));
  }
  if (series.length > 1) {
    wrap.append(h("div", { class: "chart-legend" }, ...series.map((sr) => h("span", {}, h("i", { class: `swatch c-${sr.fill}` }), sr.name ?? ""))));
  }
  return wrap;
}

// A row of segments adding up to a whole (status breakdowns), with a legend.
export function segments(parts: { value: number; fill: Fill; label: string }[], opts: { legend?: boolean } = {}): HTMLElement {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const bar = h("div", { class: "segments" });
  for (const p of parts) {
    if (p.value <= 0) continue;
    bar.append(h("i", { class: `c-${p.fill}`, style: `flex: ${p.value} ${p.value} 0`, "data-tip": `${p.label}: ${p.value}${total ? ` (${Math.round((100 * p.value) / total)}%)` : ""}` }));
  }
  if (!total) bar.append(h("i", { class: "c-line", style: "flex: 1" }));
  const wrap = h("div", { class: "chart segments-chart" }, bar);
  if (opts.legend !== false) {
    wrap.append(h("div", { class: "chart-legend" }, ...parts.map((p) =>
      h("span", {}, h("i", { class: `swatch c-${p.fill}` }), `${p.label} `, h("b", { class: "mono" }, String(p.value))))));
  }
  return wrap;
}

// A grid of colored cells: rows of items, columns of attempts.
export interface HeatRow { label: Node | string; cells: { fill: Fill | null; tip?: string }[] }

export function heatmap(rows: HeatRow[], colTips: string[] = []): HTMLElement {
  const n = Math.max(1, ...rows.map((r) => r.cells.length));
  const grid = h("div", { class: "heatmap", style: `--n: ${n}` });
  for (const r of rows) {
    grid.append(h("span", { class: "heat-label" }, r.label));
    const cells = h("div", { class: "heat-cells" });
    r.cells.forEach((c, i) => cells.append(h("i", { class: c.fill ? `c-${c.fill}` : "empty", "data-tip": c.tip ?? colTips[i] ?? null })));
    grid.append(cells);
  }
  return h("div", { class: "chart" }, grid);
}

// Weeks × weekdays, one cell per day, darker with more activity.
export function calendar(counts: Map<string, number>, weeks: number, today: string, dayKey: (d: Date) => string): HTMLElement {
  const end = new Date(today + "T12:00:00");
  // Start on the Monday `weeks` weeks back, so columns are whole weeks.
  const start = new Date(end);
  start.setDate(end.getDate() - (weeks * 7 - 1) - ((end.getDay() + 6) % 7));
  const max = Math.max(1, ...counts.values());
  const grid = h("div", { class: "calendar", style: `--weeks: ${Math.ceil(((end.getTime() - start.getTime()) / 86400000 + 1) / 7)}` });
  const months = h("div", { class: "cal-months mono" });
  let lastMonth = -1;
  for (let d = new Date(start), col = 0; d <= end; d.setDate(d.getDate() + 1)) {
    const key = dayKey(d);
    const n = counts.get(key) ?? 0;
    const level = n === 0 ? 0 : Math.min(4, 1 + Math.floor((3 * (n - 1)) / Math.max(1, max - 1)));
    const cell = h("i", { class: `lvl-${level} ${key === today ? "today" : ""}`, "data-tip": `${key}: ${n} attempt${n === 1 ? "" : "s"}` });
    grid.append(cell);
    if (d.getDay() === 1) {
      if (d.getMonth() !== lastMonth) { months.append(h("span", { style: `grid-column: ${col + 1}` }, d.toLocaleDateString("en-US", { month: "short" }))); lastMonth = d.getMonth(); }
      col++;
    }
  }
  return h("div", { class: "chart calendar-chart" }, months, grid);
}

// A figure with its label, for rows of key numbers.
export function tile(label: string, value: string | Node, sub?: string | Node | null): HTMLElement {
  return h("div", { class: "tile" },
    h("div", { class: "tile-value" }, value),
    h("div", { class: "tile-label" }, label),
    sub ? h("div", { class: "tile-sub muted" }, sub) : null);
}

export function tiles(...ts: (HTMLElement | null)[]): HTMLElement {
  return h("div", { class: "tiles" }, ...ts.filter((t): t is HTMLElement => t !== null));
}

// A titled block holding one chart, for the detail and stats grids.
export function figure(name: string, body: Node, meta?: string): HTMLElement {
  return h("section", { class: "pane figure" },
    h("header", { class: "pane-title" }, h("span", {}, name), meta ? h("span", { class: "pane-meta" }, meta) : null),
    h("div", { class: "figure-body" }, body));
}
