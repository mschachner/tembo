// Animation settings, applied as attributes and one CSS variable on <html>.
// The CSS gates each kind of animation on its attribute; --dur scales all
// durations (speed 2 → durations halved).

export interface Motion {
  enabled: boolean;
  followSystem: boolean;   // turn everything off when macOS "Reduce motion" is on
  speed: number;           // 0.25–2
  pages: boolean;          // screens and tabs fade/slide in
  lists: boolean;          // rows and cards cascade in
  feedback: boolean;       // accept pop, score bump, reject shake
  celebrate: boolean;      // cleared stamp on results
  themes: boolean;         // color cross-fade on theme changes
  banner: boolean;         // slow drift on photo banners
}

export const DEFAULT_MOTION: Motion = {
  enabled: true, followSystem: true, speed: 1,
  pages: true, lists: true, feedback: true, celebrate: true, themes: true, banner: true,
};

export const MOTION_PARTS: [keyof Motion, string][] = [
  ["pages", "Page transitions"],
  ["lists", "List entrance"],
  ["feedback", "Answer feedback"],
  ["celebrate", "Completion"],
  ["themes", "Theme changes"],
  ["banner", "Banner drift"],
];

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
let current: Motion = DEFAULT_MOTION;

export function applyMotion(m: Motion): void {
  current = m;
  const root = document.documentElement;
  const on = m.enabled && !(m.followSystem && reduce.matches);
  root.dataset.motion = on ? "on" : "off";
  for (const [key] of MOTION_PARTS) root.dataset[`anim${key[0].toUpperCase()}${key.slice(1)}`] = m[key] ? "on" : "off";
  root.style.setProperty("--dur", String(1 / Math.max(0.25, Math.min(2, m.speed || 1))));
}

reduce.addEventListener("change", () => applyMotion(current));

// Give the children of each list an index for staggered entrances.
export function indexForStagger(root: ParentNode): void {
  for (const list of root.querySelectorAll(".quiz-list, .stats, .prompt-grid, .slots, .color-grid")) {
    let i = 0;
    for (const child of list.querySelectorAll(":scope > li, :scope > tr, :scope > tbody > tr, :scope > .color-col")) {
      (child as HTMLElement).style.setProperty("--i", String(Math.min(i++, 24)));
    }
  }
}
