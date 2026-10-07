// Every visual knob is a CSS variable on :root. A theme is a JSON object
// assigning each; presets live in themes/*.json, the active preset and any
// overrides in data/settings.json.

import { EDGES } from "./edge";

export type VarKind = "color" | "px" | "pct" | "scale" | "text" | "image" | "choice";

export interface VarSpec {
  key: string;
  css: string;
  kind: VarKind;
  label: string;   // functional label
  options?: readonly string[];
  min?: number;
  max?: number;
  step?: number;
}

export const THEME_VARS: VarSpec[] = [
  { key: "bg", css: "--bg", kind: "color", label: "Background" },
  { key: "bg2", css: "--bg-2", kind: "color", label: "Surface" },
  { key: "bg3", css: "--bg-3", kind: "color", label: "Surface, raised" },
  { key: "fg", css: "--fg", kind: "color", label: "Text" },
  { key: "fg2", css: "--fg-2", kind: "color", label: "Text, secondary" },
  { key: "fg3", css: "--fg-3", kind: "color", label: "Text, muted" },
  { key: "accent", css: "--accent", kind: "color", label: "Accent" },
  { key: "line", css: "--line", kind: "color", label: "Lines" },
  { key: "instant", css: "--instant", kind: "color", label: "Instant" },
  { key: "slow", css: "--slow", kind: "color", label: "Slow" },
  { key: "missed", css: "--missed", kind: "color", label: "Missed" },
  { key: "bannerSky", css: "--banner-sky", kind: "color", label: "Banner sky" },
  { key: "bannerHills", css: "--banner-hills", kind: "color", label: "Banner hills" },
  { key: "bannerSun", css: "--banner-sun", kind: "color", label: "Banner sun" },
  { key: "bannerFigure", css: "--banner-figure", kind: "color", label: "Banner figure" },
  { key: "radius", css: "--radius", kind: "px", label: "Corner radius", min: 0, max: 24, step: 1 },
  { key: "space", css: "--space", kind: "scale", label: "Spacing", min: 0.6, max: 1.6, step: 0.05 },
  { key: "fontSize", css: "--font-size", kind: "px", label: "Font size", min: 12, max: 22, step: 1 },
  { key: "font", css: "--font", kind: "text", label: "Font" },
  { key: "fontMono", css: "--font-mono", kind: "text", label: "Font, mono" },
  { key: "bannerImage", css: "--banner-image", kind: "image", label: "Banner image (path from repo root)" },
  { key: "bannerHeight", css: "--banner-height", kind: "px", label: "Banner height", min: 100, max: 480, step: 10 },
  { key: "bannerY", css: "--banner-y", kind: "pct", label: "Banner image focus (top to bottom)", min: 0, max: 100, step: 1 },
  { key: "bannerEdge", css: "", kind: "choice", label: "Banner edge", options: EDGES },
  { key: "bannerEdgeSize", css: "", kind: "pct", label: "Banner edge size", min: 2, max: 100, step: 1 },
  { key: "bannerEdgePos", css: "", kind: "pct", label: "Banner edge position", min: 30, max: 100, step: 1 },
];

export type Theme = Record<string, string | number>;

export const FALLBACK_THEME: Theme = {
  bg: "#f6efe4", bg2: "#fdf9f2", bg3: "#ede3d3", fg: "#2d2218", fg2: "#5d4a3a", fg3: "#9a8672",
  accent: "#b5522a", line: "#dfd2bf", instant: "#5e7c3a", slow: "#c98a1b", missed: "#b23a2a",
  bannerSky: "#e9c9a3", bannerHills: "#a65b32", bannerSun: "#f0a24a", bannerFigure: "#3a2416",
  radius: 8, space: 1, fontSize: 16, font: "Atkinson Hyperlegible Next", fontMono: "Atkinson Hyperlegible Mono",
  bannerImage: "", bannerHeight: 240, bannerY: 50, bannerEdge: "fade", bannerEdgeSize: 45, bannerEdgePos: 100,
};

export function cssValue(spec: VarSpec, value: string | number): string {
  switch (spec.kind) {
    case "px": return `${value}px`;
    case "pct": return `${value}%`;
    case "scale": return String(value);
    case "text": return `"${value}", system-ui, sans-serif`;
    case "image": return "none"; // the banner element handles the image itself
    default: return String(value);
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement.style;
  for (const spec of THEME_VARS) {
    if (!spec.css) continue; // read directly by the code that uses it
    const v = theme[spec.key] ?? FALLBACK_THEME[spec.key];
    root.setProperty(spec.css, cssValue(spec, v));
  }
  root.setProperty("--font-mono", `"${theme.fontMono ?? FALLBACK_THEME.fontMono}", ui-monospace, monospace`);
}

export function parseTheme(json: string): Theme {
  const raw = JSON.parse(json) as Record<string, unknown>;
  const out: Theme = {};
  for (const spec of THEME_VARS) {
    if (!spec.css) continue; // read directly by the code that uses it
    const v = raw[spec.key];
    if (typeof v === "string" || typeof v === "number") out[spec.key] = v;
  }
  return out;
}
