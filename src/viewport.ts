// Manages zoom/pan of the canvas inside #canvas-root via CSS transform on #canvas-stage.
// Image-space coordinates are the canvas's natural pixel grid; screen-space is the
// pointer event's clientX/clientY. Conversions go through stageToImage().

export interface Viewport {
  fitToWindow(): void;
  setZoom(z: number, anchor?: { x: number; y: number }): void;
  zoomBy(factor: number, anchor?: { x: number; y: number }): void;
  resetPan(): void;
  applyTransform(): void;
  onCanvasResized(): void;
  zoom(): number;
  isFitMode(): boolean;
  stageToImage(clientX: number, clientY: number): { x: number; y: number };
}

const MIN_Z = 0.05;
const MAX_Z = 32;

export function createViewport(root: HTMLElement, stage: HTMLElement, canvas: HTMLCanvasElement): Viewport {
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let fit = true;

  const fitToWindow = () => {
    const rw = root.clientWidth;
    const rh = root.clientHeight;
    const cw = canvas.width;
    const ch = canvas.height;
    if (!cw || !ch) return;
    const z = Math.min(rw / cw, rh / ch, 1);
    zoom = z;
    panX = (rw - cw * z) / 2;
    panY = (rh - ch * z) / 2;
    fit = true;
    applyTransform();
  };

  const applyTransform = () => {
    stage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  };

  const setZoom = (z: number, anchor?: { x: number; y: number }) => {
    z = Math.max(MIN_Z, Math.min(MAX_Z, z));
    if (z === zoom) return;
    if (anchor) {
      // keep the anchor under the pointer
      const rect = root.getBoundingClientRect();
      const ax = anchor.x - rect.left;
      const ay = anchor.y - rect.top;
      // image coords under the anchor before zoom
      const ix = (ax - panX) / zoom;
      const iy = (ay - panY) / zoom;
      panX = ax - ix * z;
      panY = ay - iy * z;
    }
    zoom = z;
    fit = false;
    applyTransform();
  };

  const zoomBy = (factor: number, anchor?: { x: number; y: number }) => setZoom(zoom * factor, anchor);

  const resetPan = () => { panX = 0; panY = 0; applyTransform(); };

  const stageToImage = (clientX: number, clientY: number) => {
    const rect = root.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panX) / zoom,
      y: (clientY - rect.top - panY) / zoom,
    };
  };

  const onCanvasResized = () => {
    if (fit) fitToWindow();
    else applyTransform();
  };

  // Wheel-zoom with Ctrl
  root.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.002);
    zoomBy(factor, { x: e.clientX, y: e.clientY });
  }, { passive: false });

  // Space-drag to pan; middle-button drag to pan
  let panning = false;
  let startX = 0, startY = 0, startPanX = 0, startPanY = 0;
  let spaceHeld = false;

  window.addEventListener("keydown", (e) => {
    if (e.key === " " && !e.repeat && !isTextTarget(e.target)) {
      spaceHeld = true;
      root.style.cursor = "grab";
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === " ") { spaceHeld = false; root.style.cursor = ""; }
  });

  root.addEventListener("pointerdown", (e) => {
    if (!spaceHeld && e.button !== 1) return;
    panning = true;
    fit = false;
    startX = e.clientX; startY = e.clientY;
    startPanX = panX; startPanY = panY;
    root.setPointerCapture(e.pointerId);
    root.style.cursor = "grabbing";
    e.preventDefault();
  });
  root.addEventListener("pointermove", (e) => {
    if (!panning) return;
    panX = startPanX + (e.clientX - startX);
    panY = startPanY + (e.clientY - startY);
    applyTransform();
  });
  const endPan = (e: PointerEvent) => {
    if (!panning) return;
    panning = false;
    root.releasePointerCapture(e.pointerId);
    root.style.cursor = spaceHeld ? "grab" : "";
  };
  root.addEventListener("pointerup", endPan);
  root.addEventListener("pointercancel", endPan);

  // Refit on container resize
  const ro = new ResizeObserver(() => { if (fit) fitToWindow(); });
  ro.observe(root);

  return {
    fitToWindow,
    setZoom,
    zoomBy,
    resetPan,
    applyTransform,
    onCanvasResized,
    zoom: () => zoom,
    isFitMode: () => fit,
    stageToImage,
  };
}

function isTextTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable;
}
