# Image

A minimal image editor for Linux. Open one image, apply a small set of edits, export to a handful of common formats. The bar is Preview.app + a crop tool, not GIMP.

Built on Tauri 2 (Rust + system webview) with a TypeScript/Canvas2D frontend and the [`image`](https://crates.io/crates/image) crate for decode/encode. See [SPEC.md](SPEC.md) for the design rationale.

## Features

- **Open / Save / Save As / Export** — PNG, JPEG, WebP, BMP, TIFF, ICO. Drag-drop and CLI-arg open.
- **Geometry** — resize (lock-aspect), crop (drag rectangle, aspect presets, numeric entry), rotate 90°/180°/270°, flip horizontal/vertical.
- **Filters** — black & white, sepia, invert, brightness, contrast, saturation, blur. Live slider preview, commit on release.
- **Undo / Redo** — snapshot-based op history, `Ctrl+Z` / `Ctrl+Shift+Z`.
- **Zoom / Pan** — `Ctrl+=` / `Ctrl+-` / `Ctrl+0` (fit) / `Ctrl+1` (100%), `Ctrl`+wheel, space-drag, middle-button drag.
- **Preview Mode** — chrome-free image-only view (`F` to toggle).
- **JPEG alpha handling** — flattened onto a configurable background on export.

## Keybindings

| Action | Key |
|---|---|
| Open | `Ctrl+O` |
| Save / Save As | `Ctrl+S` / `Ctrl+Shift+S` |
| New | `Ctrl+N` |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Rotate Right / Left | `Ctrl+R` / `Ctrl+Shift+R` |
| Flip Horizontal / Vertical | `H` / `V` |
| Zoom In / Out / Fit / 100% | `Ctrl+=` / `Ctrl+-` / `Ctrl+0` / `Ctrl+1` |
| Preview mode | `F` |
| Quit | `Ctrl+Q` |

Export formats are reachable from the **File** menu.

## Install

Pre-built artifacts are produced under `release/v<version>/`:

- **AppImage** — portable single-file binary. `chmod +x Image_*.AppImage && ./Image_*.AppImage`.
- **.deb** — `sudo apt install ./Image_*_amd64.deb`.

Verify with `sha256sum -c SHA256SUMS`.

## Run from CLI

```sh
krill-image-editor path/to/photo.jpg
```

Without an arg, opens an empty 800×600 white canvas.

## Build from source

Requires:

- Rust 1.77+ (`rustup`)
- Node 20+ and `pnpm`
- Linux build deps for Tauri 2: see <https://tauri.app/start/prerequisites/>

```sh
pnpm install
pnpm tauri dev      # development with hot reload
pnpm tauri build    # release artifacts in src-tauri/target/release/bundle/
```

## Releasing

Bump the version in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` (all three must match), then:

```sh
pnpm release
```

This runs `tauri build` and gathers AppImage + .deb under `release/v<version>/` with SHA256 checksums. Tagging and pushing are deliberate manual steps — the script does not touch git.

To regather existing artifacts without rebuilding:

```sh
pnpm release:repackage
```

## Project layout

```
image-editor/
├── src/                  TypeScript frontend
│   ├── main.ts             bootstrap, keybindings, glue
│   ├── state.ts            doc state + op stack + undo/redo
│   ├── pipeline.ts         pure ImageData transforms
│   ├── viewport.ts         CSS-transform zoom/pan
│   ├── crop-tool.ts        crop rectangle overlay
│   ├── rail.ts             right-rail tool palette
│   ├── menu.ts             menu bar
│   ├── io.ts               open/save/export through Tauri
│   ├── types.ts            Op + format types
│   └── styles.css
├── src-tauri/            Rust backend
│   ├── src/lib.rs          read_image / save_image / state commands
│   └── tauri.conf.json     bundle + window + file-association config
├── scripts/publish.sh    release helper
├── SPEC.md               design spec
└── README.md
```

## License

TBD.
