// Right-rail tool palette. Three panels: default (tools + filters), crop (active), resize (active).

import type { CropController } from "./crop-tool";
import { cssFilterFor } from "./pipeline";
import { doc } from "./state";
import type { FilterName } from "./types";

export interface RailHandlers {
  rotate: (deg: 90 | 180 | 270) => void;
  flip: (axis: "h" | "v") => void;
  applyFilter: (name: FilterName, amount: number) => void;
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

function renderDefault(el: HTMLElement, canvas: HTMLCanvasElement, h: RailHandlers) {
  el.appendChild(section("Transform", [
    rowButtons([
      btn("⟲ Rotate L", () => h.rotate(270)),
      btn("⟳ Rotate R", () => h.rotate(90)),
      btn("180°",       () => h.rotate(180)),
    ]),
    rowButtons([
      btn("Flip H", () => h.flip("h")),
      btn("Flip V", () => h.flip("v")),
    ]),
    rowButtons([
      btn("Resize…", h.startResize),
      btn("Crop…",   h.startCrop),
    ]),
  ]));

  el.appendChild(section("Filters", [
    rowButtons([
      btn("B / W",  () => h.applyFilter("grayscale", 1)),
      btn("Sepia",  () => h.applyFilter("sepia", 1)),
      btn("Invert", () => h.applyFilter("invert", 1)),
    ]),
    slider("Brightness", "brightness", -100, 100, canvas, h),
    slider("Contrast",   "contrast",   -100, 100, canvas, h),
    slider("Saturation", "saturation", -100, 100, canvas, h),
    slider("Blur",       "blur",         0,  20, canvas, h),
  ]));

  el.appendChild(section("Document", [docInfoBlock()]));
}

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

  el.appendChild(section("Crop", [
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

  el.appendChild(section("Resize", [
    rowFields([labeled("Width", wIn), labeled("Height", hIn)]),
    lockWrap,
    rowButtons([
      btnPrimary("Apply", () => h.applyResize(+wIn.value, +hIn.value)),
      btn("Cancel", h.cancelTool),
    ]),
  ]));
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

function section(title: string, children: HTMLElement[]): HTMLElement {
  const s = document.createElement("section");
  s.className = "rail-section";
  const h = document.createElement("h3");
  h.textContent = title;
  s.appendChild(h);
  for (const c of children) s.appendChild(c);
  return s;
}

function rowButtons(buttons: HTMLElement[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "row";
  for (const b of buttons) row.appendChild(b);
  return row;
}

function rowFields(fields: HTMLElement[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "row fields";
  for (const f of fields) row.appendChild(f);
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

function slider(
  label: string,
  name: FilterName,
  min: number, max: number,
  canvas: HTMLCanvasElement,
  h: RailHandlers,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "slider";
  const lab = document.createElement("div");
  lab.className = "slider-label";
  lab.innerHTML = `<span>${label}</span><span class="slider-value">0</span>`;
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min); input.max = String(max);
  input.step = "1"; input.value = "0";
  const vEl = lab.querySelector(".slider-value") as HTMLSpanElement;

  const live = () => {
    const v = +input.value;
    vEl.textContent = String(v);
    canvas.style.filter = cssFilterFor(name, v);
  };
  const commit = () => {
    const v = +input.value;
    canvas.style.filter = "";
    if (v !== 0) h.applyFilter(name, v);
    input.value = "0";
    vEl.textContent = "0";
  };
  input.addEventListener("input", live);
  input.addEventListener("change", commit);
  input.addEventListener("pointerup", commit);

  wrap.appendChild(lab);
  wrap.appendChild(input);
  return wrap;
}
