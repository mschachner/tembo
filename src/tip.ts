// Tooltips. An element with a `data-tip` attribute shows that text in a
// small floating label while the pointer rests on it (line breaks in the
// text are kept). There is one label for the whole window. It sits above
// the element, or below when there is no room above, and is always kept
// inside the window. It takes no pointer events, so it can't get in the way
// of a click, and it goes away when the pointer leaves, on a key press, a
// click or a scroll, and when its element is removed by a redraw.

const DELAY_MS = 120;   // the pointer has to rest this long
const GAP = 6;          // px between the element and the label
const EDGE = 8;         // px kept clear of the window's edges

let label: HTMLElement | null = null;
let anchor: Element | null = null;
let timer = 0;

function hide(): void {
  window.clearTimeout(timer);
  anchor = null;
  label?.classList.remove("shown");
}

function show(el: Element): void {
  const text = el.getAttribute("data-tip");
  if (!text || !el.isConnected) { hide(); return; }
  if (!label) {
    label = document.createElement("div");
    label.className = "tip";
    label.setAttribute("role", "tooltip");
    document.body.append(label);
  }
  label.textContent = text;
  // Measure at the origin, where the label has its full width to wrap in.
  label.style.left = "0px";
  label.style.top = "0px";
  const r = el.getBoundingClientRect();
  const w = label.offsetWidth, h = label.offsetHeight;
  const x = Math.max(EDGE, Math.min(window.innerWidth - w - EDGE, r.left + r.width / 2 - w / 2));
  let y = r.top - h - GAP;
  if (y < EDGE) y = r.bottom + GAP;
  y = Math.max(EDGE, Math.min(window.innerHeight - h - EDGE, y));
  label.style.left = `${Math.round(x)}px`;
  label.style.top = `${Math.round(y)}px`;
  label.classList.add("shown");
}

export function installTips(): void {
  document.addEventListener("mouseover", (e) => {
    const el = (e.target as Element | null)?.closest?.("[data-tip]") ?? null;
    if (el === anchor) return;
    hide();
    if (!el) return;
    anchor = el;
    timer = window.setTimeout(() => { if (anchor === el) show(el); }, DELAY_MS);
  });
  // The pointer left the window.
  document.addEventListener("mouseout", (e) => { if (!e.relatedTarget) hide(); });
  for (const type of ["keydown", "mousedown", "wheel", "scroll"]) {
    window.addEventListener(type, hide, { capture: true, passive: true });
  }
  window.addEventListener("blur", hide);
  // A redraw can remove the element under the pointer without the pointer moving.
  new MutationObserver(() => { if (anchor && !anchor.isConnected) hide(); })
    .observe(document.body, { childList: true, subtree: true });
}
