// Click-and-drag crop rectangle that lives in image-coordinates and tracks the
// canvas via the same parent transform. Returns image-space rect on apply.

import type { Viewport } from "./viewport";

export interface CropRect { x: number; y: number; w: number; h: number; }

export interface CropController {
  enable(aspect: number | null): void;
  disable(): void;
  isActive(): boolean;
  getRect(): CropRect | null;
  setRect(r: CropRect): void;
  setAspect(a: number | null): void;
  onChange(fn: (r: CropRect | null) => void): void;
}

export function createCropTool(
  overlay: HTMLElement,
  canvas: HTMLCanvasElement,
  viewport: Viewport,
): CropController {
  let active = false;
  let rect: CropRect | null = null;
  let aspect: number | null = null;
  let listeners: ((r: CropRect | null) => void)[] = [];

  const box = document.createElement("div");
  box.className = "crop-box";
  const dim = document.createElement("div");
  dim.className = "crop-dim";

  const enable = (a: number | null) => {
    active = true;
    aspect = a;
    overlay.appendChild(dim);
    overlay.appendChild(box);
    overlay.style.pointerEvents = "auto";
    canvas.style.cursor = "crosshair";
    if (!rect) {
      const w = canvas.width, h = canvas.height;
      const rw = Math.round(w * 0.6);
      const rh = aspect ? Math.round(rw / aspect) : Math.round(h * 0.6);
      rect = { x: Math.round((w - rw) / 2), y: Math.round((h - rh) / 2), w: rw, h: rh };
    }
    if (aspect) rect = constrainAspect(rect!, aspect, canvas);
    render();
    notify();
  };

  const disable = () => {
    active = false;
    box.remove();
    dim.remove();
    overlay.style.pointerEvents = "none";
    canvas.style.cursor = "";
    rect = null;
    notify();
  };

  const setRect = (r: CropRect) => {
    rect = clampRect(r, canvas);
    if (aspect) rect = constrainAspect(rect, aspect, canvas);
    render();
    notify();
  };

  const setAspect = (a: number | null) => {
    aspect = a;
    if (rect && aspect) {
      rect = constrainAspect(rect, aspect, canvas);
      render();
      notify();
    }
  };

  const render = () => {
    if (!rect) { box.style.display = "none"; dim.style.display = "none"; return; }
    box.style.display = "block";
    dim.style.display = "block";
    box.style.left = `${rect.x}px`;
    box.style.top = `${rect.y}px`;
    box.style.width = `${rect.w}px`;
    box.style.height = `${rect.h}px`;
    dim.style.left = "0";
    dim.style.top = "0";
    dim.style.width = `${canvas.width}px`;
    dim.style.height = `${canvas.height}px`;
    dim.style.clipPath = `polygon(
      0 0, 100% 0, 100% 100%, 0 100%, 0 0,
      ${rect.x}px ${rect.y}px,
      ${rect.x}px ${rect.y + rect.h}px,
      ${rect.x + rect.w}px ${rect.y + rect.h}px,
      ${rect.x + rect.w}px ${rect.y}px,
      ${rect.x}px ${rect.y}px
    )`;
  };

  // Mouse interaction lives on the overlay (which sits at canvas pixel coords).
  let mode: "none" | "draw" | "move" | "resize" = "none";
  let resizeCorner = "";
  let startImg = { x: 0, y: 0 };
  let startRect: CropRect = { x: 0, y: 0, w: 0, h: 0 };

  overlay.addEventListener("pointerdown", (e) => {
    if (!active) return;
    const ip = viewport.stageToImage(e.clientX, e.clientY);
    startImg = ip;
    if (rect && hitBoxEdge(ip, rect)) {
      mode = "resize";
      resizeCorner = hitBoxEdge(ip, rect)!;
      startRect = { ...rect };
    } else if (rect && pointInRect(ip, rect)) {
      mode = "move";
      startRect = { ...rect };
    } else {
      mode = "draw";
      rect = { x: ip.x, y: ip.y, w: 0, h: 0 };
    }
    overlay.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  });

  overlay.addEventListener("pointermove", (e) => {
    if (!active || mode === "none") return;
    const ip = viewport.stageToImage(e.clientX, e.clientY);
    if (mode === "draw") {
      rect = normalizeRect(startImg, ip);
    } else if (mode === "move") {
      rect = {
        ...startRect,
        x: startRect.x + (ip.x - startImg.x),
        y: startRect.y + (ip.y - startImg.y),
      };
    } else if (mode === "resize") {
      rect = resizeFromCorner(startRect, resizeCorner, ip);
    }
    if (rect) {
      rect = clampRect(rect, canvas);
      if (aspect) rect = constrainAspect(rect, aspect, canvas);
    }
    render();
    notify();
  });

  const endDrag = (e: PointerEvent) => {
    if (mode === "none") return;
    mode = "none";
    overlay.releasePointerCapture(e.pointerId);
  };
  overlay.addEventListener("pointerup", endDrag);
  overlay.addEventListener("pointercancel", endDrag);

  const notify = () => { for (const fn of listeners) fn(rect); };

  return {
    enable,
    disable,
    isActive: () => active,
    getRect: () => rect ? { ...rect } : null,
    setRect,
    setAspect,
    onChange: (fn) => { listeners.push(fn); },
  };
}

function pointInRect(p: { x: number; y: number }, r: CropRect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function hitBoxEdge(p: { x: number; y: number }, r: CropRect): string | null {
  const m = 8;
  const onLeft = Math.abs(p.x - r.x) <= m;
  const onRight = Math.abs(p.x - (r.x + r.w)) <= m;
  const onTop = Math.abs(p.y - r.y) <= m;
  const onBottom = Math.abs(p.y - (r.y + r.h)) <= m;
  const insideY = p.y >= r.y - m && p.y <= r.y + r.h + m;
  const insideX = p.x >= r.x - m && p.x <= r.x + r.w + m;
  if (onLeft && onTop) return "tl";
  if (onRight && onTop) return "tr";
  if (onLeft && onBottom) return "bl";
  if (onRight && onBottom) return "br";
  if (onLeft && insideY) return "l";
  if (onRight && insideY) return "r";
  if (onTop && insideX) return "t";
  if (onBottom && insideX) return "b";
  return null;
}

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): CropRect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

function clampRect(r: CropRect, canvas: HTMLCanvasElement): CropRect {
  const w = canvas.width, h = canvas.height;
  let x = Math.max(0, Math.min(w - 1, r.x));
  let y = Math.max(0, Math.min(h - 1, r.y));
  let rw = Math.max(1, Math.min(w - x, r.w));
  let rh = Math.max(1, Math.min(h - y, r.h));
  return { x, y, w: rw, h: rh };
}

function constrainAspect(r: CropRect, aspect: number, canvas: HTMLCanvasElement): CropRect {
  // Fit to the rect's longer side, anchored at top-left.
  let { x, y, w, h } = r;
  if (w / h > aspect) w = h * aspect;
  else h = w / aspect;
  if (x + w > canvas.width) w = canvas.width - x;
  if (y + h > canvas.height) h = canvas.height - y;
  if (w / h > aspect) w = h * aspect;
  else h = w / aspect;
  return { x, y, w, h };
}

function resizeFromCorner(start: CropRect, corner: string, ip: { x: number; y: number }): CropRect {
  let { x, y, w, h } = start;
  const right = x + w, bottom = y + h;
  switch (corner) {
    case "tl": return normalizeRect({ x: ip.x, y: ip.y }, { x: right, y: bottom });
    case "tr": return normalizeRect({ x, y: ip.y }, { x: ip.x, y: bottom });
    case "bl": return normalizeRect({ x: ip.x, y }, { x: right, y: ip.y });
    case "br": return normalizeRect({ x, y }, { x: ip.x, y: ip.y });
    case "l":  return normalizeRect({ x: ip.x, y }, { x: right, y: bottom });
    case "r":  return normalizeRect({ x, y }, { x: ip.x, y: bottom });
    case "t":  return normalizeRect({ x, y: ip.y }, { x: right, y: bottom });
    case "b":  return normalizeRect({ x, y }, { x: right, y: ip.y });
  }
  return start;
}
