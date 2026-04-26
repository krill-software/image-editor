import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog, confirm } from "@tauri-apps/plugin-dialog";

import { doc, isDirty, markSaved, setOriginal } from "./state";
import type { OutputFormat } from "./types";
import { normalizeFormat } from "./types";

interface ImageRead {
  path: string;
  rgba: number[];
  width: number;
  height: number;
}

interface SaveOpts {
  quality?: number;
  background?: [number, number, number];
}

const INPUT_EXTS = ["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff", "gif", "ico"];
const OUTPUT_EXTS: Record<OutputFormat, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
  bmp: "bmp",
  tiff: "tiff",
  ico: "ico",
};

export function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

export function extOf(p: string): string {
  const i = p.lastIndexOf(".");
  return i >= 0 ? p.slice(i + 1).toLowerCase() : "";
}

export async function openPath(path: string): Promise<void> {
  const res = await invoke<ImageRead>("read_image", { path });
  const data = new Uint8ClampedArray(res.rgba);
  const img = new ImageData(data, res.width, res.height);
  setOriginal(img, res.path, normalizeFormat(extOf(res.path)));
}

export async function openViaDialog(): Promise<void> {
  if (!(await confirmDiscardIfDirty())) return;
  const selected = await openDialog({
    multiple: false,
    directory: false,
    filters: [{ name: "Image", extensions: INPUT_EXTS }],
  });
  if (typeof selected === "string") {
    await openPath(selected).catch((e) => console.error("open failed:", e));
  }
}

export async function newFile(): Promise<void> {
  if (!(await confirmDiscardIfDirty())) return;
  const w = 800, h = 600;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
  }
  setOriginal(new ImageData(data, w, h), null, "png");
}

export async function save(): Promise<boolean> {
  if (!doc.rendered) return false;
  if (!doc.path) return saveAs();
  return writeTo(doc.path, doc.format);
}

export async function saveAs(): Promise<boolean> {
  if (!doc.rendered) return false;
  const def = doc.path ?? `untitled.${OUTPUT_EXTS[doc.format]}`;
  const path = await saveDialog({
    defaultPath: def,
    filters: outputFilters(),
  });
  if (!path) return false;
  const fmt = normalizeFormat(extOf(path));
  return writeTo(path, fmt);
}

export interface ExportRequest {
  format: OutputFormat;
  quality?: number;
  background?: [number, number, number];
}

export async function exportAs(req: ExportRequest): Promise<boolean> {
  if (!doc.rendered) return false;
  const ext = OUTPUT_EXTS[req.format];
  const baseName = doc.path ? basename(doc.path).replace(/\.[^.]+$/, "") : "untitled";
  const path = await saveDialog({
    defaultPath: `${baseName}.${ext}`,
    filters: [{ name: req.format.toUpperCase(), extensions: [ext] }],
  });
  if (!path) return false;
  return writeTo(path, req.format, { quality: req.quality, background: req.background }, /*markAsSaved*/ false);
}

async function writeTo(path: string, format: OutputFormat, opts: SaveOpts = {}, markAsSaved = true): Promise<boolean> {
  const img = doc.rendered;
  if (!img) return false;
  try {
    const written = await invoke<string>("save_image", {
      path,
      width: img.width,
      height: img.height,
      rgba: Array.from(img.data),
      format,
      opts,
    });
    if (markAsSaved) markSaved(written, format);
    return true;
  } catch (e) {
    console.error("save failed:", e);
    return false;
  }
}

function outputFilters() {
  return [
    { name: "PNG", extensions: ["png"] },
    { name: "JPEG", extensions: ["jpg", "jpeg"] },
    { name: "WebP", extensions: ["webp"] },
    { name: "BMP", extensions: ["bmp"] },
    { name: "TIFF", extensions: ["tiff", "tif"] },
    { name: "ICO", extensions: ["ico"] },
  ];
}

export async function confirmDiscardIfDirty(): Promise<boolean> {
  if (!isDirty()) return true;
  return await confirm("You have unsaved changes. Discard them?", {
    title: "Unsaved changes",
    kind: "warning",
  });
}
