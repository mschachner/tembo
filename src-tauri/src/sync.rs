//! Keeping the repo in step with its GitHub remote, so quizzes written in the
//! cloud arrive here and attempts made here reach the cloud.
//!
//! - `pull`: fetch, and if the remote is ahead, rebase local commits onto it
//!   (uncommitted edits are stashed and restored). A rebase that would
//!   conflict is aborted and reported; nothing is left half-done.
//! - `push_attempts`: commit data/attempts.jsonl alone, pull, push.
//!
//! Everything runs on a background thread, one git operation at a time, and
//! does nothing when the repo has no remote. Failures are recorded for the
//! settings page and never interrupt play.

use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

static GIT: Mutex<()> = Mutex::new(());
static STATUS: Mutex<SyncStatus> = Mutex::new(SyncStatus { remote: None, last_ok: None, error: None });

#[derive(Serialize, Clone)]
pub struct SyncStatus {
    /// URL of the "origin" remote; None when sync isn't set up.
    remote: Option<String>,
    /// Unix seconds of the last successful sync.
    last_ok: Option<u64>,
    /// The last failure, cleared by the next success.
    error: Option<String>,
}

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn git(root: &PathBuf, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .args(args)
        .current_dir(root)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|e| format!("git: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Err(format!("git {}: {}", args.join(" "), err.lines().last().unwrap_or("failed")))
    }
}

fn remote(root: &PathBuf) -> Option<String> {
    git(root, &["remote", "get-url", "origin"]).ok().filter(|s| !s.is_empty())
}

/// Bring in remote commits. Returns whether HEAD moved.
fn pull_locked(root: &PathBuf) -> Result<bool, String> {
    git(root, &["fetch", "--quiet", "origin"])?;
    let behind: u32 = git(root, &["rev-list", "--count", "HEAD..@{u}"])?.parse().unwrap_or(0);
    if behind == 0 {
        return Ok(false);
    }
    let before = git(root, &["rev-parse", "HEAD"])?;
    if let Err(e) = git(root, &["rebase", "--autostash", "@{u}"]) {
        let _ = git(root, &["rebase", "--abort"]);
        return Err(format!("couldn't combine with the remote: {e}"));
    }
    Ok(git(root, &["rev-parse", "HEAD"])? != before)
}

fn record(root: &PathBuf, result: Result<(), String>) {
    let mut s = STATUS.lock().unwrap();
    s.remote = remote(root);
    match result {
        Ok(()) => { s.last_ok = Some(now()); s.error = None; }
        Err(e) => { s.error = Some(e); }
    }
}

fn changed(app: &AppHandle) {
    let _ = app.emit("tembo", serde_json::json!({ "kind": "synced" }));
}

/// Pull in the background; tells the windows to reload if anything arrived.
pub fn pull(app: AppHandle, root: PathBuf) {
    std::thread::spawn(move || {
        let _guard = GIT.lock().unwrap();
        if remote(&root).is_none() { record(&root, Ok(())); return; }
        match pull_locked(&root) {
            Ok(moved) => { record(&root, Ok(())); if moved { changed(&app); } }
            Err(e) => record(&root, Err(e)),
        }
    });
}

/// Commit the attempt log and push it, in the background.
pub fn push_attempts(app: AppHandle, root: PathBuf, message: String) {
    std::thread::spawn(move || {
        let _guard = GIT.lock().unwrap();
        if remote(&root).is_none() { return; }
        let result = (|| -> Result<bool, String> {
            let path = "data/attempts.jsonl";
            // Nothing to commit if the log matches HEAD.
            let dirty = !git(&root, &["status", "--porcelain", "--", path])?.is_empty();
            if dirty {
                let _ = git(&root, &["add", "--all", "--", path]);
                git(&root, &["commit", "--quiet", "-m", &message, "--", path])?;
            }
            let moved = pull_locked(&root)?;
            git(&root, &["push", "--quiet", "origin", "HEAD"])?;
            Ok(moved)
        })();
        match result {
            Ok(moved) => { record(&root, Ok(())); if moved { changed(&app); } }
            Err(e) => record(&root, Err(e)),
        }
    });
}

pub fn status(root: &PathBuf) -> SyncStatus {
    let mut s = STATUS.lock().unwrap().clone();
    if s.remote.is_none() { s.remote = remote(root); }
    s
}
