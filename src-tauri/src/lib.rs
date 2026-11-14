mod sync;

use base64::Engine;
use tauri::Manager;
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// Repository root: the Watering Hole is `<root>/watering-hole`, one folder
/// per series holding `series.txt` and one `<cell>/quiz.txt` per quiz; the
/// attempt log and the list of imported series are in `<root>/data`.
/// Override with TEMBO_ROOT; defaults to the directory containing
/// `src-tauri`, which is right for `tauri dev`.
fn root() -> PathBuf {
    if let Ok(p) = std::env::var("TEMBO_ROOT") {
        return PathBuf::from(p);
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
}

#[derive(Serialize)]
struct QuizFile {
    /// Directory holding quiz.txt and any images it references.
    dir: String,
    path: String,
    source: String,
}

#[derive(Serialize)]
struct SeriesFile {
    /// Directory holding series.txt and the quiz folders.
    dir: String,
    path: String,
    /// series.txt, or None when the folder has none (reported by the app).
    source: Option<String>,
    quizzes: Vec<QuizFile>,
}

/// Subfolders of `dir` in name order, skipping scratch folders (`_...`).
fn subdirs(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut out = Vec::new();
    if !dir.exists() {
        return Ok(out);
    }
    for entry in fs::read_dir(dir).map_err(|e| format!("{}: {e}", dir.display()))? {
        let path = entry.map_err(|e| e.to_string())?.path();
        let hidden = path.file_name().and_then(|n| n.to_str()).map_or(true, |n| n.starts_with('_') || n.starts_with('.'));
        if !hidden && path.is_dir() {
            out.push(path);
        }
    }
    out.sort();
    Ok(out)
}

fn read_text(path: &Path) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))
}

fn list_in(hole: &Path) -> Result<Vec<SeriesFile>, String> {
    let mut out = Vec::new();
    for dir in subdirs(hole)? {
        let path = dir.join("series.txt");
        let mut quizzes = Vec::new();
        for cell in subdirs(&dir)? {
            let quiz = cell.join("quiz.txt");
            if !quiz.is_file() {
                continue;
            }
            quizzes.push(QuizFile {
                dir: cell.to_string_lossy().into_owned(),
                path: quiz.to_string_lossy().into_owned(),
                source: read_text(&quiz)?,
            });
        }
        // A folder with neither series.txt nor quizzes is not a series.
        if !path.is_file() && quizzes.is_empty() {
            continue;
        }
        out.push(SeriesFile {
            dir: dir.to_string_lossy().into_owned(),
            path: path.to_string_lossy().into_owned(),
            source: if path.is_file() { Some(read_text(&path)?) } else { None },
            quizzes,
        });
    }
    Ok(out)
}

#[tauri::command]
fn list_series() -> Result<Vec<SeriesFile>, String> {
    list_in(&root().join("watering-hole"))
}

/// Ids of the series imported from the Watering Hole, one per line
/// (data/library.txt; empty string if absent).
#[tauri::command]
fn read_library() -> Result<String, String> {
    let path = root().join("data").join("library.txt");
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))
}

/// Replace the list of imported series ids, then commit and push it.
#[tauri::command]
fn write_library(app: tauri::AppHandle, ids: Vec<String>, message: String) -> Result<(), String> {
    if let Some(bad) = ids.iter().find(|id| id.trim().is_empty() || id.contains('\n')) {
        return Err(format!("bad series id: {bad:?}"));
    }
    let dir = root().join("data");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut text = ids.join("\n");
    if !text.is_empty() {
        text.push('\n');
    }
    fs::write(dir.join("library.txt"), text).map_err(|e| e.to_string())?;
    sync::push_file(app, root(), "data/library.txt", message);
    Ok(())
}

/// Open a file or folder inside the repo with the default macOS app.
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    let root = fs::canonicalize(root()).map_err(|e| e.to_string())?;
    let target = fs::canonicalize(&path).map_err(|e| format!("{path}: {e}"))?;
    if !target.starts_with(&root) {
        return Err(format!("{path}: outside the repo"));
    }
    std::process::Command::new("open").arg(&target).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Read an image from inside a quiz directory and return it as a data URL.
/// `rel` must stay inside `dir`.
#[tauri::command]
fn read_asset(dir: String, rel: String) -> Result<String, String> {
    let dir = fs::canonicalize(&dir).map_err(|e| format!("{dir}: {e}"))?;
    let path = fs::canonicalize(dir.join(&rel)).map_err(|e| format!("{rel}: {e}"))?;
    if !path.starts_with(&dir) {
        return Err(format!("{rel}: outside quiz directory"));
    }
    let bytes = fs::read(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mime = mime_for(&path);
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}

fn mime_for(path: &Path) -> &'static str {
    match path.extension().and_then(|s| s.to_str()).map(|s| s.to_ascii_lowercase()).as_deref() {
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        _ => "application/octet-stream",
    }
}

#[tauri::command]
fn root_dir() -> String {
    let r = root();
    fs::canonicalize(&r).unwrap_or(r).to_string_lossy().into_owned()
}

#[derive(Serialize)]
struct ThemeFile {
    name: String,
    json: String,
    custom: bool,
}

fn themes_in(dir: &Path, custom: bool, out: &mut Vec<ThemeFile>) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|e| format!("{}: {e}", dir.display()))? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
        let json = fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        out.push(ThemeFile { name, json, custom });
    }
    Ok(())
}

/// Default presets: `<root>/themes/*.json`; custom: `<root>/themes/custom/*.json`.
#[tauri::command]
fn list_themes() -> Result<Vec<ThemeFile>, String> {
    let dir = root().join("themes");
    let mut out = Vec::new();
    themes_in(&dir, false, &mut out)?;
    themes_in(&dir.join("custom"), true, &mut out)?;
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

fn theme_name_ok(name: &str) -> Result<(), String> {
    if name.is_empty() || name.contains('/') || name.contains("..") {
        return Err(format!("bad preset name: {name}"));
    }
    Ok(())
}

/// Saves a custom preset. Default presets can't be overwritten.
#[tauri::command]
fn write_theme(name: String, json: String) -> Result<(), String> {
    theme_name_ok(&name)?;
    let themes = root().join("themes");
    if themes.join(format!("{name}.json")).exists() {
        return Err(format!("{name} is a default preset; choose another name"));
    }
    let dir = themes.join("custom");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(format!("{name}.json")), json).map_err(|e| e.to_string())
}

/// Deletes a custom preset.
#[tauri::command]
fn delete_theme(name: String) -> Result<(), String> {
    theme_name_ok(&name)?;
    let path = root().join("themes").join("custom").join(format!("{name}.json"));
    fs::remove_file(&path).map_err(|e| format!("{}: {e}", path.display()))
}

/// `<root>/data/settings.json`; empty string if absent.
#[tauri::command]
fn read_settings() -> Result<String, String> {
    let path = root().join("data").join("settings.json");
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))
}

#[tauri::command]
fn write_settings(json: String) -> Result<(), String> {
    let dir = root().join("data");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("settings.json"), json).map_err(|e| e.to_string())
}

/// Whole attempt log; empty string if there is none yet.
#[tauri::command]
fn read_attempts() -> Result<String, String> {
    let path = root().join("data").join("attempts.jsonl");
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))
}

/// Move the attempt log aside as `attempts.backup-<unix seconds>.jsonl`, so
/// clearing history can be undone by renaming it back.
#[tauri::command]
fn clear_attempts(app: tauri::AppHandle) -> Result<String, String> {
    let backup = move_log_aside()?;
    sync::push_file(app, root(), "data/attempts.jsonl", "Clear attempt history".into());
    Ok(backup)
}

fn move_log_aside() -> Result<String, String> {
    let dir = root().join("data");
    let log = dir.join("attempts.jsonl");
    if !log.exists() {
        return Ok(String::new());
    }
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let backup = dir.join(format!("attempts.backup-{secs}.jsonl"));
    fs::rename(&log, &backup).map_err(|e| format!("{}: {e}", log.display()))?;
    Ok(backup.to_string_lossy().into_owned())
}

#[tauri::command]
fn append_attempt(app: tauri::AppHandle, line: String) -> Result<(), String> {
    write_attempt(&line)?;
    let title = serde_json::from_str::<serde_json::Value>(&line)
        .ok()
        .and_then(|v| v.get("title")?.as_str().map(str::to_owned))
        .unwrap_or_else(|| "quiz".into());
    sync::push_file(app, root(), "data/attempts.jsonl", format!("Record attempt: {title}"));
    Ok(())
}

/// Pull from the remote in the background (no-op without one).
#[tauri::command]
fn sync_now(app: tauri::AppHandle) {
    sync::pull(app, root());
}

#[tauri::command]
fn sync_status() -> sync::SyncStatus {
    sync::status(&root())
}

fn write_attempt(line: &str) -> Result<(), String> {
    let dir = root().join("data");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("attempts.jsonl"))
        .map_err(|e| e.to_string())?;
    writeln!(file, "{line}").map_err(|e| e.to_string())
}

/// The active theme's background color: an override in settings.json, else
/// the preset's "bg" (custom presets first), else the built-in default.
fn theme_background() -> (u8, u8, u8) {
    let fallback = (0xf6, 0xef, 0xe4);
    let read = |p: PathBuf| -> Option<serde_json::Value> {
        serde_json::from_str(&fs::read_to_string(p).ok()?).ok()
    };
    let r = root();
    let settings = read(r.join("data").join("settings.json"));
    let preset = settings
        .as_ref()
        .and_then(|s| s.get("preset")?.as_str().map(str::to_owned))
        .unwrap_or_else(|| "wheat".into());
    let from_override = settings
        .as_ref()
        .and_then(|s| s.get("overrides")?.get("bg")?.as_str().map(str::to_owned));
    let from_preset = || {
        let file = format!("{preset}.json");
        [r.join("themes").join("custom").join(&file), r.join("themes").join(&file)]
            .into_iter()
            .find_map(|p| read(p)?.get("bg")?.as_str().map(str::to_owned))
    };
    from_override
        .or_else(from_preset)
        .and_then(|hex| parse_hex(&hex))
        .unwrap_or(fallback)
}

fn parse_hex(hex: &str) -> Option<(u8, u8, u8)> {
    let h = hex.trim().strip_prefix('#')?;
    let h: String = match h.len() {
        3 => h.chars().flat_map(|c| [c, c]).collect(),
        6 | 8 => h[..6].to_string(),
        _ => return None,
    };
    let byte = |i: usize| u8::from_str_radix(&h[i..i + 2], 16).ok();
    Some((byte(0)?, byte(2)?, byte(4)?))
}

/// Show `png` (base64) as the running app's Dock icon. The page draws it from
/// the theme's icon colors; the bundle's icon returns when the app quits.
#[tauri::command]
fn set_dock_icon(app: tauri::AppHandle, png: String) -> Result<(), String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png)
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    app.run_on_main_thread(move || {
        use objc2::{AllocAnyThread, MainThreadMarker};
        use objc2_app_kit::{NSApplication, NSImage};
        use objc2_foundation::NSData;
        let Some(mtm) = MainThreadMarker::new() else { return };
        let data = NSData::with_bytes(&bytes);
        if let Some(image) = NSImage::initWithData(NSImage::alloc(), &data) {
            unsafe { NSApplication::sharedApplication(mtm).setApplicationIconImage(Some(&image)) };
        }
    })
    .map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "macos"))]
    let _ = (app, bytes);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_series, read_asset, read_attempts, append_attempt,
            root_dir, list_themes, write_theme, delete_theme, read_settings, write_settings,
            read_library, write_library, open_path, clear_attempts,
            sync_now, sync_status, set_dock_icon
        ])
        .setup(|app| {
            // Bring in anything new from the remote (quizzes written in the cloud).
            sync::pull(app.handle().clone(), root());
            // Paint the window in the theme's background before the page has
            // drawn, instead of the webview's default white.
            if let Some(w) = app.get_webview_window("main") {
                let (r, g, b) = theme_background();
                let _ = w.set_background_color(Some(tauri::window::Color(r, g, b, 255)));
            }
            // Safety net: the page shows its own window once it has drawn,
            // but if that never happens the window still appears.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(2000));
                if let Some(w) = handle.get_webview_window("main") {
                    if !w.is_visible().unwrap_or(true) {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    app.run(|handle, event| {
        // Clicking the Dock icon always brings the main window back.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            if let Some(w) = handle.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (handle, event);
    });
}
