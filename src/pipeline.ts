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

function applyFilter(src: ImageData, name: FilterName, amount: number): ImageData {
  return canvasFilter(src, cssFilterFor(name, amount));
}

function canvasFilter(src: ImageData, filter: string): ImageData {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.getContext("2d")!.putImageData(src, 0, 0);
  const c2 = document.createElement("canvas");
  c2.width = src.width;
  c2.height = src.height;
  const ctx = c2.getContext("2d")!;
  ctx.filter = filter;
  ctx.drawImage(c, 0, 0);
  return ctx.getImageData(0, 0, src.width, src.height);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
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
