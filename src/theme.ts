// Every visual knob is a CSS variable on :root. A theme is a JSON object
// assigning each; presets live in themes/*.json, the active preset and any
// overrides in data/settings.json.

export type VarKind = "color" | "px" | "pct" | "scale" | "em" | "text" | "image" | "choice";

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
  { key: "instant", css: "--instant", kind: "color", label: "Results: Instant" },
  { key: "slow", css: "--slow", kind: "color", label: "Results: Slow" },
  { key: "missed", css: "--missed", kind: "color", label: "Results: Missed" },
  { key: "tabs", css: "", kind: "choice", label: "Tab bar", options: ["pill", "pills", "card", "bar"] },
  { key: "surfaces", css: "", kind: "choice", label: "Surfaces over art", options: ["plates", "none"] },
  { key: "contrast", css: "", kind: "choice", label: "Text over art", options: ["fixed", "auto"] },
  { key: "plate", css: "--plate", kind: "pct", label: "Surface opacity over art", min: 0, max: 100, step: 1 },
  { key: "plateBlur", css: "--plate-blur", kind: "px", label: "Surface blur over art", min: 0, max: 30, step: 1 },
  // Fonts. An empty font field falls back to the body font.
  { key: "font", css: "--font", kind: "text", label: "Body font" },
  { key: "fontSize", css: "--font-size", kind: "px", label: "Body size", min: 12, max: 22, step: 1 },
  { key: "fontMono", css: "--font-mono", kind: "text", label: "Numbers font (mono)" },
  { key: "monoScale", css: "--mono-scale", kind: "scale", label: "Numbers size (× body)", min: 0.7, max: 1.3, step: 0.05 },
  { key: "titleFont", css: "--title-font", kind: "text", label: "Title font" },
  { key: "titleSize", css: "--title-size", kind: "px", label: "Title size", min: 18, max: 96, step: 1 },
  { key: "titleWeight", css: "--title-weight", kind: "scale", label: "Title weight", min: 100, max: 900, step: 100 },
  { key: "titleTracking", css: "--title-tracking", kind: "em", label: "Title letter spacing", min: -0.08, max: 0.2, step: 0.005 },
  { key: "headingFont", css: "--heading-font", kind: "text", label: "Heading font" },
  { key: "headingSize", css: "--heading-size", kind: "px", label: "Heading size", min: 14, max: 48, step: 1 },
  // Section labels: the small all-caps headings ("Today's results", table
  // column headers, settings group titles).
  { key: "labelFont", css: "--label-font", kind: "text", label: "Font" },
  { key: "labelSize", css: "--label-size", kind: "scale", label: "Size (× body)", min: 0.6, max: 1.4, step: 0.05 },
  { key: "labelWeight", css: "--label-weight", kind: "scale", label: "Weight", min: 100, max: 900, step: 100 },
  { key: "labelTracking", css: "--label-tracking", kind: "em", label: "Letter spacing", min: -0.04, max: 0.3, step: 0.005 },
  { key: "labelCase", css: "", kind: "choice", label: "Case", options: ["upper", "small caps", "as written"] },
  { key: "labelColor", css: "--label-color", kind: "color", label: "Color" },
  // Layout.
  { key: "contentWidth", css: "--content-width", kind: "px", label: "Main column width", min: 560, max: 1400, step: 10 },
  { key: "wideWidth", css: "--wide-width", kind: "px", label: "Quiz column width", min: 700, max: 1800, step: 10 },
  { key: "lineHeight", css: "--line-height", kind: "scale", label: "Line height", min: 1.1, max: 2.0, step: 0.05 },
  { key: "space", css: "--space", kind: "scale", label: "Spacing (overall)", min: 0.6, max: 1.6, step: 0.05 },
  { key: "rowPad", css: "--row-pad", kind: "scale", label: "List row spacing", min: 0.3, max: 2.0, step: 0.05 },
  { key: "radius", css: "--radius", kind: "px", label: "Corner radius: controls and cards", min: 0, max: 24, step: 1 },
  { key: "plateRadius", css: "--plate-radius", kind: "px", label: "Corner radius: surfaces", min: 0, max: 32, step: 1 },
  { key: "cardMin", css: "--card-min", kind: "px", label: "Prompt card width", min: 120, max: 360, step: 5 },
  { key: "slotCols", css: "--slot-cols", kind: "scale", label: "List quiz columns", min: 1, max: 6, step: 1 },
  { key: "bannerImage", css: "--banner-image", kind: "image", label: "Banner image (path from repo root)" },
  { key: "bannerHeight", css: "--banner-height", kind: "px", label: "Banner height", min: 100, max: 480, step: 10 },
  { key: "bannerY", css: "--banner-y", kind: "pct", label: "Banner image focus (top to bottom)", min: 0, max: 100, step: 1 },
  { key: "bannerEdgePos", css: "", kind: "pct", label: "Edge position", min: 30, max: 300, step: 1 },
  { key: "edgeSmooth", css: "", kind: "pct", label: "Edge smoothing height", min: 0, max: 100, step: 1 },
  { key: "edgeDither", css: "", kind: "pct", label: "Edge dithering height", min: 0, max: 100, step: 1 },
];

export type Theme = Record<string, string | number>;

export const FALLBACK_THEME: Theme = {
  bg: "#f6efe4", bg2: "#fdf9f2", bg3: "#ede3d3", fg: "#2d2218", fg2: "#5d4a3a", fg3: "#9a8672",
  accent: "#b5522a", line: "#dfd2bf", instant: "#5e7c3a", slow: "#c98a1b", missed: "#b23a2a",
  radius: 8, space: 1, fontSize: 16, font: "Atkinson Hyperlegible Next", fontMono: "Atkinson Hyperlegible Mono",
  monoScale: 1, titleFont: "", titleSize: 35, titleWeight: 700, titleTracking: -0.01, headingFont: "", headingSize: 24,
  labelSize: 0.8, labelFont: "", labelWeight: 600, labelTracking: 0.06, labelCase: "upper", labelColor: "", contentWidth: 820, wideWidth: 1100, lineHeight: 1.45, rowPad: 1, plateRadius: 8, cardMin: 180, slotCols: 3,
  bannerImage: "", bannerHeight: 240, bannerY: 50, bannerEdgePos: 100, edgeSmooth: 35, edgeDither: 0, plate: 85, plateBlur: 10, tabs: "pill", surfaces: "none", contrast: "auto",
};

const GENERIC_FAMILIES = new Set([
  "ui-rounded", "ui-serif", "ui-sans-serif", "ui-monospace", "system-ui",
  "serif", "sans-serif", "monospace", "cursive", "fantasy",
]);

export function cssValue(spec: VarSpec, value: string | number): string {
  switch (spec.kind) {
    case "px": return `${value}px`;
    case "pct": return `${value}%`;
    case "em": return `${value}em`;
    case "scale": return String(value);
    case "text": {
      // Generic families (ui-rounded = SF Pro Rounded, ui-serif = New York on
      // macOS) only work unquoted.
      const v = String(value).trim();
      const name = GENERIC_FAMILIES.has(v) ? v : `"${v}"`;
      return spec.key === "fontMono" ? `${name}, ui-monospace, monospace` : `${name}, system-ui, sans-serif`;
    }
    case "image": return "none"; // the banner element handles the image itself
    default: return String(value);
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement.style;
  for (const spec of THEME_VARS) {
    if (!spec.css) continue; // read directly by the code that uses it
    const v = theme[spec.key] ?? FALLBACK_THEME[spec.key];
    // Empty font and color fields are left unset so the CSS falls back
    // (to the body font, or for the label color, to the muted text color).
    if ((spec.kind === "text" || spec.kind === "color") && String(v ?? "").trim() === "") root.removeProperty(spec.css);
    else root.setProperty(spec.css, cssValue(spec, v));
  }
  document.documentElement.dataset.labelCase = String(theme.labelCase ?? FALLBACK_THEME.labelCase);
}

export function parseTheme(json: string): Theme {
  const raw = JSON.parse(json) as Record<string, unknown>;
  const out: Theme = {};
  for (const spec of THEME_VARS) {
    const v = raw[spec.key];
    if (typeof v === "string" || typeof v === "number") out[spec.key] = v;
  }
  return out;
}
