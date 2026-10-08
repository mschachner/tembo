// The app icon, drawn from the theme's two icon colors: a rounded square in
// iconBg with the elephant in iconFg, on the layout of the masters in
// art/icons/. The main window sends it to the Dock whenever they change.
import raw from "./elephants/tembo.svg?raw";
import { setDockIcon } from "./backend";

function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

// 1024×1024, the squircle on Apple's 824-pixel grid.
export function iconSvg(bg: string, fg: string): string {
  // The ground shadow is darker on a dark square so it still reads.
  const ground = luminance(bg) > 0.4 ? 0.08 : 0.3;
  const elephant = raw
    .replace(/<svg [^>]*>/, `<svg x="182" y="294" width="660" height="425" viewBox="0 0 1536 990" preserveAspectRatio="xMidYMid meet">`)
    .replace(/fill="currentColor"/g, `fill="${fg}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <clipPath id="sq"><rect x="100" y="100" width="824" height="824" rx="185" ry="185" /></clipPath>
    <filter id="sh" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-opacity="0.28"/></filter>
  </defs>
  <g filter="url(#sh)"><rect x="100" y="100" width="824" height="824" rx="185" ry="185" fill="${bg}" /></g>
  <g clip-path="url(#sq)">
    <ellipse cx="512" cy="713" rx="270" ry="18" fill="#000" opacity="${ground}"/>
    ${elephant}
  </g>
</svg>`;
}

export function iconDataUrl(bg: string, fg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(bg, fg))}`;
}

async function iconPng(bg: string, fg: string): Promise<string> {
  const img = new Image();
  img.src = iconDataUrl(bg, fg);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  canvas.getContext("2d")!.drawImage(img, 0, 0, 1024, 1024);
  return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}

let shown = "";
let timer: number | null = null;

// Coalesced, so dragging a color picker doesn't redraw the Dock on every step.
export function updateDockIcon(bg: string, fg: string): void {
  const key = `${bg}|${fg}`;
  if (key === shown) return;
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    shown = key;
    iconPng(bg, fg)
      .then(setDockIcon)
      .catch((e) => { shown = ""; console.error("could not set the Dock icon", e); });
  }, 150);
}
