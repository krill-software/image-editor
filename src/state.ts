import type { FilterName, Op, OutputFormat } from "./types";
import { applyOps } from "./pipeline";

export interface DocState {
  path: string | null;
  format: OutputFormat;
  original: ImageData | null;
  ops: Op[];
  rendered: ImageData | null;
  history: Op[][];
  future: Op[][];
  savedHash: number;
}

export const doc: DocState = {
  path: null,
  format: "png",
  original: null,
  ops: [],
  rendered: null,
  history: [],
  future: [],
  savedHash: 0,
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

export function setOriginal(img: ImageData, path: string | null, format: OutputFormat) {
  doc.original = img;
  doc.path = path;
  doc.format = format;
  doc.ops = [];
  doc.history = [];
  doc.future = [];
  rerender();
  doc.savedHash = hashOps(doc.ops);
  notify();
}

export function setFilter(name: FilterName, amount: number) {
  if (!doc.original) return;
  const idx = doc.ops.findIndex((o) => o.kind === "filter" && o.name === name);
  if (idx < 0 && amount === 0) return;
  if (idx >= 0) {
    const cur = doc.ops[idx];
    if (cur.kind === "filter" && cur.amount === amount) return;
  }
  doc.history.push(doc.ops.slice());
  doc.future.length = 0;
  if (idx >= 0) {
    if (amount === 0) {
      doc.ops = doc.ops.filter((_, i) => i !== idx);
    } else {
      doc.ops = doc.ops.slice();
      doc.ops[idx] = { kind: "filter", name, amount };
    }
  } else {
    doc.ops = [...doc.ops, { kind: "filter", name, amount }];
  }
  rerender();
  notify();
}

export function clearFilters() {
  if (!doc.original) return;
  if (!doc.ops.some((o) => o.kind === "filter")) return;
  doc.history.push(doc.ops.slice());
  doc.ops = doc.ops.filter((o) => o.kind !== "filter");
  doc.future.length = 0;
  rerender();
  notify();
}

export function pushOp(op: Op) {
  if (!doc.original) return;
  doc.history.push(doc.ops.slice());
  doc.ops.push(op);
  doc.future.length = 0;
  rerender();
  notify();
}

export function undo() {
  if (!doc.history.length) return;
  doc.future.push(doc.ops.slice());
  doc.ops = doc.history.pop()!;
  rerender();
  notify();
}

export function redo() {
  if (!doc.future.length) return;
  doc.history.push(doc.ops.slice());
  doc.ops = doc.future.pop()!;
  rerender();
  notify();
}

export function markSaved(path: string, format: OutputFormat) {
  doc.path = path;
  doc.format = format;
  doc.savedHash = hashOps(doc.ops);
  notify();
}

export function isDirty(): boolean {
  return doc.original !== null && hashOps(doc.ops) !== doc.savedHash;
}

export function canUndo(): boolean { return doc.history.length > 0; }
export function canRedo(): boolean { return doc.future.length > 0; }

function rerender() {
  if (!doc.original) {
    doc.rendered = null;
    return;
  }
  doc.rendered = doc.ops.length === 0 ? doc.original : applyOps(doc.original, doc.ops);
}

function hashOps(ops: Op[]): number {
  let h = 2166136261 >>> 0;
  const s = JSON.stringify(ops);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
