import { h } from "../dom";
import type { DiagramNode, Quiz } from "../quiz/format";

// Draws quiz.diagram. Nodes are boxes positioned by percentage over the
// drawing, so it scales down with the window; edges are an SVG layer
// underneath, redrawn whenever the drawing or any box changes size
// (answers filling in change box widths).
//
// `fill` puts the contents into each blank node; anchors get their text.

const PAD = 0.75;   // grid units of margin around the outermost node centres
const GAP = 4;      // px between an edge's end and the box it meets
const HEAD = 9;     // arrowhead length, px

const SVG = "http://www.w3.org/2000/svg";

export interface DiagramDisplay {
  el: HTMLElement;
  nodeOf: Map<number, HTMLElement>;   // item index → its node
}

export function diagramDisplay(quiz: Quiz, fill: (item: number, node: HTMLElement) => void): DiagramDisplay {
  const d = quiz.diagram!;
  const xs = d.nodes.map((n) => n.x), ys = d.nodes.map((n) => n.y);
  const minX = Math.min(...xs) - PAD, maxX = Math.max(...xs) + PAD;
  const minY = Math.min(...ys) - PAD, maxY = Math.max(...ys) + PAD;
  const w = maxX - minX, ht = maxY - minY;

  const svg = document.createElementNS(SVG, "svg");
  svg.classList.add("diagram-edges");
  const box = h("div", {
    class: "diagram",
    style: `max-width: ${w * d.scale}px; min-width: ${w * d.scale * 0.6}px; aspect-ratio: ${w} / ${ht}`,
  });
  box.append(svg);

  const nodeOf = new Map<number, HTMLElement>();
  const els = d.nodes.map((n: DiagramNode) => {
    const el = h("div", {
      class: `dnode ${n.given !== undefined ? "given" : "blank"}`,
      style: `left: ${((n.x - minX) / w) * 100}%; top: ${((maxY - n.y) / ht) * 100}%`,
    });
    if (n.given !== undefined) el.append(n.given);
    else { nodeOf.set(n.item!, el); fill(n.item!, el); }
    box.append(el);
    return el;
  });

  // Layout positions (offset*), not getBoundingClientRect, so entrance
  // animations' transforms don't skew the lines. Each node's left/top is
  // its centre; CSS translates the box by half its size.
  function draw(): void {
    svg.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${box.clientWidth} ${box.clientHeight}`);
    const r = els.map((el) => ({ x: el.offsetLeft, y: el.offsetTop, hw: el.offsetWidth / 2, hh: el.offsetHeight / 2 }));
    for (const e of d.edges) {
      const a = r[e.from], b = r[e.to];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
      if (len === 0) continue;
      const ux = dx / len, uy = dy / len;
      // Distance from a box's centre to its border along the edge.
      const out = (q: typeof a) => Math.min(q.hw / Math.abs(ux || 1e-9), q.hh / Math.abs(uy || 1e-9));
      const s = out(a) + GAP, t = len - out(b) - GAP;
      if (t - s < (e.arrow ? HEAD + 2 : 2)) continue;   // boxes too close to draw between
      const end = e.arrow ? t - HEAD + 1 : t;
      const line = document.createElementNS(SVG, "line");
      line.setAttribute("x1", String(a.x + ux * s)); line.setAttribute("y1", String(a.y + uy * s));
      line.setAttribute("x2", String(a.x + ux * end)); line.setAttribute("y2", String(a.y + uy * end));
      svg.append(line);
      if (e.arrow) {
        const tx = a.x + ux * t, ty = a.y + uy * t;
        const bx = tx - ux * HEAD, by = ty - uy * HEAD;
        const head = document.createElementNS(SVG, "polygon");
        head.setAttribute("points", `${tx},${ty} ${bx - uy * HEAD * 0.45},${by + ux * HEAD * 0.45} ${bx + uy * HEAD * 0.45},${by - ux * HEAD * 0.45}`);
        svg.append(head);
      }
    }
  }
  const watch = new ResizeObserver(() => draw());
  watch.observe(box);
  els.forEach((el) => watch.observe(el));

  return { el: h("div", { class: "diagram-wrap" }, box), nodeOf };
}

// Text shown on a blank node besides its answer: the label (above) and any
// data values (below).
export function nodeLabel(quiz: Quiz, idx: number): HTMLElement | null {
  const text = quiz.items[idx].prompt?.text;
  return text ? h("div", { class: "dlabel" }, text) : null;
}

export function nodeData(quiz: Quiz, idx: number): HTMLElement | null {
  const values = quiz.items[idx].data.filter((v) => v !== "");
  return values.length ? h("div", { class: "dlabel" }, values.join(" · ")) : null;
}

// Nearest node from `from` in a direction (grid coordinates, y up), among
// `candidates`. Favors nodes straight ahead over ones off to the side.
export function nearestInDirection(quiz: Quiz, from: number, dir: [number, number], candidates: number[]): number | null {
  const pos = new Map(quiz.diagram!.nodes.filter((n) => n.item !== undefined).map((n) => [n.item!, n]));
  const p = pos.get(from)!;
  let best: number | null = null, bestScore = Infinity;
  for (const c of candidates) {
    if (c === from) continue;
    const q = pos.get(c)!;
    const vx = q.x - p.x, vy = q.y - p.y;
    const along = vx * dir[0] + vy * dir[1];
    if (along <= 1e-6) continue;
    const across = Math.abs(vx * dir[1] - vy * dir[0]);
    const score = along + 2 * across;
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best;
}
