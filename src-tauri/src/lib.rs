use std::fs;
use std::io::BufWriter;
use std::path::Path;

use image::{DynamicImage, ImageFormat, RgbImage, RgbaImage};
use serde::{Deserialize, Serialize};

use krill_desktop_core::{fs as kfs, state as kstate, dev as kdev};

const SLUG: &str = "krill-image-editor";

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
        path: kfs::absolute_path(p),
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
            fs::create_dir_all(parent).map_err(|e| kfs::format_io_err(&path, e))?;
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
        let file = fs::File::create(p).map_err(|e| kfs::format_io_err(&path, e))?;
        let mut w = BufWriter::new(file);
        let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut w, q);
        DynamicImage::ImageRgb8(rgb)
            .write_with_encoder(encoder)
            .map_err(|e| format!("{path}: {e}"))?;
    } else {
        let dyn_img = DynamicImage::ImageRgba8(img);
        dyn_img.save_with_format(p, fmt).map_err(|e| format!("{path}: {e}"))?;
    }

    Ok(kfs::absolute_path(p))
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
    window: Option<kstate::WindowGeometry>,
    recent: Option<Vec<String>>,
}

#[tauri::command]
fn load_state() -> Option<AppState> {
    kstate::load(SLUG, "state.json")
}

#[tauri::command]
fn save_state(state: AppState) -> Result<(), String> {
    kstate::save(SLUG, "state.json", &state)
}

#[tauri::command]
fn dev_test_file() -> Option<String> {
    kdev::test_file(env!("CARGO_MANIFEST_DIR"), &["test.png"])
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
