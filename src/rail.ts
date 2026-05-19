// Right-rail tool palette. Three panels: default (tools + filters), crop (active), resize (active).
//
// The default panel is intentionally one option per row: each row carries
// an icon, a label, and (where the result is previewable) a thumbnail
// painted from the current image with the transform / filter applied.

import type { CropController } from "./crop-tool";
import { cssFilterFor } from "./pipeline";
import { doc } from "./state";
import type { FilterName } from "./types";

export interface RailHandlers {
  rotate: (deg: 90 | 180 | 270) => void;
  flip: (axis: "h" | "v") => void;
  applyFilter: (name: FilterName, amount: number) => void;
  setFilter: (name: FilterName, amount: number) => void;
  clearFilters: () => void;
  applyResize: (w: number, h: number) => void;
  applyCrop: () => void;
  startCrop: () => void;
  startResize: () => void;
  cancelTool: () => void;
}

export interface Rail {
  showDefault(): void;
  showCrop(): void;
  showResize(): void;
}

export function createRail(
  el: HTMLElement,
  canvas: HTMLCanvasElement,
  crop: CropController,
  handlers: RailHandlers,
): Rail {
  let panel: "default" | "crop" | "resize" = "default";

  const render = () => {
    el.replaceChildren();
    if (panel === "default") renderDefault(el, canvas, handlers);
    else if (panel === "crop") renderCrop(el, crop, handlers);
    else if (panel === "resize") renderResize(el, canvas, handlers);
  };

  return {
    showDefault: () => { panel = "default"; render(); },
    showCrop:    () => { panel = "crop"; render(); },
    showResize:  () => { panel = "resize"; render(); },
  };
}

// ---- Icons (Lucide, currentColor) ----------------------------------------

const ICON = {
  rotateLeft:  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9"/><path d="M3 4v5h5"/></svg>`,
  rotateRight: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9"/><path d="M21 4v5h-5"/></svg>`,
  rotate180:   `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12a10 10 0 0 1 20 0v0a10 10 0 0 1-10 10"/><path d="M12 22v-4"/></svg>`,
  flipH:       `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>`,
  flipV:       `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/></svg>`,
  crop:        `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>`,
  resize:      `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h6v6H3z"/><path d="M21 21v-6h-6"/><path d="m21 21-7-7"/></svg>`,
  ban:         `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>`,
  contrast:    `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2v20" fill="currentColor"/></svg>`,
  droplets:    `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4a6 6 0 0 0-8 8 6 6 0 0 0 8 8"/><path d="M22 12a6 6 0 0 1-8 8 6 6 0 0 1-8-8 6 6 0 0 1 8-8 6 6 0 0 1 8 8z"/></svg>`,
  flipColor:   `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 0 0 20Z" fill="currentColor"/></svg>`,
  sun:         `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.93 19.07 1.41-1.41"/><path d="m17.66 6.34 1.41-1.41"/></svg>`,
  contrastFilter: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 18a6 6 0 0 0 0-12v12z" fill="currentColor"/></svg>`,
  saturation:  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5-2 1.6-3 3.5-3 5.5a7 7 0 0 0 7 7z"/></svg>`,
  blur:        `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2v20" stroke-dasharray="2 2"/></svg>`,
};

// ---- Default panel --------------------------------------------------------

function renderDefault(el: HTMLElement, canvas: HTMLCanvasElement, h: RailHandlers) {
  // Transform
  const xform = section("Transform");
  xform.appendChild(optionRow({
    icon: ICON.rotateLeft, label: "Rotate 90° left",
    preview: { kind: "css-transform", value: "rotate(-90deg)" },
    onClick: () => h.rotate(270),
  }));
  xform.appendChild(optionRow({
    icon: ICON.rotateRight, label: "Rotate 90° right",
    preview: { kind: "css-transform", value: "rotate(90deg)" },
    onClick: () => h.rotate(90),
  }));
  xform.appendChild(optionRow({
    icon: ICON.rotate180, label: "Rotate 180°",
    preview: { kind: "css-transform", value: "rotate(180deg)" },
    onClick: () => h.rotate(180),
  }));
  xform.appendChild(optionRow({
    icon: ICON.flipH, label: "Flip horizontal",
    preview: { kind: "css-transform", value: "scaleX(-1)" },
    onClick: () => h.flip("h"),
  }));
  xform.appendChild(optionRow({
    icon: ICON.flipV, label: "Flip vertical",
    preview: { kind: "css-transform", value: "scaleY(-1)" },
    onClick: () => h.flip("v"),
  }));
  xform.appendChild(optionRow({
    icon: ICON.crop, label: "Crop…",
    preview: null,
    onClick: h.startCrop,
  }));
  xform.appendChild(optionRow({
    icon: ICON.resize, label: "Resize…",
    preview: null,
    onClick: h.startResize,
  }));
  el.appendChild(xform);

  // Filters (presets)
  const filters = section("Filters");
  filters.appendChild(optionRow({
    icon: ICON.ban, label: "None",
    preview: { kind: "filter", name: null },
    selectedWhen: () => doc.ops.every(o => o.kind !== "filter"),
    onClick: () => h.clearFilters(),
  }));
  filters.appendChild(filterOptionRow("Black & white", "grayscale", ICON.flipColor, h));
  filters.appendChild(filterOptionRow("Sepia", "sepia", ICON.droplets, h));
  filters.appendChild(filterOptionRow("Invert", "invert", ICON.contrast, h));
  el.appendChild(filters);

  // Adjust (continuous sliders — no thumbnail)
  const adjust = section("Adjust");
  adjust.appendChild(sliderRow("Brightness", "brightness", ICON.sun, -100, 100, canvas, h));
  adjust.appendChild(sliderRow("Contrast",   "contrast",   ICON.contrastFilter, -100, 100, canvas, h));
  adjust.appendChild(sliderRow("Saturation", "saturation", ICON.saturation, -100, 100, canvas, h));
  adjust.appendChild(sliderRow("Blur",       "blur",       ICON.blur, 0, 20, canvas, h));
  el.appendChild(adjust);

  el.appendChild(section("Document", undefined, [docInfoBlock()]));
}

// ---- Option rows (one option, one row, optional thumbnail) ----------------

type PreviewSpec =
  | { kind: "css-transform"; value: string }
  | { kind: "filter"; name: FilterName | null }
  | null;

interface OptionRowSpec {
  icon: string;
  label: string;
  preview: PreviewSpec;
  selectedWhen?: () => boolean;
  onClick: () => void;
}

const THUMB_SIZE = 56;

function optionRow(spec: OptionRowSpec): HTMLElement {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "option-row";

  const head = document.createElement("div");
  head.className = "option-row-head";
  head.innerHTML = `<span class="option-row-icon" aria-hidden="true">${spec.icon}</span><span class="option-row-label">${escapeHtml(spec.label)}</span>`;
  row.appendChild(head);

  if (spec.preview) {
    const thumbWrap = document.createElement("div");
    thumbWrap.className = "option-row-thumb";
    const cnv = document.createElement("canvas");
    cnv.width = THUMB_SIZE; cnv.height = THUMB_SIZE;
    if (spec.preview.kind === "css-transform") cnv.style.transform = spec.preview.value;
    if (spec.preview.kind === "filter" && spec.preview.name)
      cnv.style.filter = cssFilterFor(spec.preview.name, 1);
    thumbWrap.appendChild(cnv);
    row.appendChild(thumbWrap);
    paintThumb(cnv);
    document.addEventListener("doc-changed", () => paintThumb(cnv));
  }

  const refreshSelected = () => {
    if (spec.selectedWhen) row.dataset.selected = String(spec.selectedWhen());
  };
  refreshSelected();
  document.addEventListener("doc-changed", refreshSelected);

  row.addEventListener("click", spec.onClick);
  return row;
}

function filterOptionRow(label: string, name: FilterName, icon: string, h: RailHandlers): HTMLElement {
  return optionRow({
    icon,
    label,
    preview: { kind: "filter", name },
    selectedWhen: () => doc.ops.some(o => o.kind === "filter" && o.name === name),
    onClick: () => {
      const active = doc.ops.some(o => o.kind === "filter" && o.name === name);
      if (active) h.setFilter(name, 0);
      else h.setFilter(name, 1);
    },
  });
}

function paintThumb(c: HTMLCanvasElement) {
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
  const src = doc.rendered;
  if (!src) return;
  const scale = Math.min(THUMB_SIZE / src.width, THUMB_SIZE / src.height);
  const dw = Math.max(1, Math.round(src.width * scale));
  const dh = Math.max(1, Math.round(src.height * scale));
  const dx = Math.round((THUMB_SIZE - dw) / 2);
  const dy = Math.round((THUMB_SIZE - dh) / 2);
  const tmp = document.createElement("canvas");
  tmp.width = src.width; tmp.height = src.height;
  tmp.getContext("2d")!.putImageData(src, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(tmp, dx, dy, dw, dh);
}

// ---- Sliders (no thumbnail; live update on input, commit on change) -------

function sliderRow(
  label: string,
  name: FilterName,
  icon: string,
  min: number,
  max: number,
  canvas: HTMLCanvasElement,
  h: RailHandlers,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "slider-row";

  const head = document.createElement("div");
  head.className = "slider-row-head";
  head.innerHTML = `<span class="option-row-icon" aria-hidden="true">${icon}</span><span class="option-row-label">${escapeHtml(label)}</span><span class="slider-row-value">0</span>`;
  row.appendChild(head);

  const input = document.createElement("input");
  input.type = "range";
  input.className = "slider-row-input";
  input.min = String(min); input.max = String(max);
  input.step = "1";
  row.appendChild(input);

  const vEl = head.querySelector(".slider-row-value") as HTMLSpanElement;

  // Absolute mode: the slider value reflects the current op's amount.
  // Drag → live preview via canvas.style.filter (showing the *change*
  // relative to the committed state). Release → commit via setFilter,
  // which replaces the existing op (or removes it when value===0). The
  // slider stays where the user left it.
  const readCurrent = () => {
    const op = doc.ops.find(o => o.kind === "filter" && o.name === name);
    return op && op.kind === "filter" ? op.amount : 0;
  };
  const reflect = (v: number) => {
    input.value = String(v);
    vEl.textContent = String(v);
  };
  reflect(readCurrent());

  let dragging = false;

  input.addEventListener("input", () => {
    dragging = true;
    const v = +input.value;
    vEl.textContent = String(v);
    // Show the *delta* between current committed value and slider value.
    // doc.rendered already has the committed amount baked in, so we apply
    // a CSS filter that represents "(new value) minus (committed value)".
    const delta = v - readCurrent();
    canvas.style.filter = delta === 0 ? "" : cssFilterFor(name, delta);
  });

  const commit = () => {
    if (!dragging) return;
    dragging = false;
    const v = +input.value;
    canvas.style.filter = "";
    h.setFilter(name, v); // replaces existing op, or removes when v===0
  };
  input.addEventListener("change", commit);
  input.addEventListener("pointerup", commit);

  // External state changes (undo/redo, filter cleared from elsewhere)
  // should update the slider to match.
  document.addEventListener("doc-changed", () => {
    if (dragging) return;
    reflect(readCurrent());
  });

  return row;
}

// ---- Crop / resize panels (unchanged in spirit, simpler markup) -----------

function renderCrop(el: HTMLElement, crop: CropController, h: RailHandlers) {
  const aspectSel = document.createElement("select");
  for (const [label, val] of [
    ["Free", ""],
    ["1:1",  "1"],
    ["4:3",  "4:3"],
    ["3:2",  "3:2"],
    ["16:9", "16:9"],
  ] as const) {
    const o = document.createElement("option");
    o.value = val; o.textContent = label;
    aspectSel.appendChild(o);
  }
  aspectSel.addEventListener("change", () => crop.setAspect(parseAspect(aspectSel.value)));

  const xIn = numInput(0, 99999, 0);
  const yIn = numInput(0, 99999, 0);
  const wIn = numInput(1, 99999, 1);
  const hIn = numInput(1, 99999, 1);

  const sync = () => {
    const r = crop.getRect();
    if (!r) return;
    xIn.value = String(Math.round(r.x));
    yIn.value = String(Math.round(r.y));
    wIn.value = String(Math.round(r.w));
    hIn.value = String(Math.round(r.h));
  };
  crop.onChange(sync);
  sync();

  const commitFromInputs = () => {
    crop.setRect({ x: +xIn.value, y: +yIn.value, w: +wIn.value, h: +hIn.value });
  };
  for (const i of [xIn, yIn, wIn, hIn]) i.addEventListener("change", commitFromInputs);

  el.appendChild(section("Crop", undefined, [
    labeled("Aspect", aspectSel),
    rowFields([labeled("X", xIn), labeled("Y", yIn)]),
    rowFields([labeled("W", wIn), labeled("H", hIn)]),
    rowButtons([btnPrimary("Apply", h.applyCrop), btn("Cancel", h.cancelTool)]),
  ]));
}

function renderResize(el: HTMLElement, canvas: HTMLCanvasElement, h: RailHandlers) {
  const startW = canvas.width, startH = canvas.height;
  const wIn = numInput(1, 99999, startW);
  const hIn = numInput(1, 99999, startH);
  const lockWrap = checkbox("Lock aspect", true);
  const lock = lockWrap.querySelector("input")!;
  const aspect = startW / startH;
  let updating = false;

  wIn.addEventListener("input", () => {
    if (updating || !lock.checked) return;
    updating = true;
    hIn.value = String(Math.max(1, Math.round((+wIn.value) / aspect)));
    updating = false;
  });
  hIn.addEventListener("input", () => {
    if (updating || !lock.checked) return;
    updating = true;
    wIn.value = String(Math.max(1, Math.round((+hIn.value) * aspect)));
    updating = false;
  });

  el.appendChild(section("Resize", undefined, [
    rowFields([labeled("Width", wIn), labeled("Height", hIn)]),
    lockWrap,
    rowButtons([
      btnPrimary("Apply", () => h.applyResize(+wIn.value, +hIn.value)),
      btn("Cancel", h.cancelTool),
    ]),
  ]));
}

// ---- Section + small helpers ---------------------------------------------

function section(title: string, _unused?: undefined, children: HTMLElement[] = []): HTMLElement {
  const s = document.createElement("section");
  s.className = "rail-section";
  const h = document.createElement("h3");
  h.textContent = title;
  s.appendChild(h);
  for (const c of children) s.appendChild(c);
  return s;
}

function docInfoBlock(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "info";
  const update = () => {
    const r = doc.rendered;
    wrap.textContent = r ? `${r.width} × ${r.height} px` : "no image";
  };
  update();
  document.addEventListener("doc-changed", update);
  return wrap;
}

function parseAspect(v: string): number | null {
  if (!v) return null;
  if (v.includes(":")) {
    const [a, b] = v.split(":").map(Number);
    return a / b;
  }
  return +v || null;
}

function rowFields(fields: HTMLElement[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "row fields";
  for (const f of fields) row.appendChild(f);
  return row;
}

function rowButtons(buttons: HTMLElement[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "row";
  for (const b of buttons) row.appendChild(b);
  return row;
}

function btn(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "rail-btn";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function btnPrimary(label: string, onClick: () => void): HTMLButtonElement {
  const b = btn(label, onClick);
  b.classList.add("primary");
  return b;
}

function numInput(min: number, max: number, value: number): HTMLInputElement {
  const i = document.createElement("input");
  i.type = "number"; i.min = String(min); i.max = String(max);
  i.value = String(value);
  return i;
}

function labeled(label: string, child: HTMLElement): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  wrap.appendChild(span);
  wrap.appendChild(child);
  return wrap;
}

function checkbox(label: string, checked: boolean): HTMLLabelElement {
  const wrap = document.createElement("label");
  wrap.className = "checkbox";
  const i = document.createElement("input");
  i.type = "checkbox"; i.checked = checked;
  const span = document.createElement("span");
  span.textContent = label;
  wrap.appendChild(i);
  wrap.appendChild(span);
  return wrap;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]!));
}
