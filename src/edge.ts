// The boundary between banner art and page: two zones stacked at the
// bottom of the art, each a height in pixels (set as a percent of the
// banner height, so moving the edge doesn't change them).
//
//   full art
//   smoothing zone — a continuous fade
//   dithering zone — an ordered (Bayer) dot dissolve
//   page
//
// Opacity falls from 1 to 0 across both zones together; the upper zone
// renders it as a gradient, the lower as thresholded dots. Either zone may
// be 0 px. The mask is a narrow canvas tiled horizontally.

const CELL = 3;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// Average opacity of the art at `fromBottom` px above its bottom edge
// (dots in the dithering zone average out to the same curve).
export function edgeOpacity(fromBottom: number, heightPx: number, smoothPx: number, ditherPx: number): number {
  const H = Math.max(1, heightPx);
  const S = Math.max(0, Math.min(H, smoothPx));
  const D = Math.max(0, Math.min(H - S, ditherPx));
  const zone = S + D;
  if (fromBottom <= 0) return 0;
  if (zone === 0 || fromBottom > zone) return 1;
  const u = fromBottom / zone;
  return u * u * (3 - 2 * u);
}

export function edgeMask(heightPx: number, smoothPx: number, ditherPx: number): string {
  const H = Math.max(1, Math.round(heightPx));
  const S = Math.max(0, Math.min(H, smoothPx));
  const D = Math.max(0, Math.min(H - S, ditherPx));
  const zone = S + D;
  const canvas = document.createElement("canvas");
  canvas.width = CELL * 4;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(canvas.width, H);
  const data = img.data;
  for (let y = 0; y < H; y++) {
    const fromBottom = H - y;              // px above the art's bottom edge
    let a: number;
    if (zone === 0 || fromBottom > zone) {
      a = 1;
    } else {
      const u = fromBottom / zone;         // 0 at the bottom, 1 at the top of the zone
      const t = u * u * (3 - 2 * u);       // eased
      if (fromBottom > D) {
        a = t;                             // smoothing zone: continuous
      } else {
        const bx = Math.floor(y / CELL) % 4;
        a = 0;                             // dithering zone: dots, set per column below
        for (let x = 0; x < canvas.width; x++) {
          const threshold = (BAYER[bx * 4 + (Math.floor(x / CELL) % 4)] + 0.5) / 16;
          const i = (y * canvas.width + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
          data[i + 3] = t > threshold ? 255 : 0;
        }
        continue;
      }
    }
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
      data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return `url("${canvas.toDataURL()}")`;
}

export function applyEdge(art: HTMLElement, smoothPx: number, ditherPx: number, heightPx: number): void {
  const img = edgeMask(heightPx, smoothPx, ditherPx);
  const size = `${CELL * 4}px ${Math.round(heightPx)}px`;
  const st = art.style as CSSStyleDeclaration & { webkitMaskImage?: string; webkitMaskSize?: string; webkitMaskRepeat?: string };
  st.maskImage = img; st.webkitMaskImage = img;
  st.maskSize = size; st.webkitMaskSize = size;
  st.maskRepeat = "repeat-x"; st.webkitMaskRepeat = "repeat-x";
}
