import { h } from "./dom";

// Default banner: autumn hills, low sun, Tembo on the front ridge. All
// fills are theme variables so presets recolor it. An original drawing.
export function defaultBanner(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 1200 300");
  svg.setAttribute("preserveAspectRatio", "xMidYMax slice");
  svg.setAttribute("class", "banner-svg");
  svg.innerHTML = `
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style="stop-color: var(--bg); stop-opacity: 0" />
        <stop offset="1" style="stop-color: var(--bg); stop-opacity: 1" />
      </linearGradient>
    </defs>
    <rect width="1200" height="300" style="fill: var(--banner-sky)" />
    <circle cx="960" cy="128" r="42" style="fill: var(--banner-sun)" />
    <path d="M0 192 C 180 150, 340 212, 540 176 S 880 128, 1200 184 L1200 300 L0 300 Z" style="fill: var(--banner-hills); opacity: .45" />
    <path d="M0 232 C 240 186, 440 254, 700 214 S 1000 176, 1200 224 L1200 300 L0 300 Z" style="fill: var(--banner-hills); opacity: .7" />
    <g transform="translate(846 196) scale(0.82)" style="fill: var(--banner-figure)">
      <ellipse cx="70" cy="-56" rx="44" ry="31" />
      <circle cx="22" cy="-64" r="23" />
      <path d="M 6 -74 C -12 -62, -10 -30, -2 -8 C 0 -2, 10 -2, 10 -8 C 4 -30, 6 -52, 20 -60 Z" />
      <rect x="34" y="-40" width="13" height="40" rx="2" />
      <rect x="52" y="-40" width="13" height="40" rx="2" />
      <rect x="80" y="-40" width="13" height="40" rx="2" />
      <rect x="98" y="-40" width="13" height="40" rx="2" />
      <path d="M 112 -64 q 14 8 8 32" style="fill: none; stroke: var(--banner-figure); stroke-width: 4; stroke-linecap: round" />
    </g>
    <path d="M0 262 C 300 232, 520 292, 800 252 S 1040 222, 1200 262 L1200 300 L0 300 Z" style="fill: var(--banner-hills)" />
    <rect y="200" width="1200" height="100" fill="url(#fade)" />
  `;
  return svg;
}

// Small standalone Tembo for empty states and stamps.
export function tembo(size = 48): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "-16 -100 150 104");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size * 104 / 150));
  svg.setAttribute("class", "tembo-mark");
  svg.innerHTML = `
    <g style="fill: currentColor">
      <ellipse cx="70" cy="-56" rx="44" ry="31" />
      <circle cx="22" cy="-64" r="23" />
      <path d="M 6 -74 C -12 -62, -10 -30, -2 -8 C 0 -2, 10 -2, 10 -8 C 4 -30, 6 -52, 20 -60 Z" />
      <rect x="34" y="-40" width="13" height="40" rx="2" />
      <rect x="52" y="-40" width="13" height="40" rx="2" />
      <rect x="80" y="-40" width="13" height="40" rx="2" />
      <rect x="98" y="-40" width="13" height="40" rx="2" />
      <path d="M 112 -64 q 14 8 8 32" style="fill: none; stroke: currentColor; stroke-width: 4; stroke-linecap: round" />
    </g>`;
  return svg;
}

export function bannerImage(url: string): HTMLImageElement {
  return h("img", { class: "banner-img", src: url, alt: "" });
}
