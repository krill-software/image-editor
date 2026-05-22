import type { Op, FilterName } from "./types";

export function applyOps(src: ImageData, ops: Op[]): ImageData {
  let cur = src;
  for (const op of ops) cur = applyOp(cur, op);
  return cur;
}

function applyOp(src: ImageData, op: Op): ImageData {
  switch (op.kind) {
    case "rotate": return rotate(src, op.deg);
    case "flip": return flip(src, op.axis);
    case "crop": return crop(src, op.x, op.y, op.w, op.h);
    case "resize": return resize(src, op.width, op.height);
    case "filter": return applyFilter(src, op.name, op.amount);
  }
}

function rotate(src: ImageData, deg: 90 | 180 | 270): ImageData {
  const { width: w, height: h, data: s } = src;
  if (deg === 180) {
    const out = new ImageData(w, h);
    const d = out.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = (y * w + x) * 4;
        const di = ((h - 1 - y) * w + (w - 1 - x)) * 4;
        d[di] = s[si]; d[di + 1] = s[si + 1]; d[di + 2] = s[si + 2]; d[di + 3] = s[si + 3];
      }
    }
    return out;
  }
  const out = new ImageData(h, w);
  const d = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const dx = deg === 90 ? h - 1 - y : y;
      const dy = deg === 90 ? x : w - 1 - x;
      const di = (dy * h + dx) * 4;
      d[di] = s[si]; d[di + 1] = s[si + 1]; d[di + 2] = s[si + 2]; d[di + 3] = s[si + 3];
    }
  }
  return out;
}

function flip(src: ImageData, axis: "h" | "v"): ImageData {
  const { width: w, height: h, data: s } = src;
  const out = new ImageData(w, h);
  const d = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = axis === "h" ? w - 1 - x : x;
      const sy = axis === "v" ? h - 1 - y : y;
      const si = (sy * w + sx) * 4;
      const di = (y * w + x) * 4;
      d[di] = s[si]; d[di + 1] = s[si + 1]; d[di + 2] = s[si + 2]; d[di + 3] = s[si + 3];
    }
  }
  return out;
}

function crop(src: ImageData, x: number, y: number, w: number, h: number): ImageData {
  const cx = Math.max(0, Math.min(src.width - 1, Math.round(x)));
  const cy = Math.max(0, Math.min(src.height - 1, Math.round(y)));
  const cw = Math.max(1, Math.min(src.width - cx, Math.round(w)));
  const ch = Math.max(1, Math.min(src.height - cy, Math.round(h)));
  const out = new ImageData(cw, ch);
  const s = src.data;
  const d = out.data;
  for (let yy = 0; yy < ch; yy++) {
    const srcRow = (cy + yy) * src.width + cx;
    const dstRow = yy * cw;
    for (let xx = 0; xx < cw; xx++) {
      const si = (srcRow + xx) * 4;
      const di = (dstRow + xx) * 4;
      d[di] = s[si]; d[di + 1] = s[si + 1]; d[di + 2] = s[si + 2]; d[di + 3] = s[si + 3];
    }
  }
  return out;
}

function resize(src: ImageData, tw: number, th: number): ImageData {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.getContext("2d")!.putImageData(src, 0, 0);
  const c2 = document.createElement("canvas");
  c2.width = Math.max(1, Math.round(tw));
  c2.height = Math.max(1, Math.round(th));
  const ctx = c2.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(c, 0, 0, c2.width, c2.height);
  return ctx.getImageData(0, 0, c2.width, c2.height);
}

// Filters are implemented as direct pixel math, NOT via Canvas 2D
// `ctx.filter`. WebKitGTK (Tauri's Linux webview) doesn't reliably
// support the canvas-context filter property — setting it is a silent
// no-op, so the previous canvasFilter() left pixels unchanged. The
// thumbnails in the rail still use element-level CSS `filter:` (which
// IS supported), which is why they appeared to work while the baked
// image did not. `cssFilterFor` below is kept solely for those
// element-CSS previews.

function applyFilter(src: ImageData, name: FilterName, amount: number): ImageData {
  switch (name) {
    case "grayscale":  return grayscale(src, clamp01(amount));
    case "sepia":      return sepia(src, clamp01(amount));
    case "invert":     return invert(src, clamp01(amount));
    case "brightness": return brightness(src, 1 + amount / 100);
    case "contrast":   return contrast(src, 1 + amount / 100);
    case "saturation": return saturate(src, 1 + amount / 100);
    case "blur":       return blur(src, Math.max(0, amount));
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Copy ImageData so we never mutate the input. Uint8ClampedArray
 *  auto-clamps writes to 0-255, so no manual clamping is needed. */
function cloneData(src: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
}

// Rec.709 luma coefficients.
const LR = 0.2126, LG = 0.7152, LB = 0.0722;

function grayscale(src: ImageData, a: number): ImageData {
  const out = cloneData(src);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = LR * d[i] + LG * d[i + 1] + LB * d[i + 2];
    d[i]     += (g - d[i])     * a;
    d[i + 1] += (g - d[i + 1]) * a;
    d[i + 2] += (g - d[i + 2]) * a;
  }
  return out;
}

function invert(src: ImageData, a: number): ImageData {
  const out = cloneData(src);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     += (255 - 2 * d[i])     * a;
    d[i + 1] += (255 - 2 * d[i + 1]) * a;
    d[i + 2] += (255 - 2 * d[i + 2]) * a;
  }
  return out;
}

function sepia(src: ImageData, a: number): ImageData {
  const out = cloneData(src);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const sr = 0.393 * r + 0.769 * g + 0.189 * b;
    const sg = 0.349 * r + 0.686 * g + 0.168 * b;
    const sb = 0.272 * r + 0.534 * g + 0.131 * b;
    d[i]     = r + (sr - r) * a;
    d[i + 1] = g + (sg - g) * a;
    d[i + 2] = b + (sb - b) * a;
  }
  return out;
}

function brightness(src: ImageData, m: number): ImageData {
  const out = cloneData(src);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] *= m; d[i + 1] *= m; d[i + 2] *= m;
  }
  return out;
}

function contrast(src: ImageData, c: number): ImageData {
  const out = cloneData(src);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = (d[i]     - 128) * c + 128;
    d[i + 1] = (d[i + 1] - 128) * c + 128;
    d[i + 2] = (d[i + 2] - 128) * c + 128;
  }
  return out;
}

function saturate(src: ImageData, s: number): ImageData {
  const out = cloneData(src);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = LR * d[i] + LG * d[i + 1] + LB * d[i + 2];
    d[i]     = g + (d[i]     - g) * s;
    d[i + 1] = g + (d[i + 1] - g) * s;
    d[i + 2] = g + (d[i + 2] - g) * s;
  }
  return out;
}

/** Gaussian blur, approximated by three box-blur passes (the standard
 *  trick — three boxes converge close to a true Gaussian). Each box
 *  pass is a separable horizontal + vertical sliding-window average,
 *  O(w·h) per pass regardless of radius. */
function blur(src: ImageData, radius: number): ImageData {
  const r = Math.round(radius);
  if (r < 1) return cloneData(src);
  let cur = src;
  for (let pass = 0; pass < 3; pass++) {
    cur = boxBlurAxis(cur, r, true);
    cur = boxBlurAxis(cur, r, false);
  }
  return cur;
}

function boxBlurAxis(src: ImageData, r: number, horizontal: boolean): ImageData {
  const { width: w, height: h, data: s } = src;
  const out = new ImageData(w, h);
  const d = out.data;
  const win = 2 * r + 1;
  // `lines` are rows for a horizontal pass, columns for a vertical one.
  const lineCount = horizontal ? h : w;
  const lineLen = horizontal ? w : h;
  const idx = (line: number, pos: number) =>
    (horizontal ? line * w + pos : pos * w + line) * 4;

  for (let line = 0; line < lineCount; line++) {
    for (let ch = 0; ch < 4; ch++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        const p = k < 0 ? 0 : k >= lineLen ? lineLen - 1 : k;
        sum += s[idx(line, p) + ch];
      }
      for (let pos = 0; pos < lineLen; pos++) {
        d[idx(line, pos) + ch] = sum / win;
        const pOut = pos - r < 0 ? 0 : pos - r;
        const pInRaw = pos + r + 1;
        const pIn = pInRaw >= lineLen ? lineLen - 1 : pInRaw;
        sum += s[idx(line, pIn) + ch] - s[idx(line, pOut) + ch];
      }
    }
  }
  return out;
}

export function cssFilterFor(name: FilterName, amount: number): string {
  switch (name) {
    case "brightness": return `brightness(${1 + amount / 100})`;
    case "contrast": return `contrast(${1 + amount / 100})`;
    case "saturation": return `saturate(${1 + amount / 100})`;
    case "blur": return `blur(${Math.max(0, amount)}px)`;
    case "grayscale": return `grayscale(${clamp01(amount)})`;
    case "sepia": return `sepia(${clamp01(amount)})`;
    case "invert": return `invert(${clamp01(amount)})`;
  }
}
