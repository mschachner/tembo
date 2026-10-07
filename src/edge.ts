// The boundary between the banner art and the page. Each style is a mask,
// a clip, or an overlay applied to the .banner-art wrapper; `size` is the
// height of the transition zone as a percent of the banner.
import { h } from "./dom";

export const EDGES = ["hard", "rule", "fade", "smooth", "wave", "torn", "hills", "arc", "slant", "dither"] as const;
export type Edge = (typeof EDGES)[number];

const N = 1000;

function svgMask(d: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${N} ${N}' preserveAspectRatio='none'><path d='${d}' fill='black'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// Deterministic jitter so the torn edge doesn't change between renders.
function rng(seed: number): () => number {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function wavePath(top: number, amp: number, waves: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const x = (i / 120) * N;
    const y = top + amp * (0.5 + 0.5 * Math.sin((2 * Math.PI * waves * x) / N));
    pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `M0 0 H${N} L${pts.reverse().join(" L")} Z`;
}

function tornPath(top: number, amp: number): string {
  const r = rng(7);
  const pts: string[] = [];
  let y = top + amp / 2;
  for (let i = 0; i <= 600; i++) {
    y = Math.min(top + amp, Math.max(top, y + (r() - 0.5) * amp * 0.35));
    pts.push(`${((i / 600) * N).toFixed(2)} ${y.toFixed(1)}`);
  }
  return `M0 0 H${N} L${pts.reverse().join(" L")} Z`;
}

function ditherMask(heightPx: number, sizePct: number): string {
  const cell = 3;
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const canvas = document.createElement("canvas");
  canvas.width = cell * 4;
  canvas.height = heightPx;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "black";
  const zoneTop = heightPx * (1 - sizePct / 100);
  for (let row = 0; row * cell < heightPx; row++) {
    const y = row * cell;
    const t = y < zoneTop ? 1 : 1 - (y - zoneTop) / (heightPx - zoneTop || 1); // 1 = fully shown
    for (let col = 0; col < 4; col++) {
      const threshold = (bayer[(row % 4) * 4 + col] + 0.5) / 16;
      if (t > threshold) ctx.fillRect(col * cell, y, cell, cell);
    }
  }
  return `url("${canvas.toDataURL()}")`;
}

// Apply the edge to the art wrapper. `heightPx` is the banner's height.
export function applyEdge(art: HTMLElement, edge: string, sizePct: number, heightPx: number): void {
  const s = Math.max(1, Math.min(100, sizePct));
  const top = N * (1 - s / 100);
  const st = art.style as CSSStyleDeclaration & { webkitMaskImage?: string; webkitMaskSize?: string; webkitMaskRepeat?: string };
  const setMask = (img: string, size = "100% 100%", repeat = "no-repeat") => {
    st.maskImage = img; st.webkitMaskImage = img;
    st.maskSize = size; st.webkitMaskSize = size;
    st.maskRepeat = repeat; st.webkitMaskRepeat = repeat;
  };
  switch (edge as Edge) {
    case "hard":
      break;
    case "rule":
      art.classList.add("edge-rule");
      break;
    case "fade":
      setMask(`linear-gradient(to bottom, black ${100 - s}%, transparent 100%)`);
      break;
    case "smooth":
      // A long eased fade: several stops approximate an ease-out curve.
      setMask(`linear-gradient(to bottom, black ${Math.max(0, 100 - s * 1.6)}%, rgba(0,0,0,.85) ${100 - s * 0.9}%, rgba(0,0,0,.5) ${100 - s * 0.55}%, rgba(0,0,0,.18) ${100 - s * 0.25}%, transparent 100%)`);
      break;
    case "wave":
      setMask(svgMask(wavePath(top, N - top, 3.5)));
      break;
    case "torn":
      setMask(svgMask(tornPath(top, N - top)));
      break;
    case "arc":
      setMask(svgMask(`M0 0 H${N} V${top} Q${N / 2} ${N + (N - top)} 0 ${top} Z`));
      break;
    case "slant":
      art.style.clipPath = `polygon(0 0, 100% 0, 100% ${100 - s}%, 0 100%)`;
      break;
    case "dither":
      setMask(ditherMask(heightPx, s), `12px ${heightPx}px`, "repeat-x");
      break;
    case "hills": {
      // Two page-colored ridges laid over the bottom of the art.
      const zone = s;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 1200 100");
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("class", "edge-hills");
      svg.style.height = `${zone}%`;
      svg.innerHTML = `
        <path d="M0 40 C 200 0, 420 70, 640 34 S 1000 10, 1200 46 L1200 100 L0 100 Z" style="fill: var(--bg); opacity: .55" />
        <path d="M0 74 C 260 40, 520 96, 800 62 S 1060 50, 1200 72 L1200 100 L0 100 Z" style="fill: var(--bg)" />`;
      art.append(svg);
      break;
    }
  }
}

export function edgeOverlayHolder(): HTMLElement {
  return h("div", { class: "banner-art" });
}
