import "@krill-software/desktop-ui/styles";
import "./styles.css";

import { mountChrome, showBootError } from "@krill-software/desktop-ui";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalPosition, LogicalSize } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getMatches } from "@tauri-apps/plugin-cli";
import { confirm } from "@tauri-apps/plugin-dialog";

import { createCropTool } from "./crop-tool";
import {
  basename,
  exportAs,
  newFile,
  openPath,
  openViaDialog,
  save,
  saveAs,
} from "./io";
import { createRail, type RailHandlers } from "./rail";
import {
  canRedo,
  canUndo,
  clearFilters,
  doc,
  isDirty,
  pushOp,
  redo,
  setFilter,
  subscribe,
  undo,
} from "./state";
import type { FilterName, OutputFormat } from "./types";
import { createViewport, type Viewport } from "./viewport";

const UNTITLED = "untitled.png";

const persisted: { window?: { width: number; height: number; x: number; y: number } } = {};
let saveStateTimer: number | undefined;

let canvas: HTMLCanvasElement;
let stage: HTMLDivElement;
let root: HTMLDivElement;
let overlay: HTMLDivElement;
let railEl: HTMLElement;
let titleEl: HTMLElement;

let viewport: Viewport;
let crop: ReturnType<typeof createCropTool>;
let rail: ReturnType<typeof createRail>;

function repaintCanvas() {
  const img = doc.rendered;
  if (!img) return;
  if (canvas.width !== img.width || canvas.height !== img.height) {
    canvas.width = img.width;
    canvas.height = img.height;
    overlay.style.width = `${img.width}px`;
    overlay.style.height = `${img.height}px`;
    viewport.onCanvasResized();
  }
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(img, 0, 0);
  document.dispatchEvent(new CustomEvent("doc-changed"));
}

function updateTitle() {
  const name = doc.path ? basename(doc.path) : UNTITLED;
  const mark = isDirty() ? " •" : "";
  if (titleEl) titleEl.textContent = name;
  const label = `${name}${mark} — Image Editor`;
  document.title = label;
  getCurrentWindow().setTitle(label).catch(() => {});
}

function updateStatus() {
  // Filename lives in the titlebar — see updateTitle. The status line
  // carries only file-identity (dimensions) and state (zoom).
  document.body.dataset.dirty = String(isDirty());
  const dims = doc.rendered ? `${doc.rendered.width} × ${doc.rendered.height}` : "";
  set("status-dims", dims);
  set("status-zoom", doc.rendered ? `${Math.round(viewport.zoom() * 100)}%` : "");
}

function set(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function rotate(deg: 90 | 180 | 270) {
  if (!doc.rendered) return;
  pushOp({ kind: "rotate", deg });
}

function flip(axis: "h" | "v") {
  if (!doc.rendered) return;
  pushOp({ kind: "flip", axis });
}

function applyFilter(name: FilterName, amount: number) {
  if (!doc.rendered) return;
  pushOp({ kind: "filter", name, amount });
}

function applyResize(w: number, h: number) {
  if (!doc.rendered) return;
  pushOp({ kind: "resize", width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) });
  rail.showDefault();
}

function startCrop() {
  rail.showCrop();
  crop.enable(null);
}

function startResize() {
  rail.showResize();
}

function applyCrop() {
  const r = crop.getRect();
  if (!r) { rail.showDefault(); return; }
  pushOp({ kind: "crop", x: r.x, y: r.y, w: r.w, h: r.h });
  crop.disable();
  rail.showDefault();
}

function cancelTool() {
  if (crop.isActive()) crop.disable();
  rail.showDefault();
}

const handlers: RailHandlers = {
  rotate, flip, applyFilter, setFilter, clearFilters, applyResize,
  applyCrop, startCrop, startResize, cancelTool,
};

function togglePreview() {
  const cur = document.body.dataset.mode;
  document.body.dataset.mode = cur === "preview" ? "edit" : "preview";
  // After layout change, refit if in fit mode.
  requestAnimationFrame(() => viewport.onCanvasResized());
}

// Canonical actions are passed inline to mountChrome; app-specific items
// (Export, Image ops, Filters, Preview Mode) come via customMenu.
const exportFmt = (fmt: OutputFormat) => () => void exportAs({
  format: fmt,
  quality: fmt === "jpeg" ? 90 : undefined,
  background: fmt === "jpeg" ? [255, 255, 255] : undefined,
});

/** Build the body chrome via desktop-ui's mountChrome and graft the
 *  app's working view (canvas-root / canvas-stage / canvas / overlay /
 *  rail) and the four status-line spans into the structure. */
function initChrome() {
  const chrome = mountChrome({
    productName: "Image Editor",
    actions: {
      "new":         () => void newFile(),
      "open":        () => void openViaDialog(),
      "save":        () => void save(),
      "save-as":     () => void saveAs(),
      "undo":        () => undo(),
      "redo":        () => redo(),
      "zoom-in":     () => viewport.zoomBy(1.25),
      "zoom-out":    () => viewport.zoomBy(0.8),
      "zoom-fit":    () => viewport.fitToWindow(),
      "zoom-actual": () => viewport.setZoom(1),
    },
    customMenu: [
      {
        group: "file",
        items: [
          { label: "Export PNG…",  action: exportFmt("png")  },
          { label: "Export JPEG…", action: exportFmt("jpeg") },
          { label: "Export WebP…", action: exportFmt("webp") },
          { label: "Export BMP…",  action: exportFmt("bmp")  },
          { label: "Export TIFF…", action: exportFmt("tiff") },
          { label: "Export ICO…",  action: exportFmt("ico")  },
        ],
      },
      {
        group: "image",
        items: [
          { label: "Resize…",             action: startResize },
          { label: "Crop…",               action: startCrop },
          { sep: true },
          { label: "Rotate right (90°)",  shortcut: "Ctrl+R",       action: () => rotate(90) },
          { label: "Rotate left (90°)",   shortcut: "Ctrl+Shift+R", action: () => rotate(270) },
          { label: "Rotate 180°",         action: () => rotate(180) },
          { sep: true },
          { label: "Flip horizontal",     shortcut: "H",            action: () => flip("h") },
          { label: "Flip vertical",       shortcut: "V",            action: () => flip("v") },
        ],
      },
      {
        group: "filter",
        items: [
          { label: "Black & white", action: () => applyFilter("grayscale", 1) },
          { label: "Sepia",         action: () => applyFilter("sepia", 1) },
          { label: "Invert",        action: () => applyFilter("invert", 1) },
        ],
      },
      {
        group: "view",
        items: [
          { label: "Preview mode", shortcut: "F", action: togglePreview },
        ],
      },
    ],
    showAuxPane: true,
    showStatusLine: true,
  });
  titleEl = chrome.title;

  // MAIN (right) — the canvas-root + stage + canvas + overlay tree.
  root = document.createElement("section") as HTMLDivElement; // <section>, typed as div for legacy compat
  root.id = "canvas-root";
  stage = document.createElement("div") as HTMLDivElement;
  stage.id = "canvas-stage";
  canvas = document.createElement("canvas") as HTMLCanvasElement;
  canvas.id = "canvas";
  overlay = document.createElement("div") as HTMLDivElement;
  overlay.id = "canvas-overlay";
  stage.appendChild(canvas);
  stage.appendChild(overlay);
  root.appendChild(stage);
  chrome.viewport.appendChild(root);

  // AUX (left) — tool rail.
  railEl = chrome.aux!;
  railEl.setAttribute("aria-label", "Tools");

  // Status line:
  //   LEFT  (info)  → dimensions of the loaded image
  //   RIGHT (state) → zoom %
  // Filename rides the titlebar; dirty marker rides body[data-dirty].
  const dimsSpan = document.createElement("span");
  dimsSpan.id = "status-dims";
  dimsSpan.classList.add("mono");
  chrome.statusInfo!.appendChild(dimsSpan);

  const zoomSpan = document.createElement("span");
  zoomSpan.id = "status-zoom";
  zoomSpan.classList.add("mono");
  chrome.statusState!.appendChild(zoomSpan);
}

// Esc cancels in-progress tools (preview mode, crop) — the canonical
// action registry doesn't cover that since it's app-mode-aware.
function installEscapeHandler() {
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.body.dataset.mode === "preview") {
      document.body.dataset.mode = "edit";
      requestAnimationFrame(() => viewport.onCanvasResized());
      e.preventDefault();
      return;
    }
    if (crop.isActive()) {
      cancelTool();
      e.preventDefault();
    }
  }, { capture: true });
}

function schedulePersist() {
  if (saveStateTimer !== undefined) clearTimeout(saveStateTimer);
  saveStateTimer = window.setTimeout(() => {
    invoke("save_state", { state: persisted }).catch(() => {});
  }, 300);
}

async function installWindowPersistence() {
  const w = getCurrentWindow();
  if (persisted.window) {
    const { width, height, x, y } = persisted.window;
    await w.setSize(new LogicalSize(width, height)).catch(() => {});
    await w.setPosition(new LogicalPosition(x, y)).catch(() => {});
  }
  const record = async () => {
    try {
      const size = await w.innerSize();
      const pos = await w.outerPosition();
      const factor = await w.scaleFactor();
      persisted.window = {
        width: Math.round(size.width / factor),
        height: Math.round(size.height / factor),
        x: Math.round(pos.x / factor),
        y: Math.round(pos.y / factor),
      };
      schedulePersist();
    } catch { /* ignore */ }
  };
  await w.onResized(record);
  await w.onMoved(record);
  await w.onCloseRequested(async (event) => {
    if (!isDirty()) return;
    event.preventDefault();
    const ok = await confirm("You have unsaved changes. Close anyway?", {
      title: "Unsaved changes",
      kind: "warning",
    });
    if (ok) await w.destroy();
  });
}

async function installFileDrop() {
  const wv = getCurrentWebview();
  await wv.onDragDropEvent(async (e) => {
    if (e.payload.type === "drop") {
      const path = e.payload.paths[0];
      if (path) await openPath(path).catch((err) => console.error("drop open failed:", err));
    }
  });
}

async function boot() {
  try {
    const loaded = await invoke<typeof persisted | null>("load_state");
    if (loaded) Object.assign(persisted, loaded);
  } catch { /* no prior state */ }

  initChrome();

  viewport = createViewport(root, stage, canvas);
  crop = createCropTool(overlay, canvas, viewport);
  rail = createRail(railEl, canvas, crop, handlers);
  rail.showDefault();

  subscribe(() => {
    repaintCanvas();
    updateTitle();
    updateStatus();
    refreshUndoRedoMenuState();
  });

  installEscapeHandler();
  await installWindowPersistence();
  await installFileDrop();

  let openedFromArg = false;
  try {
    const matches = await getMatches();
    const arg = matches.args.file?.value;
    if (typeof arg === "string" && arg.length > 0) {
      await openPath(arg);
      openedFromArg = true;
    }
  } catch { /* cli plugin unavailable */ }

  if (!openedFromArg && import.meta.env.DEV) {
    try {
      const devFile = await invoke<string | null>("dev_test_file");
      if (devFile) await openPath(devFile);
    } catch { /* no dev file */ }
  }

  updateTitle();
  updateStatus();
}

function refreshUndoRedoMenuState() {
  // Menu rebuild is overkill; rely on disabled state via dataset attributes.
  document.body.dataset.canUndo = String(canUndo());
  document.body.dataset.canRedo = String(canRedo());
}

boot().catch((e) => {
  console.error("boot failed:", e);
  showBootError(e);
});
