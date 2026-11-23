//! Keeping the data folder in step with its git remote, when it has one, so
//! the library list written in the cloud arrives here and attempts made here
//! reach the cloud. A data folder that is not a git repository is left alone
//! and git is never run.
//!
//! - `pull`: fetch, and if the remote is ahead, rebase local commits onto it
//!   (uncommitted edits are stashed and restored). A rebase that would
//!   conflict is aborted and reported; nothing is left half-done.
//! - `push`: commit whatever changed in the data folder, pull, push.
//!
//! Everything runs on a background thread, one git operation at a time.
//! Failures are recorded for the settings page and never interrupt play.

use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

static GIT: Mutex<()> = Mutex::new(());
static STATUS: Mutex<Status> = Mutex::new(Status { source: None, last_ok: None, error: None });

/// How one kind of syncing is going: the data folder's (here) or the
/// Watering Hole's (hole.rs).
#[derive(Serialize, Clone)]
pub struct Status {
    /// Where it syncs with; None when it doesn't.
    pub source: Option<String>,
    /// Unix seconds of the last success.
    pub last_ok: Option<u64>,
    /// The last failure, cleared by the next success.
    pub error: Option<String>,
}

pub fn now() -> u64 {
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
        // An app opened from the Dock gets a minimal PATH; add Homebrew's so
        // credential helpers installed there (e.g. gh) are found.
        .env("PATH", format!(
            "{}:/opt/homebrew/bin:/usr/local/bin",
            std::env::var("PATH").unwrap_or_else(|_| "/usr/bin:/bin:/usr/sbin:/sbin".into())
        ))
        .output()
        .map_err(|e| format!("git: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Err(format!("git {}: {}", args.join(" "), err.lines().last().unwrap_or("failed")))
    }
}

/// URL of the "origin" remote; None when the folder is not a git repository
/// or has no remote. git only runs once the folder is known to be a repository.
fn remote(root: &PathBuf) -> Option<String> {
    if !root.join(".git").exists() {
        return None;
    }
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
    s.source = remote(root);
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
        if remote(&root).is_none() { return; }
        match pull_locked(&root) {
            Ok(moved) => { record(&root, Ok(())); if moved { changed(&app); } }
            Err(e) => record(&root, Err(e)),
        }
    });
}

/// Commit everything that changed in the data folder and push it, in the
/// background.
pub fn push(app: AppHandle, root: PathBuf, message: String) {
    std::thread::spawn(move || {
        let _guard = GIT.lock().unwrap();
        if remote(&root).is_none() { return; }
        let result = (|| -> Result<bool, String> {
            git(&root, &["add", "--all"])?;
            // Nothing to commit if the folder matches HEAD.
            let dirty = !git(&root, &["status", "--porcelain"])?.is_empty();
            if dirty {
                git(&root, &["commit", "--quiet", "-m", &message])?;
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

/// Wait, up to `limit`, for a git operation in progress to finish, then hold
/// the lock so none starts: the app can quit without leaving a half-made
/// commit (and a stale lock file) in the data folder. Returns the guard to
/// hold until the process exits.
pub fn quiesce(limit: std::time::Duration) -> Option<std::sync::MutexGuard<'static, ()>> {
    let until = std::time::Instant::now() + limit;
    loop {
        match GIT.try_lock() {
            Ok(guard) => return Some(guard),
            Err(std::sync::TryLockError::Poisoned(p)) => return Some(p.into_inner()),
            Err(std::sync::TryLockError::WouldBlock) if std::time::Instant::now() < until => {
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(_) => return None,
        }
    }
}

pub fn status(root: &PathBuf) -> Status {
    let mut s = STATUS.lock().unwrap().clone();
    s.source = remote(root);
    s
}
