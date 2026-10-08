// Automatic text contrast over banner art. For each text block, sample the
// luminance of what's behind it — art, edge mask, plate and page color
// combined — and switch its text to the theme's fg or bg color, whichever
// contrasts more. Positions are in page coordinates, so this only needs to
// run on render, resize, and settings changes, not on scroll.
import { activeTheme } from "./app";
import { edgeOpacity } from "./edge";

const SAMPLE_W = 96;
const SELECTOR = [
  ".banner-text", ".tab", ".entry", ".stats tr", ".page h1", ".page h2", ".page p",
  ".control", ".actions", ".empty-title", ".empty .tembo-mark", ".page .small", ".card", ".slots li", ".presets",
].join(", ");
// Below this contrast ratio the text also gets a thin halo in the opposite
// color, which is what keeps it legible across the edge's mid-tones.
const HALO_BELOW = 4.5;

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
function sampleArt(art: HTMLElement, bannerH: number, bannerY: number): boolean {
  const W = art.clientWidth;
  const dispH = Math.max(art.clientHeight, bannerH);
  if (!W) return false;
  const scale = SAMPLE_W / W;
  const h = Math.max(1, Math.round(dispH * scale));
  const img = art.querySelector<HTMLImageElement>(".banner-img:not(.entering)");
  const src = img?.src ?? "drawn";
  if (samples && samples.src === src && samples.w === SAMPLE_W && samples.h === h) return true;
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_W; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  if (img && img.naturalWidth) {
    const s = Math.max(W / img.naturalWidth, dispH / img.naturalHeight);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    const dx = (W - dw) / 2, dy = (dispH - dh) * (bannerY / 100);
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

export function updateContrast(): void {
  reset();
  const theme = activeTheme();
  const app = document.getElementById("app")!;
  const art = document.querySelector<HTMLElement>(".banner-art");
  if (!art || String(theme.contrast) !== "auto") return;

  const bannerH = Number(theme.bannerHeight);
  const artH = art.clientHeight;
  if (!sampleArt(art, bannerH, Number(theme.bannerY ?? 50))) return;
  const { ctx, w, h } = samples!;
  const px = ctx.getImageData(0, 0, w, h).data;
  const scale = w / art.clientWidth;

  const bg = parseHex(String(theme.bg));
  const bgL = lum(...bg);
  const fgL = lum(...parseHex(String(theme.fg)));
  const plate = String(theme.surfaces) === "none" ? 0 : Number(theme.plate) / 100;
  const smoothPx = (bannerH * Number(theme.edgeSmooth)) / 100;
  const ditherPx = (bannerH * Number(theme.edgeDither)) / 100;
  const appTop = app.getBoundingClientRect().top;

  for (const el of app.querySelectorAll<HTMLElement>(SELECTOR)) {
    const r = el.getBoundingClientRect();
    const top = r.top - appTop, bottom = r.bottom - appTop;
    if (top >= artH || r.width === 0) continue; // entirely below the art
    // Average luminance behind the element, blending art with page color
    // by the edge's opacity at each row, then with the plate on top.
    let sum = 0, n = 0;
    const y0 = Math.max(0, Math.floor(top * scale)), y1 = Math.min(h - 1, Math.ceil(bottom * scale));
    const x0 = Math.max(0, Math.floor((r.left) * scale)), x1 = Math.min(w - 1, Math.ceil(r.right * scale));
    for (let y = y0; y <= y1; y++) {
      const a = edgeOpacity(artH - y / scale, artH, smoothPx, ditherPx);
      for (let x = x0; x <= x1; x++) {
        const i = (y * w + x) * 4;
        const L = lum(px[i], px[i + 1], px[i + 2]);
        sum += a * L + (1 - a) * bgL;
        n++;
      }
    }
    // Rows of the element below the art see page color.
    const belowRows = Math.max(0, Math.ceil(bottom * scale) - (h - 1)) * Math.max(1, x1 - x0 + 1);
    sum += belowRows * bgL; n += belowRows;
    if (!n) continue;
    const behind = plate * bgL + (1 - plate) * (sum / n);
    const cBg = contrast(bgL, behind), cFg = contrast(fgL, behind);
    const flip = cBg > cFg;
    const c = String(flip ? theme.bg : theme.fg);
    const opposite = String(flip ? theme.fg : theme.bg);
    // Over art, every element gets its text set explicitly: the chosen
    // color, with the muted levels only slightly softened.
    el.style.color = c;
    el.style.setProperty("--fg", c);
    el.style.setProperty("--fg-2", `color-mix(in srgb, ${c} 92%, transparent)`);
    el.style.setProperty("--fg-3", `color-mix(in srgb, ${c} 80%, transparent)`);
    if (Math.max(cBg, cFg) < HALO_BELOW) {
      el.style.setProperty("--halo", opposite);
      el.style.textShadow = `0 0 1px ${opposite}, 0 0 3px ${opposite}, 0 0 6px color-mix(in srgb, ${opposite} 60%, transparent)`;
    }
    adapted.push(el);
  }
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
