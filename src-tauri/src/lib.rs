mod hole;
mod paths;
mod sync;

use base64::Engine;
use paths::dirs;
use tauri::Manager;
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// The user's own files (paths.rs): the attempt log, the list of imported
/// series, settings, saved presets.
fn data() -> PathBuf {
    dirs().data.clone()
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
    list_in(&dirs().hole())
}

/// Ids of the series imported from the Watering Hole, one per line
/// (library.txt; empty string if absent).
#[tauri::command]
fn read_library() -> Result<String, String> {
    let path = data().join("library.txt");
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))
}

/// Replace the list of imported series ids; synced data commits and pushes it.
#[tauri::command]
fn write_library(app: tauri::AppHandle, ids: Vec<String>, message: String) -> Result<(), String> {
    if let Some(bad) = ids.iter().find(|id| id.trim().is_empty() || id.contains('\n')) {
        return Err(format!("bad series id: {bad:?}"));
    }
    let dir = data();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut text = ids.join("\n");
    if !text.is_empty() {
        text.push('\n');
    }
    fs::write(dir.join("library.txt"), text).map_err(|e| e.to_string())?;
    sync::push(app, data(), message);
    Ok(())
}

/// Open one of Tembo's folders in Finder: "data", "themes" (saved presets,
/// inside the data folder) or "watering-hole".
#[tauri::command]
fn open_folder(which: String) -> Result<(), String> {
    let target = match which.as_str() {
        "data" => data(),
        "themes" => data().join("themes"),
        "watering-hole" => dirs().hole(),
        _ => return Err(format!("{which}: no such folder")),
    };
    // The user's folders may not have been written to yet.
    if which != "watering-hole" {
        fs::create_dir_all(&target).map_err(|e| format!("{}: {e}", target.display()))?;
    }
    std::process::Command::new("open").arg(&target).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Open a Wikipedia article in the default browser. Only English Wikipedia
/// article URLs are accepted.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    let ok = url.starts_with("https://en.wikipedia.org/wiki/")
        && !url.chars().any(|c| c.is_whitespace() || c.is_control());
    if !ok {
        return Err(format!("{url}: not a Wikipedia article"));
    }
    std::process::Command::new("open").arg(&url).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Read an image from inside a quiz directory and return it as a data URL.
/// `rel` must stay inside `dir`.
#[tauri::command]
fn read_asset(dir: String, rel: String) -> Result<String, String> {
    data_url(Path::new(&dir), &rel)
}

/// A theme's banner image as a data URL. `rel` is looked up in the data
/// folder (the user's own images), then among the banners shipped with the app.
#[tauri::command]
fn read_banner(rel: String) -> Result<String, String> {
    data_url(&data(), &rel).or_else(|_| data_url(&dirs().resources, &rel))
}

/// The file `rel` inside `dir`, as a data URL. `rel` must stay inside `dir`.
fn data_url(dir: &Path, rel: &str) -> Result<String, String> {
    let dir = fs::canonicalize(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let path = fs::canonicalize(dir.join(rel)).map_err(|e| format!("{rel}: {e}"))?;
    if !path.starts_with(&dir) {
        return Err(format!("{rel}: outside {}", dir.display()));
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

#[derive(Serialize)]
struct Folders {
    data: String,
    hole: String,
}

/// Where the data folder and the Watering Hole are, for display.
#[tauri::command]
fn folders() -> Folders {
    let shown = |p: PathBuf| fs::canonicalize(&p).unwrap_or(p).to_string_lossy().into_owned();
    Folders { data: shown(data()), hole: shown(dirs().hole()) }
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

/// Default presets: `themes/*.json` shipped with the app; custom:
/// `themes/*.json` in the data folder.
#[tauri::command]
fn list_themes() -> Result<Vec<ThemeFile>, String> {
    let mut out = Vec::new();
    themes_in(&dirs().resources.join("themes"), false, &mut out)?;
    themes_in(&data().join("themes"), true, &mut out)?;
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
fn write_theme(app: tauri::AppHandle, name: String, json: String) -> Result<(), String> {
    theme_name_ok(&name)?;
    if dirs().resources.join("themes").join(format!("{name}.json")).exists() {
        return Err(format!("{name} is a default preset; choose another name"));
    }
    let dir = data().join("themes");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(format!("{name}.json")), json).map_err(|e| e.to_string())?;
    sync::push(app, data(), format!("Save preset: {name}"));
    Ok(())
}

/// Deletes a custom preset.
#[tauri::command]
fn delete_theme(app: tauri::AppHandle, name: String) -> Result<(), String> {
    theme_name_ok(&name)?;
    let path = data().join("themes").join(format!("{name}.json"));
    fs::remove_file(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    sync::push(app, data(), format!("Delete preset: {name}"));
    Ok(())
}

/// settings.json in the data folder; empty string if absent. Synced data
/// commits it along with the next attempt or library change.
#[tauri::command]
fn read_settings() -> Result<String, String> {
    let path = data().join("settings.json");
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))
}

#[tauri::command]
fn write_settings(json: String) -> Result<(), String> {
    let dir = data();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("settings.json"), json).map_err(|e| e.to_string())
}

/// Whole attempt log; empty string if there is none yet.
#[tauri::command]
fn read_attempts() -> Result<String, String> {
    let path = data().join("attempts.jsonl");
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
    sync::push(app, data(), "Clear attempt history".into());
    Ok(backup)
}

fn move_log_aside() -> Result<String, String> {
    let dir = data();
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
    sync::push(app, data(), format!("Record attempt: {title}"));
    Ok(())
}

/// In the background: check for a newer Watering Hole, and pull the data
/// folder from its remote if it has one.
#[tauri::command]
fn sync_now(app: tauri::AppHandle) {
    hole::refresh(app.clone());
    sync::pull(app, data());
}

#[derive(Serialize)]
struct SyncStatus {
    data: sync::Status,
    hole: sync::Status,
}

#[tauri::command]
fn sync_status() -> SyncStatus {
    SyncStatus { data: sync::status(&data()), hole: hole::status() }
}

fn write_attempt(line: &str) -> Result<(), String> {
    let dir = data();
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
    let settings = read(data().join("settings.json"));
    let preset = settings
        .as_ref()
        .and_then(|s| s.get("preset")?.as_str().map(str::to_owned))
        .unwrap_or_else(|| "wheat".into());
    let from_override = settings
        .as_ref()
        .and_then(|s| s.get("overrides")?.get("bg")?.as_str().map(str::to_owned));
    let from_preset = || {
        let file = format!("{preset}.json");
        [data().join("themes").join(&file), dirs().resources.join("themes").join(&file)]
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

/// Hide every window at once, let a sync that is writing to the data
/// folder finish (a few seconds at most), then exit.
fn quit(app: tauri::AppHandle) {
    for w in app.webview_windows().values() {
        let _ = w.hide();
    }
    std::thread::spawn(move || {
        let _held = sync::quiesce(std::time::Duration::from_secs(8));
        app.exit(0);
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_series, read_asset, read_banner, read_attempts, append_attempt,
            folders, list_themes, write_theme, delete_theme, read_settings, write_settings,
            read_library, write_library, open_folder, open_url, clear_attempts,
            sync_now, sync_status
        ])
        // Closing the main window quits the app, settings window included.
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    quit(window.app_handle().clone());
                }
            }
        })
        .setup(|app| {
            paths::init(app)?;
            // Bring in anything new: quizzes for the Watering Hole, and the
            // data folder's remote if it has one.
            hole::refresh(app.handle().clone());
            sync::pull(app.handle().clone(), data());
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
