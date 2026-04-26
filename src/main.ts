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
import { installMenuBar, type MenuDef } from "./menu";
import { createRail, type RailHandlers } from "./rail";
import {
  canRedo,
  canUndo,
  doc,
  isDirty,
  pushOp,
  redo,
  subscribe,
  undo,
} from "./state";
import type { FilterName, OutputFormat } from "./types";
import { createViewport, type Viewport } from "./viewport";

const UNTITLED = "untitled.png";

const persisted: { window?: { width: number; height: number; x: number; y: number } } = {};
let saveStateTimer: number | undefined;

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const stage = document.getElementById("canvas-stage") as HTMLDivElement;
const root = document.getElementById("canvas-root") as HTMLDivElement;
const overlay = document.getElementById("canvas-overlay") as HTMLDivElement;
const railEl = document.getElementById("rail") as HTMLElement;

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
  const label = `${name}${mark} — Image`;
  document.title = label;
  getCurrentWindow().setTitle(label).catch(() => {});
}

function updateStatus() {
  const name = doc.path ? basename(doc.path) : UNTITLED;
  set("status-name", name);
  const dirty = document.getElementById("status-dirty");
  if (dirty) dirty.dataset.dirty = String(isDirty());
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
  rotate, flip, applyFilter, applyResize,
  applyCrop, startCrop, startResize, cancelTool,
};

function togglePreview() {
  const cur = document.body.dataset.mode;
  document.body.dataset.mode = cur === "preview" ? "edit" : "preview";
  // After layout change, refit if in fit mode.
  requestAnimationFrame(() => viewport.onCanvasResized());
}

function buildMenus(): MenuDef[] {
  const exportFmt = (fmt: OutputFormat) => () => void exportAs({
    format: fmt,
    quality: fmt === "jpeg" ? 90 : undefined,
    background: fmt === "jpeg" ? [255, 255, 255] : undefined,
  });
  return [
    {
      label: "File",
      items: [
        { label: "New",       shortcut: "Ctrl+N",       action: () => void newFile() },
        { label: "Open…",     shortcut: "Ctrl+O",       action: () => void openViaDialog() },
        { sep: true },
        { label: "Save",      shortcut: "Ctrl+S",       action: () => void save() },
        { label: "Save As…",  shortcut: "Ctrl+Shift+S", action: () => void saveAs() },
        { sep: true },
        { label: "Export PNG…",  action: exportFmt("png")  },
        { label: "Export JPEG…", action: exportFmt("jpeg") },
        { label: "Export WebP…", action: exportFmt("webp") },
        { label: "Export BMP…",  action: exportFmt("bmp")  },
        { label: "Export TIFF…", action: exportFmt("tiff") },
        { label: "Export ICO…",  action: exportFmt("ico")  },
        { sep: true },
        { label: "Quit",      shortcut: "Ctrl+Q",       action: () => void getCurrentWindow().close() },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", shortcut: "Ctrl+Z",       action: () => undo() },
        { label: "Redo", shortcut: "Ctrl+Shift+Z", action: () => redo() },
      ],
    },
    {
      label: "Image",
      items: [
        { label: "Resize…",            action: startResize },
        { label: "Crop…",              action: startCrop },
        { sep: true },
        { label: "Rotate Right (90°)", shortcut: "Ctrl+R",       action: () => rotate(90) },
        { label: "Rotate Left (90°)",  shortcut: "Ctrl+Shift+R", action: () => rotate(270) },
        { label: "Rotate 180°",        action: () => rotate(180) },
        { sep: true },
        { label: "Flip Horizontal",    shortcut: "H",            action: () => flip("h") },
        { label: "Flip Vertical",      shortcut: "V",            action: () => flip("v") },
      ],
    },
    {
      label: "Filter",
      items: [
        { label: "Black & White", action: () => applyFilter("grayscale", 1) },
        { label: "Sepia",          action: () => applyFilter("sepia", 1) },
        { label: "Invert",         action: () => applyFilter("invert", 1) },
      ],
    },
    {
      label: "View",
      items: [
        { label: "Zoom In",    shortcut: "Ctrl+=", action: () => viewport.zoomBy(1.25) },
        { label: "Zoom Out",   shortcut: "Ctrl+-", action: () => viewport.zoomBy(0.8) },
        { label: "Fit",        shortcut: "Ctrl+0", action: () => viewport.fitToWindow() },
        { label: "100%",       shortcut: "Ctrl+1", action: () => viewport.setZoom(1) },
        { sep: true },
        { label: "Preview Mode", shortcut: "F",     action: togglePreview },
      ],
    },
  ];
}

function installTitlebar() {
  const w = getCurrentWindow();
  const bind = (id: string, handler: () => void | Promise<void>) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", (e) => { e.preventDefault(); void handler(); });
  };
  bind("titlebar-min", () => w.minimize());
  bind("titlebar-max", async () => (await w.isMaximized()) ? w.unmaximize() : w.maximize());
  bind("titlebar-close", () => w.close());
  const drag = document.getElementById("titlebar-drag");
  if (drag) drag.addEventListener("dblclick", async () =>
    (await w.isMaximized()) ? w.unmaximize() : w.maximize(),
  );
}

function installKeybindings() {
  const mac = navigator.platform.toLowerCase().includes("mac");
  window.addEventListener("keydown", (e) => {
    // Allow Esc to cancel active tool / preview
    if (e.key === "Escape") {
      if (document.body.dataset.mode === "preview") {
        document.body.dataset.mode = "edit";
        requestAnimationFrame(() => viewport.onCanvasResized());
        e.preventDefault();
        return;
      }
      if (crop.isActive()) {
        cancelTool();
        e.preventDefault();
        return;
      }
    }

    if (isTextTarget(e.target)) return;

    if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      togglePreview();
      e.preventDefault();
      return;
    }
    if (e.key.toLowerCase() === "h" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      flip("h"); e.preventDefault(); return;
    }
    if (e.key.toLowerCase() === "v" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      flip("v"); e.preventDefault(); return;
    }

    const mod = mac ? e.metaKey : e.ctrlKey;
    if (!mod || e.altKey) return;
    const k = e.key.toLowerCase();
    const shift = e.shiftKey;
    let handled = true;
    if (k === "s" && !shift) void save();
    else if (k === "s" && shift) void saveAs();
    else if (k === "o" && !shift) void openViaDialog();
    else if (k === "n" && !shift) void newFile();
    else if (k === "q" && !shift) void getCurrentWindow().close();
    else if (k === "z" && !shift) undo();
    else if (k === "z" && shift) redo();
    else if (k === "y" && !shift) redo();
    else if (k === "r" && !shift) rotate(90);
    else if (k === "r" && shift) rotate(270);
    else if (k === "=" || k === "+") viewport.zoomBy(1.25);
    else if (k === "-") viewport.zoomBy(0.8);
    else if (k === "0") viewport.fitToWindow();
    else if (k === "1") viewport.setZoom(1);
    else if (k === "e" && !shift) handled = false; // reserved for export menu
    else handled = false;
    if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, { capture: true });
}

function isTextTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable;
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

  installTitlebar();
  const menuContainer = document.getElementById("menu-bar");
  if (menuContainer) installMenuBar(menuContainer, buildMenus());
  installKeybindings();
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

boot().catch((e) => console.error("boot failed:", e));
