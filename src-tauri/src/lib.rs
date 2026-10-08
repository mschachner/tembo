use base64::Engine;
use tauri::Manager;
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// Repository root: quizzes live in `<root>/quizzes/<name>/quiz.txt`,
/// attempts in `<root>/data`. Override with TEMBO_ROOT; defaults to the
/// directory containing `src-tauri`, which is right for `tauri dev`.
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

fn list_in(quizzes: &Path) -> Result<Vec<QuizFile>, String> {
    let mut out = Vec::new();
    if !quizzes.exists() {
        return Ok(out);
    }
    let entries = fs::read_dir(quizzes).map_err(|e| format!("{}: {e}", quizzes.display()))?;
    for entry in entries {
        let dir = entry.map_err(|e| e.to_string())?.path();
        let path = dir.join("quiz.txt");
        // Folders starting with "_" (drafts, scratch) are ignored.
        let hidden = dir.file_name().and_then(|n| n.to_str()).map_or(true, |n| n.starts_with('_'));
        if hidden || !dir.is_dir() || !path.is_file() {
            continue;
        }
        let source = fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        out.push(QuizFile {
            dir: dir.to_string_lossy().into_owned(),
            path: path.to_string_lossy().into_owned(),
            source,
        });
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

#[tauri::command]
fn list_quizzes() -> Result<Vec<QuizFile>, String> {
    list_in(&root().join("quizzes"))
}

#[tauri::command]
fn list_drafts() -> Result<Vec<QuizFile>, String> {
    list_in(&root().join("quizzes").join("_drafts"))
}

fn plain_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.starts_with('_') || name.starts_with('.') || name.contains('/') || name.contains("..") {
        return Err(format!("bad quiz folder name: {name}"));
    }
    Ok(())
}

/// Move `quizzes/_drafts/<name>` to `quizzes/<name>`.
#[tauri::command]
fn approve_draft(name: String) -> Result<(), String> {
    plain_name(&name)?;
    let from = root().join("quizzes").join("_drafts").join(&name);
    let to = root().join("quizzes").join(&name);
    if to.exists() {
        return Err(format!("quizzes/{name} already exists"));
    }
    fs::rename(&from, &to).map_err(|e| format!("{}: {e}", from.display()))
}

/// Create `quizzes/_drafts/untitled[-n]/quiz.txt` from a template and
/// return the file's path.
#[tauri::command]
fn new_draft() -> Result<String, String> {
    let drafts = root().join("quizzes").join("_drafts");
    fs::create_dir_all(&drafts).map_err(|e| e.to_string())?;
    let mut n = 1;
    let dir = loop {
        let name = if n == 1 { "untitled".to_string() } else { format!("untitled-{n}") };
        let d = drafts.join(name);
        if !d.exists() {
            break d;
        }
        n += 1;
    };
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join("quiz.txt");
    fs::write(&file, "title: \nmode: list\npass: 100\n---\n").map_err(|e| e.to_string())?;
    Ok(file.to_string_lossy().into_owned())
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
fn clear_attempts() -> Result<String, String> {
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
fn append_attempt(line: String) -> Result<(), String> {
    let dir = root().join("data");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("attempts.jsonl"))
        .map_err(|e| e.to_string())?;
    writeln!(file, "{line}").map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_quizzes, read_asset, read_attempts, append_attempt,
            root_dir, list_themes, write_theme, delete_theme, read_settings, write_settings,
            list_drafts, approve_draft, new_draft, open_path, clear_attempts
        ])
        .setup(|app| {
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
