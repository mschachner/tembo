use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::PathBuf;

/// Repository root: quizzes live in `<root>/quizzes`, attempts in
/// `<root>/data`. Override with QUIZAPP_ROOT; defaults to the directory
/// containing `src-tauri`, which is right for `tauri dev`.
fn root() -> PathBuf {
    if let Ok(p) = std::env::var("QUIZAPP_ROOT") {
        return PathBuf::from(p);
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
}

#[derive(Serialize)]
struct QuizFile {
    path: String,
    source: String,
}

#[tauri::command]
fn list_quizzes() -> Result<Vec<QuizFile>, String> {
    let dir = root().join("quizzes");
    let entries = fs::read_dir(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let mut out = Vec::new();
    for entry in entries {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|s| s.to_str()) != Some("txt") {
            continue;
        }
        let source = fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        out.push(QuizFile { path: path.to_string_lossy().into_owned(), source });
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
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
        .invoke_handler(tauri::generate_handler![list_quizzes, append_attempt])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
