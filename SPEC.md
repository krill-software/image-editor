# Image Editor — Spec (v1)

A minimal, single-file Linux image editor. Open one image, apply a small set of destructive edits, export to a handful of common formats. **The product is the UX, not the feature list** — the bar is Preview.app / feh + a crop tool, not GIMP.

## Goals

- Open, edit, save one raster image at a time — fast launch, no project/album concept.
- Cover the 80% of casual image-editing jobs: resize, crop, rotate, flip, a few filters, export.
- Feel like a native Linux desktop app (`.desktop` entry, file associations, XDG dirs).
- **Instant feedback.** Filters and geometry previews must feel live; the webview handles the preview, Rust handles final encoding.

## Non-goals (v1)

- No layers, masks, selections, paint/brush, text tool, shape tool.
- No non-destructive / adjustment-layer model — every op commits to pixels (snapshot-based undo).
- No multi-tab or multi-window session management (one image per window).
- No plugin system, no cloud sync, no raw-photo development (DNG/NEF/CR2).
- No animated formats (APNG/GIF/WebP-animated).
- No Windows/macOS builds.

## Stack

- **Shell:** Tauri 2 (Rust backend + system webview). Mirrors markdown-editor.
- **Frontend:** TypeScript + Vite.
- **Preview / live edits:** `<canvas>` + Canvas2D. Fast enough for sliders up to ~20 MP, no shader toolchain.
- **Decode / encode / final pixels:** Rust [`image`](https://crates.io/crates/image) crate (PNG, JPEG, WebP, BMP, TIFF, ICO). AVIF via [`image`](https://crates.io/crates/image) feature flag or deferred to v2.
- **Geometry ops:** Rust-side for final output (exact rotate/resize with good resampling); Canvas2D for preview.

Rationale: the split matches markdown-editor's split of "web-native rendering" (Mermaid/KaTeX → canvas-pipeline here) and "Rust I/O" (fs → image codec here). Keep pixel work in Rust when output quality matters; keep it in the webview when the user is dragging a slider.

## Architecture — the edit pipeline

Edits are **destructive but journaled**. One stack of operations applied in order to the loaded pixels. The stack is the undo history.

```
[source bytes]  →  decode (Rust)  →  [RGBA8 buffer]  →  ops stack  →  [preview canvas]
                                                           │
                                                           └──→  on export: apply stack, encode (Rust)
```

- Ops are plain values: `{ kind: "rotate", deg: 90 }`, `{ kind: "crop", rect: {...} }`, `{ kind: "filter", name: "sepia" }`.
- Preview re-runs the stack on the in-memory RGBA buffer via Canvas2D each time the stack changes.
- Export serializes the stack once more, but through Rust for final encode (better resampling, metadata stripping, format breadth).
- Large images (>20 MP): preview runs on a downscaled proxy; Rust re-applies the stack against the full-resolution buffer on export.

### Undo / redo

- Snapshot the ops stack on every committed edit. `Ctrl+Z` pops, `Ctrl+Shift+Z` pushes forward.
- In-flight slider drags (brightness, rotate-fine) don't commit until release — a drag is one entry in history.

## Features (v1)

### File I/O
- **Open:** drag-drop, CLI arg, `Ctrl+O`. Input formats: PNG, JPEG, WebP, BMP, TIFF, GIF (first frame), ICO.
- **Save** (`Ctrl+S`): overwrite original file in its original format.
- **Save As** (`Ctrl+Shift+S`): pick path + format, same quality defaults.
- **Export** (`Ctrl+E`): same as Save As but with a format-specific options panel — JPEG quality, WebP lossless toggle, PNG compression level, strip-EXIF checkbox.
- **Recent files:** last 10, persisted in XDG state.
- **EXIF-aware open:** honor the orientation tag so phone photos are upright. Strip the tag on save unless user opts out.

### Geometry
- **Resize:** pixel dimensions or percentage. Lock-aspect toggle. Resampling: Lanczos3 on Rust export, `imageSmoothingQuality: "high"` on preview.
- **Crop:** click-and-drag rectangle on canvas. Aspect presets: free, 1:1, 4:3, 3:2, 16:9, original. Numeric entry for precise crop box.
- **Rotate:** 90° CW, 90° CCW, 180°. Fine rotate via slider (-45° to +45°, canvas auto-expands, corners fill transparent or white depending on target format).
- **Flip:** horizontal, vertical.
- **Skew / perspective:** four-corner drag on the canvas — each corner is a handle you pull to a new position, bilinear transform applied. Stretch goal in v1 if scope tight; otherwise ship with rotate and cut skew to v2.

### Canvas resize vs. image resize
Two separate ops. "Image resize" changes the pixel dimensions of the content. "Canvas resize" changes the bounds (pad with fill color or trim), leaves content pixels alone.

### Filters
- Grayscale (luminance-preserving, not channel-average).
- Sepia.
- Brightness, contrast, saturation, hue (sliders, preview live).
- Invert.
- Blur (gaussian, radius slider 0–20 px).
- Sharpen (unsharp mask, amount slider).

All filters commit on slider release; preview updates per frame via Canvas2D filter string or a manual ImageData loop where Canvas2D doesn't support it (sepia, channel-mixed ops).

### Viewport
- Zoom: `Ctrl+=` / `Ctrl+-` / `Ctrl+0` (fit), mouse-wheel with `Ctrl`, pinch on touchpads.
- Pan: space-drag, or middle-click-drag.
- Fit-to-window on open.

### Preview mode
- `F` or `Ctrl+P` toggles a chrome-free preview: image only, centered, dark padding. No toolbar, no status line, no menu. `Esc` or the same key returns.
- Intended for "what does this actually look like" before export.

## UX principles

1. **One window, one image.** Opening a second file launches a second process/window.
2. **Canvas is the main surface.** Tools live in a thin collapsible right-rail, not a top toolbar ribbon.
3. **Keyboard reachable.** Every op has a shortcut; the rail is for discovery and sliders.
4. **No modal dialogs during edit.** Save-As / Export are the only modals.
5. **Live preview is truthful.** What the canvas shows after filters/resize must match the exported bytes at the same resolution.

## Window chrome

- Custom titlebar (matches markdown-editor: drag region + min/max/close).
- Right rail: collapsible, shows op controls for the currently active tool.
- Status line at bottom: filename, dimensions, zoom %, dirty dot.

## Keybindings (v1)

| Action | Key |
|---|---|
| Open | `Ctrl+O` |
| Save | `Ctrl+S` |
| Save As | `Ctrl+Shift+S` |
| Export | `Ctrl+E` |
| New (empty canvas) | `Ctrl+N` |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Zoom in / out / fit | `Ctrl+=` / `Ctrl+-` / `Ctrl+0` |
| 100% | `Ctrl+1` |
| Rotate 90° CW / CCW | `Ctrl+R` / `Ctrl+Shift+R` |
| Flip horizontal / vertical | `H` / `V` |
| Crop tool | `C` |
| Preview mode | `F` |
| Quit | `Ctrl+Q` |

## File handling

- **Formats in:** PNG, JPEG, WebP, BMP, TIFF, GIF (first frame), ICO.
- **Formats out:** PNG, JPEG, WebP, BMP, TIFF, ICO. AVIF if the `image` crate's avif feature builds cleanly on Linux; otherwise v2.
- **Dirty tracking:** compare current ops stack hash to last-saved hash. Prompt on close if dirty.
- **External changes:** not watched in v1 (image files rarely mutate under the user the way markdown files do).
- **No autosave.**
- **Alpha handling on JPEG export:** composite onto a user-chosen background color (default white), shown in the export dialog.

## Linux integration

- Binary name: `fippli-image`.
- `.desktop` file with MIME types: `image/png`, `image/jpeg`, `image/webp`, `image/bmp`, `image/tiff`, `image/gif`, `image/x-icon`.
- Config: `$XDG_CONFIG_HOME/fippli-image/config.toml` (empty in v1).
- State: `$XDG_STATE_HOME/fippli-image/` — window geometry, recent files.
- Distribution: AppImage primary; `.deb` secondary. Flatpak deferred.

## Out of scope / open questions

- AVIF encode — feature-flag the `image` crate and decide at M4.
- SVG — deliberately out (vector, different pipeline).
- HDR / 16-bit-per-channel pipelines — v2 at earliest.
- Color management (ICC profiles) — v2.
- Skew/perspective — ship if M3 lands on schedule, else v2.

## Milestones

1. **M1 — Skeleton + open/save:** Tauri app launches, opens an image via CLI/drag-drop, renders to canvas, saves back to disk. Custom titlebar + right rail shell. No ops yet.
2. **M2 — Geometry:** resize, crop, rotate 90°, flip. Undo/redo stack. Zoom + pan.
3. **M3 — Filters:** grayscale, sepia, brightness/contrast/saturation, invert, blur, sharpen. Fine-rotate slider. Skew if time permits.
4. **M4 — Export:** format picker, per-format options, EXIF stripping, JPEG alpha compositing. Recent files.
5. **M5 — Packaging:** `.desktop`, MIME associations, AppImage build, preview mode polish.
