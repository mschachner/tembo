use base64::Engine;
use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// Repository root: quizzes live in `<root>/quizzes/<name>/quiz.txt`,
/// attempts in `<root>/data`. Override with QUIZAPP_ROOT; defaults to the
/// directory containing `src-tauri`, which is right for `tauri dev`.
fn root() -> PathBuf {
    if let Ok(p) = std::env::var("QUIZAPP_ROOT") {
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

#[tauri::command]
fn list_quizzes() -> Result<Vec<QuizFile>, String> {
    let quizzes = root().join("quizzes");
    let entries = fs::read_dir(&quizzes).map_err(|e| format!("{}: {e}", quizzes.display()))?;
    let mut out = Vec::new();
    for entry in entries {
        let dir = entry.map_err(|e| e.to_string())?.path();
        let path = dir.join("quiz.txt");
        if !dir.is_dir() || !path.is_file() {
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
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![list_quizzes, read_asset, append_attempt])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
