// The boundary between banner art and page. Two amounts, both 0–100:
//   smoothing — height of the transition zone as a percent of the banner
//               height, so moving the edge doesn't change it (0 = hard cut);
//   dithering — how much of that transition is rendered as an ordered
//               (Bayer) dot pattern instead of a continuous fade.
// The mask is a narrow canvas tiled horizontally.

const CELL = 3;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function edgeMask(heightPx: number, zonePx: number, dithering: number): string {
  const H = Math.max(1, Math.round(heightPx));
  const zone = Math.max(0, Math.min(H, zonePx));
  const d = Math.max(0, Math.min(100, dithering)) / 100;
  const canvas = document.createElement("canvas");
  canvas.width = CELL * 4;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(canvas.width, H);
  const data = img.data;
  for (let y = 0; y < H; y++) {
    // 1 = fully shown, 0 = fully hidden; eased so the fade starts gently.
    const u = zone === 0 ? (y < H ? 1 : 0) : Math.max(0, Math.min(1, (H - y) / zone));
    const t = u * u * (3 - 2 * u);
    for (let x = 0; x < canvas.width; x++) {
      const threshold = (BAYER[(Math.floor(y / CELL) % 4) * 4 + (Math.floor(x / CELL) % 4)] + 0.5) / 16;
      const dithered = t > threshold ? 1 : 0;
      const a = (1 - d) * t + d * dithered;
      const i = (y * canvas.width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
      data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return `url("${canvas.toDataURL()}")`;
}

export function applyEdge(art: HTMLElement, zonePx: number, dithering: number, heightPx: number): void {
  const img = edgeMask(heightPx, zonePx, dithering);
  const size = `${CELL * 4}px ${Math.round(heightPx)}px`;
  const st = art.style as CSSStyleDeclaration & { webkitMaskImage?: string; webkitMaskSize?: string; webkitMaskRepeat?: string };
  st.maskImage = img; st.webkitMaskImage = img;
  st.maskSize = size; st.webkitMaskSize = size;
  st.maskRepeat = "repeat-x"; st.webkitMaskRepeat = "repeat-x";
}
