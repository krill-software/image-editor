// Right-rail tool palette. Three panels: default (tools + filters), crop (active), resize (active).

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
    filterThumbs(h),
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

type ThumbDef =
  | { label: string; kind: "none" }
  | { label: string; kind: "filter"; name: FilterName };

const THUMB_DEFS: ThumbDef[] = [
  { label: "None",   kind: "none" },
  { label: "B / W",  kind: "filter", name: "grayscale" },
  { label: "Sepia",  kind: "filter", name: "sepia" },
  { label: "Invert", kind: "filter", name: "invert" },
];

const THUMB_SIZE = 64;

interface Tile {
  def: ThumbDef;
  tile: HTMLElement;
  canvas: HTMLCanvasElement;
  range: HTMLInputElement | null;
  strength: number;
  setStrength(v: number): void;
}

function filterThumbs(h: RailHandlers): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "filter-thumbs";

  const tiles: Tile[] = THUMB_DEFS.map((def) => {
    const tile = document.createElement("div");
    tile.className = "filter-thumb";
    tile.title = def.label;

    const head = document.createElement("button");
    head.type = "button";
    head.className = "filter-thumb-head";

    const c = document.createElement("canvas");
    c.width = THUMB_SIZE; c.height = THUMB_SIZE;
    c.className = "filter-thumb-canvas";

    const lab = document.createElement("span");
    lab.className = "filter-thumb-label";
    lab.textContent = def.label;

    head.appendChild(c);
    head.appendChild(lab);
    tile.appendChild(head);

    let range: HTMLInputElement | null = null;
    if (def.kind === "filter") {
      range = document.createElement("input");
      range.type = "range";
      range.min = "0"; range.max = "100"; range.step = "1"; range.value = "100";
      range.className = "filter-thumb-strength";
      tile.appendChild(range);
    }

    const t: Tile = {
      def, tile, canvas: c, range,
      strength: 1,
      setStrength(v: number) {
        this.strength = v;
        if (this.range) this.range.value = String(Math.round(v * 100));
        if (def.kind === "filter") c.style.filter = cssFilterFor(def.name, v);
      },
    };
    t.setStrength(1);

    if (def.kind === "filter" && range) {
      const r = range;
      r.addEventListener("input", () => {
        const v = (+r.value) / 100;
        t.strength = v;
        c.style.filter = cssFilterFor(def.name, v);
      });
      r.addEventListener("change", () => {
        h.setFilter(def.name, (+r.value) / 100);
      });
    }

    head.addEventListener("click", () => {
      if (def.kind === "none") {
        h.clearFilters();
        return;
      }
      const isActive = doc.ops.some(
        (o) => o.kind === "filter" && o.name === def.name,
      );
      if (isActive) {
        h.setFilter(def.name, 0);
      } else {
        if (t.strength === 0) t.setStrength(1);
        h.setFilter(def.name, t.strength);
      }
    });

    wrap.appendChild(tile);
    return t;
  });

  const paint = () => {
    const activeNames = new Set(
      doc.ops.filter((o) => o.kind === "filter").map((o) => o.name),
    );
    for (const t of tiles) {
      if (t.def.kind === "filter") {
        const def = t.def;
        const op = doc.ops.find(
          (o) => o.kind === "filter" && o.name === def.name,
        );
        if (op && op.kind === "filter") t.setStrength(op.amount);
        else t.setStrength(1);
      }
      const isActive =
        t.def.kind === "none"
          ? activeNames.size === 0
          : activeNames.has(t.def.name);
      t.tile.classList.toggle("active", isActive);
    }

    const src = doc.rendered;
    if (!src) {
      for (const t of tiles) {
        const ctx = t.canvas.getContext("2d")!;
        ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
      }
      return;
    }
    const scale = Math.min(THUMB_SIZE / src.width, THUMB_SIZE / src.height);
    const dw = Math.max(1, Math.round(src.width * scale));
    const dh = Math.max(1, Math.round(src.height * scale));
    const dx = Math.round((THUMB_SIZE - dw) / 2);
    const dy = Math.round((THUMB_SIZE - dh) / 2);

    const tmp = document.createElement("canvas");
    tmp.width = src.width; tmp.height = src.height;
    tmp.getContext("2d")!.putImageData(src, 0, 0);

    for (const t of tiles) {
      const ctx = t.canvas.getContext("2d")!;
      ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(tmp, dx, dy, dw, dh);
    }
  };

  paint();
  document.addEventListener("doc-changed", paint);
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
