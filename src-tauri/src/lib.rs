use std::fs;
use std::io::{self, BufWriter};
use std::path::{Path, PathBuf};

use image::{DynamicImage, ImageFormat, RgbImage, RgbaImage};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
struct ImageRead {
    path: String,
    rgba: Vec<u8>,
    width: u32,
    height: u32,
}

#[tauri::command]
fn read_image(path: String) -> Result<ImageRead, String> {
    let p = Path::new(&path);
    let img = image::open(p).map_err(|e| format!("{path}: {e}"))?;
    let rgba = img.into_rgba8();
    let (width, height) = rgba.dimensions();
    Ok(ImageRead {
        path: absolute_path(p),
        rgba: rgba.into_raw(),
        width,
        height,
    })
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct SaveOpts {
    quality: Option<u8>,
    background: Option<[u8; 3]>,
}

#[tauri::command]
fn save_image(
    path: String,
    width: u32,
    height: u32,
    rgba: Vec<u8>,
    format: String,
    opts: Option<SaveOpts>,
) -> Result<String, String> {
    let img = RgbaImage::from_raw(width, height, rgba)
        .ok_or_else(|| "invalid rgba buffer".to_string())?;
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format_io_err(&path, e))?;
        }
    }
    let opts = opts.unwrap_or_default();
    let fmt = format_from_str(&format)?;

    if matches!(fmt, ImageFormat::Jpeg) {
        // Flatten alpha onto a background color (default white).
        let bg = opts.background.unwrap_or([255, 255, 255]);
        let mut rgb = RgbImage::new(width, height);
        for (x, y, p) in img.enumerate_pixels() {
            let a = p[3] as f32 / 255.0;
            rgb.put_pixel(x, y, image::Rgb([
                ((p[0] as f32) * a + (bg[0] as f32) * (1.0 - a)).round() as u8,
                ((p[1] as f32) * a + (bg[1] as f32) * (1.0 - a)).round() as u8,
                ((p[2] as f32) * a + (bg[2] as f32) * (1.0 - a)).round() as u8,
            ]));
        }
        let q = opts.quality.unwrap_or(90).clamp(1, 100);
        let file = fs::File::create(p).map_err(|e| format_io_err(&path, e))?;
        let mut w = BufWriter::new(file);
        let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut w, q);
        DynamicImage::ImageRgb8(rgb)
            .write_with_encoder(encoder)
            .map_err(|e| format!("{path}: {e}"))?;
    } else {
        let dyn_img = DynamicImage::ImageRgba8(img);
        dyn_img.save_with_format(p, fmt).map_err(|e| format!("{path}: {e}"))?;
    }

    Ok(absolute_path(p))
}

fn format_from_str(s: &str) -> Result<ImageFormat, String> {
    Ok(match s.to_ascii_lowercase().as_str() {
        "png" => ImageFormat::Png,
        "jpeg" | "jpg" => ImageFormat::Jpeg,
        "webp" => ImageFormat::WebP,
        "bmp" => ImageFormat::Bmp,
        "tiff" | "tif" => ImageFormat::Tiff,
        "ico" => ImageFormat::Ico,
        other => return Err(format!("unsupported format: {other}")),
    })
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct AppState {
    window: Option<WindowState>,
    recent: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct WindowState {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
}

fn state_path() -> Option<PathBuf> {
    let base = dirs::state_dir().or_else(dirs::data_local_dir)?;
    Some(base.join("fippli-image").join("state.json"))
}

#[tauri::command]
fn load_state() -> Option<AppState> {
    let p = state_path()?;
    let raw = fs::read_to_string(p).ok()?;
    serde_json::from_str(&raw).ok()
}

#[tauri::command]
fn save_state(state: AppState) -> Result<(), String> {
    let p = state_path().ok_or_else(|| "no state dir available".to_string())?;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    fs::write(p, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn dev_test_file() -> Option<String> {
    if !cfg!(debug_assertions) {
        return None;
    }
    let manifest = env!("CARGO_MANIFEST_DIR");
    let path = Path::new(manifest).parent()?.join("test.png");
    path.exists().then(|| path.to_string_lossy().into_owned())
}

fn absolute_path(p: &Path) -> String {
    fs::canonicalize(p)
        .map(|abs| abs.to_string_lossy().into_owned())
        .unwrap_or_else(|_| p.to_string_lossy().into_owned())
}

fn format_io_err(path: &str, e: io::Error) -> String {
    format!("{path}: {e}")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            read_image,
            save_image,
            load_state,
            save_state,
            dev_test_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
