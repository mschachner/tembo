import { h } from "./dom";

// Answers and anchors may carry sub- and superscripts, written ^{...} and
// _{...}. A superscript and subscript written together, ^{a}_{b} or
// _{b}^{a}, stack one over the other, as in κ → (ω₁)^{<ω}_{2}. Matching
// ignores the markup (normalize drops the braces and carets).
const MARK = /\^\{([^}]*)\}_\{([^}]*)\}|_\{([^}]*)\}\^\{([^}]*)\}|\^\{([^}]*)\}|_\{([^}]*)\}/g;

export function rich(text: string): HTMLElement {
  const out = h("span", {});
  let last = 0;
  for (const m of text.matchAll(MARK)) {
    out.append(text.slice(last, m.index));
    const sup = m[1] ?? m[4], sub = m[2] ?? m[3];
    if (sup !== undefined && sub !== undefined) {
      out.append(h("span", { class: "supsub" }, h("span", {}, sup), h("span", {}, sub)));
    } else if (m[5] !== undefined) {
      out.append(h("sup", {}, m[5]));
    } else {
      out.append(h("sub", {}, m[6]));
    }
    last = m.index + m[0].length;
  }
  out.append(text.slice(last));
  return out;
}

// The text without markup, for places that need a plain string.
export function plain(text: string): string {
  return text.replace(MARK, (_, a, b, c, d, e, f) => [a, b, c, d, e, f].filter((x) => x !== undefined).join(""));
}
