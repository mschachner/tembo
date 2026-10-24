// A short shower of theme-colored flecks over the window, for a first
// clear. Nothing is left behind once it ends; off with animations.
export function celebrate(count = 36): void {
  if (document.documentElement.dataset.motion !== "on") return;
  const layer = document.createElement("div");
  layer.className = "confetti";
  const colors = ["var(--accent)", "var(--instant)", "var(--slow)", "var(--fg-2)"];
  for (let i = 0; i < count; i++) {
    const f = document.createElement("i");
    f.style.setProperty("--x", `${Math.random() * 100}%`);
    f.style.setProperty("--d", `${(0.9 + Math.random() * 0.9).toFixed(2)}s`);
    f.style.setProperty("--w", `${(Math.random() * 2 - 1).toFixed(2)}`);
    f.style.setProperty("--r", `${Math.round(Math.random() * 720 - 360)}deg`);
    f.style.animationDelay = `${(Math.random() * 0.5).toFixed(2)}s`;
    f.style.background = colors[i % colors.length];
    layer.append(f);
  }
  document.body.append(layer);
  window.setTimeout(() => layer.remove(), 2600);
}
