// CC0 silhouettes from PhyloPic (see meta.json for species, contributor and
// source). Each file is a single group filled with currentColor.
import meta from "./meta.json";

const files = import.meta.glob("./*.svg", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export interface ElephantInfo {
  id: string;
  species: string;
  contributor: string;
  facing: "left" | "right" | "front";
  license: string;
  source: string;
}

export const ELEPHANTS: ElephantInfo[] = meta as ElephantInfo[];
export const DEFAULT_ELEPHANT = "0489d246";

export function elephantInfo(id: string): ElephantInfo {
  return ELEPHANTS.find((e) => e.id === id) ?? ELEPHANTS.find((e) => e.id === DEFAULT_ELEPHANT)!;
}

// A fresh <svg> for the elephant; flipped horizontally if asked.
export function elephantSvg(id: string, flip = false): SVGSVGElement {
  const info = elephantInfo(id);
  const tpl = document.createElement("template");
  tpl.innerHTML = files[`./${info.id}.svg`];
  const svg = tpl.content.firstElementChild as SVGSVGElement;
  if (flip) svg.style.transform = "scaleX(-1)";
  return svg;
}
