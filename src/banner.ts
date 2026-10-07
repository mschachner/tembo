import { h } from "./dom";
import { elephantSvg } from "./elephant";

// Default banner: autumn hills, low sun, an elephant on the middle ridge.
// Fills are theme variables so presets recolor it.
export function defaultBanner(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 1200 300");
  svg.setAttribute("preserveAspectRatio", "xMidYMax slice");
  svg.setAttribute("class", "banner-svg");
  svg.innerHTML = `
    <rect width="1200" height="300" style="fill: var(--banner-sky)" />
    <circle cx="960" cy="128" r="42" style="fill: var(--banner-sun)" />
    <path d="M0 192 C 180 150, 340 212, 540 176 S 880 128, 1200 184 L1200 300 L0 300 Z" style="fill: var(--banner-hills); opacity: .45" />
    <path d="M0 232 C 240 186, 440 254, 700 214 S 1000 176, 1200 224 L1200 300 L0 300 Z" style="fill: var(--banner-hills); opacity: .7" />
    <g class="figure-slot" style="color: var(--banner-figure)"></g>
    <path d="M0 262 C 300 232, 520 292, 800 252 S 1040 222, 1200 262 L1200 300 L0 300 Z" style="fill: var(--banner-hills)" />
  `;
  const el = elephantSvg();
  // Box on the ridge in front of the sun; bottom edge sits on the hill.
  el.setAttribute("x", "790");
  el.setAttribute("y", "92");
  el.setAttribute("width", "190");
  el.setAttribute("height", "108");
  el.setAttribute("preserveAspectRatio", "xMidYMax meet");
  svg.querySelector(".figure-slot")!.append(el);
  return svg;
}

// Small elephant for empty states and stamps, in the current text color.
export function tembo(size = 48): HTMLElement {
  const el = elephantSvg();
  el.setAttribute("width", String(size));
  el.setAttribute("height", String(size));
  el.setAttribute("preserveAspectRatio", "xMidYMid meet");
  return h("span", { class: "tembo-mark" }, el);
}

export function bannerImage(url: string): HTMLImageElement {
  return h("img", { class: "banner-img", src: url, alt: "" });
}
