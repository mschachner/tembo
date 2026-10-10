// Animation settings, applied as attributes and one CSS variable on <html>.
// The CSS gates each kind of animation on its attribute; --dur scales all
// durations (speed 2 → durations halved).

export interface Motion {
  enabled: boolean;
  speed: number;           // 0.25–2
}

export const DEFAULT_MOTION: Motion = { enabled: true, speed: 1 };

// Each kind of animation has its own attribute so the CSS can still gate
// them separately; for now they all follow the one switch.
const PARTS = ["pages", "lists", "feedback", "celebrate", "themes", "banner"];

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
let current: Motion = DEFAULT_MOTION;

export function applyMotion(m: Motion): void {
  current = m;
  const root = document.documentElement;
  // macOS "Reduce motion" turns animations off.
  const on = m.enabled && !reduce.matches;
  root.dataset.motion = on ? "on" : "off";
  for (const key of PARTS) root.dataset[`anim${key[0].toUpperCase()}${key.slice(1)}`] = "on";
  root.style.setProperty("--dur", String(1 / Math.max(0.25, Math.min(2, m.speed || 1))));
}

reduce.addEventListener("change", () => applyMotion(current));

// Give the children of each list an index for staggered entrances.
export function indexForStagger(root: ParentNode): void {
  for (const list of root.querySelectorAll(".stats, .prompt-grid, .slots, .color-grid")) {
    let i = 0;
    for (const child of list.querySelectorAll(":scope > li, :scope > tr, :scope > tbody > tr, :scope > .color-col")) {
      (child as HTMLElement).style.setProperty("--i", String(Math.min(i++, 24)));
    }
  }
}
