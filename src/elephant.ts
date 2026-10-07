// The app's one elephant: Loxodonta africana africana by Steven Traver,
// CC0 1.0, from PhyloPic (see CREDITS.md). Filled with currentColor.
import raw from "./elephants/tembo.svg?raw";

export function elephantSvg(): SVGSVGElement {
  const tpl = document.createElement("template");
  tpl.innerHTML = raw;
  return tpl.content.firstElementChild as SVGSVGElement;
}
