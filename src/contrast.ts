// Automatic text contrast over banner art. For each text block, sample the
// luminance of what's behind it — art, edge mask, plate and page color
// combined — and switch its text to the theme's fg or bg color, whichever
// contrasts more. Positions are in page coordinates, so this only needs to
// run on render, resize, and settings changes, not on scroll.
import { activeTheme } from "./app";
import { edgeOpacity } from "./edge";

const SAMPLE_W = 96;
const SELECTOR = [
  ".banner-title", ".banner-sub", ".tab", ".settings-gear", ".page h1", ".page h2", ".page p",
  ".control", ".actions", ".keys", ".page .small", ".card", ".slots li", ".presets",
  ".panes-page .pane:not(.pane .pane)",
].join(", ");
// Target contrast ratio. Below it, the theme colors give way to stronger
// versions pushed toward black or white; light text that still falls short
// gets a soft dark shadow. Dark text never gets a halo.
const TARGET = 4.5;

let samples: { ctx: CanvasRenderingContext2D; w: number; h: number; src: string } | null = null;
let adapted: HTMLElement[] = [];

function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lum(r: number, g: number, b: number): number {
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function reset(): void {
  for (const el of adapted) {
    for (const prop of ["color", "--fg", "--fg-2", "--fg-3", "text-shadow", "--halo"]) el.style.removeProperty(prop);
  }
  adapted = [];
}

// Downscaled copy of the displayed art (photo, or a flat stand-in for the
// drawing) laid out exactly as it is on screen.
// A photo is wider than the art by the pan range and shifted left by its
// share of it for the current tab (see shell.ts); it is sampled where it
// will come to rest.
function sampleArt(art: HTMLElement, bannerH: number, bannerY: number, panRange: number): boolean {
  const W = art.clientWidth;
  const pan = Number(document.getElementById("app")!.style.getPropertyValue("--pan") || 0);
  const dispH = Math.max(art.clientHeight, bannerH);
  if (!W) return false;
  const scale = SAMPLE_W / W;
  const h = Math.max(1, Math.round(dispH * scale));
  // While a new photo fades in, the outgoing one is still in the layer,
  // earlier in document order. Sample the newest loaded photo, which is
  // what the screen settles on.
  const img = [...art.querySelectorAll<HTMLImageElement>(".banner-img:not(.entering)")].at(-1) ?? null;
  const src = `${img?.src ?? "drawn"}@${pan}/${panRange}`;
  if (samples && samples.src === src && samples.w === SAMPLE_W && samples.h === h) return true;
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_W; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  if (img && img.naturalWidth) {
    const boxW = W + panRange;
    const s = Math.max(boxW / img.naturalWidth, dispH / img.naturalHeight);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    const dx = (boxW - dw) / 2 - pan * panRange, dy = (dispH - dh) * (bannerY / 100);
    ctx.drawImage(img, dx * scale, dy * scale, dw * scale, dh * scale);
  } else if (img) {
    return false; // not loaded yet
  } else {
    // The drawing: pale sky over darker hills.
    ctx.fillStyle = "#e9c9a3"; ctx.fillRect(0, 0, SAMPLE_W, h);
    ctx.fillStyle = "#a65b32"; ctx.fillRect(0, Math.round(h * 0.6), SAMPLE_W, h);
  }
  samples = { ctx, w: SAMPLE_W, h, src };
  return true;
}

function mix(hex: string, toward: [number, number, number], t: number): string {
  const [r, g, b] = parseHex(hex);
  const m = (a: number, z: number) => Math.round(a + (z - a) * t);
  return `#${[m(r, toward[0]), m(g, toward[1]), m(b, toward[2])].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Prefer whichever theme text color contrasts better; if neither reaches
// the target, step that color toward its extreme until it does (or until
// it is fully black or white).
function pickColor(behind: number, fg: string, bg: string): { color: string; ratio: number; light: boolean } {
  const fgL = lum(...parseHex(fg)), bgL = lum(...parseHex(bg));
  const cFg = contrast(fgL, behind), cBg = contrast(bgL, behind);
  let base = cFg >= cBg ? fg : bg;
  let ratio = Math.max(cFg, cBg);
  const light = lum(...parseHex(base)) > behind;
  if (ratio < TARGET) {
    const extreme: [number, number, number] = light ? [255, 255, 255] : [0, 0, 0];
    for (const t of [0.25, 0.5, 0.75, 1]) {
      const c = mix(base, extreme, t);
      ratio = contrast(lum(...parseHex(c)), behind);
      if (ratio >= TARGET || t === 1) { base = c; break; }
    }
  }
  return { color: base, ratio, light };
}

export function updateContrast(): void {
  reset();
  const theme = activeTheme();
  const app = document.getElementById("app")!;
  const art = document.querySelector<HTMLElement>(".banner-art");
  if (!art || String(theme.contrast) !== "auto") return;

  const bannerH = Number(theme.bannerHeight);
  const artH = art.clientHeight;
  if (!sampleArt(art, bannerH, Number(theme.bannerY ?? 50), Number(theme.bannerPan ?? 0))) return;
  const { ctx, w, h } = samples!;
  const px = ctx.getImageData(0, 0, w, h).data;
  const scale = w / art.clientWidth;

  const bg = parseHex(String(theme.bg));
  const bgL = lum(...bg);
  const plate = String(theme.surfaces) === "none" ? 0 : Number(theme.plate) / 100;
  const smoothPx = (bannerH * Number(theme.edgeSmooth)) / 100;
  const ditherPx = (bannerH * Number(theme.edgeDither)) / 100;
  const appTop = app.getBoundingClientRect().top;

  // The date line takes the title's tone (light or dark), so the two never
  // disagree; the title comes first in the page.
  let titleTone: { color: string; light: boolean } | null = null;
  for (const el of app.querySelectorAll<HTMLElement>(SELECTOR)) {
    const r = el.getBoundingClientRect();
    const top = r.top - appTop, bottom = r.bottom - appTop;
    if (top >= artH || r.width === 0) continue; // entirely below the art
    // The title and the date line have no plate (see style.css). Panes keep
    // every sample too, like the title, for the worst spots behind them.
    const isTitle = el.classList.contains("banner-title") || el.classList.contains("banner-sub");
    const isPane = el.classList.contains("pane");
    // Inside a pane, the pane's colors (paneColors) apply.
    if (!isPane && el.closest(".pane")) continue;
    const platePart = isTitle ? 0 : plate;
    // Average luminance behind the element, blending art with page color
    // by the edge's opacity at each row, then with the plate on top. The
    // title also keeps every sample, for the worst spots behind it.
    let sum = 0, n = 0;
    const all: number[] = [];
    const y0 = Math.max(0, Math.floor(top * scale)), y1 = Math.min(h - 1, Math.ceil(bottom * scale));
    const x0 = Math.max(0, Math.floor((r.left) * scale)), x1 = Math.min(w - 1, Math.ceil(r.right * scale));
    for (let y = y0; y <= y1; y++) {
      const a = edgeOpacity(artH - y / scale, artH, smoothPx, ditherPx);
      for (let x = x0; x <= x1; x++) {
        const i = (y * w + x) * 4;
        const L = lum(px[i], px[i + 1], px[i + 2]);
        const v = a * L + (1 - a) * bgL;
        sum += v;
        n++;
        if (isTitle) all.push(v);
        else if (isPane) all.push(platePart * bgL + (1 - platePart) * v);
      }
    }
    // Rows of the element below the art see page color.
    const belowRows = Math.max(0, Math.ceil(bottom * scale) - (h - 1)) * Math.max(1, x1 - x0 + 1);
    if (isPane) for (let k = 0; k < belowRows; k++) all.push(bgL);
    sum += belowRows * bgL; n += belowRows;
    if (!n) continue;
    const behind = platePart * bgL + (1 - platePart) * (sum / n);
    const choice = pickColor(behind, String(theme.fg), String(theme.bg));
    if (isTitle) {
      const main = el.classList.contains("banner-title");
      const tone = main || !titleTone ? choice : titleTone;
      if (main) titleTone = choice;
      titleColor(el, tone, all, main ? 3 : 4.5);
      adapted.push(el);
      continue;
    }
    if (isPane) {
      paneColors(el, choice, all, theme);
      adapted.push(el);
      continue;
    }
    // Over art, every element gets its text set explicitly: the chosen
    // color, with the muted levels only slightly softened.
    el.style.color = choice.color;
    el.style.setProperty("--fg", choice.color);
    el.style.setProperty("--fg-2", `color-mix(in srgb, ${choice.color} 92%, transparent)`);
    el.style.setProperty("--fg-3", `color-mix(in srgb, ${choice.color} 80%, transparent)`);
    if (choice.light && choice.ratio < TARGET) {
      el.style.setProperty("--halo", "rgba(0, 0, 0, 0.45)");
      el.style.textShadow = "0 1px 2px rgba(0, 0, 0, 0.45), 0 0 6px rgba(0, 0, 0, 0.25)";
    }
    adapted.push(el);
  }
}

// The title and the date line, which have no plate. Their tone (light or
// dark) is the one that suits the art behind them on average; then the
// color is pushed toward black or white until it also stands out from the
// worst tenth of that art (the brightest spots behind light text, the
// darkest behind dark), to `target` (3:1 for the large title, 4.5:1 for the
// date line). Only where even black or white can't get there, as over very
// busy art, does the text get a small shadow in the opposite tone.
function titleColor(el: HTMLElement, choice: { color: string; light: boolean }, samples: number[], target: number): void {
  samples.sort((a, b) => a - b);
  const worst = samples.length ? samples[Math.floor((choice.light ? 0.9 : 0.1) * (samples.length - 1))] : 0;
  const extreme: [number, number, number] = choice.light ? [255, 255, 255] : [0, 0, 0];
  let color = choice.color, ratio = contrast(lum(...parseHex(color)), worst);
  for (const t of [0.25, 0.5, 0.75, 1]) {
    if (ratio >= target) break;
    color = mix(choice.color, extreme, t);
    ratio = contrast(lum(...parseHex(color)), worst);
  }
  el.style.color = color;
  el.style.setProperty("--fg", color);
  el.style.setProperty("--fg-2", color);
  if (ratio < target) {
    const shadow = choice.light ? "rgba(0, 0, 0, 0.55)" : "rgba(255, 255, 255, 0.6)";
    el.style.setProperty("--halo", shadow);
    el.style.textShadow = `0 1px 2px ${shadow}`;
  }
}

// A pane over art: its three text levels (primary, secondary, muted) each
// stand out from the worst tenth of what shows through the pane (art seen
// through the plate), pushed toward black or white only as far as needed:
// 4.5:1 for the first two, 3:1 for the muted level (labels, meta, hints).
// The tone is the one that suits the art on average; in the theme's own
// tone the levels start from the theme's colors, so a pane over plain page
// color keeps them unchanged.
function paneColors(el: HTMLElement, choice: { color: string; light: boolean }, samples: number[], theme: Record<string, string | number>): void {
  samples.sort((a, b) => a - b);
  const worst = samples.length ? samples[Math.floor((choice.light ? 0.9 : 0.1) * (samples.length - 1))] : 0;
  const extreme: [number, number, number] = choice.light ? [255, 255, 255] : [0, 0, 0];
  const fg = String(theme.fg), bg = String(theme.bg);
  const own = choice.color === fg;
  const starts = own ? [fg, String(theme.fg2), String(theme.fg3)] : [bg, mix(bg, parseHex(fg), 0.15), mix(bg, parseHex(fg), 0.3)];
  const [c1, c2, c3] = starts.map((start, k) => {
    const target = k === 2 ? 3 : 4.5;
    let c = start;
    for (const t of [0, 0.15, 0.3, 0.45, 0.6, 0.8, 1]) {
      c = mix(start, extreme, t);
      if (contrast(lum(...parseHex(c)), worst) >= target) break;
    }
    return c;
  });
  el.style.setProperty("--fg", c1);
  el.style.setProperty("--fg-2", c2);
  el.style.setProperty("--fg-3", c3);
  el.style.color = c1;
}

let scheduled = false;
export function scheduleContrast(): void {
  if (scheduled) return;
  scheduled = true;
  // A timer rather than requestAnimationFrame: frames stop in a window
  // that is behind the settings window.
  window.setTimeout(() => { scheduled = false; updateContrast(); }, 16);
}

window.addEventListener("resize", scheduleContrast);
