//! Where Tembo's files are.
//!
//! - Resources, read-only and shipped with the app: the default theme
//!   presets (`themes/*.json`), the banner photos (`banners/`) and a copy of
//!   the Watering Hole as it was when the app was built (`watering-hole/`).
//! - Data, the user's own: `library.txt`, `attempts.jsonl`, `settings.json`,
//!   saved presets (`themes/*.json`) and their own banner images
//!   (`banners/`). It is `~/Library/Application Support/<identifier>/data`,
//!   or TEMBO_DATA. When it is a git repository it is kept in step with its
//!   remote (sync.rs); otherwise it stays on this computer.
//! - The Watering Hole: downloaded from the Tembo repository on GitHub into
//!   `~/Library/Application Support/<identifier>/watering-hole` (hole.rs),
//!   with the shipped copy standing in until the first download.
//!
//! Run from a checkout (`tauri dev`, or TEMBO_ROOT set to one), the resources
//! and the Watering Hole are the checkout's own folders and nothing is
//! downloaded, so quizzes being written show up as they are on disk.
//!
//! TEMBO_HOME stands in for `~/Library/Application Support/<identifier>` as a
//! whole: pointed at an empty folder, the app starts as it does for someone
//! opening it for the first time (scripts/fresh.sh).

use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::Manager;

pub struct Dirs {
    pub resources: PathBuf,
    pub data: PathBuf,
    /// Where the downloaded Watering Hole is kept (in `watering-hole/`);
    /// None in a checkout.
    pub cache: Option<PathBuf>,
}

impl Dirs {
    /// The Watering Hole to read: the downloaded one once there is one.
    pub fn hole(&self) -> PathBuf {
        if let Some(cache) = &self.cache {
            let downloaded = cache.join("watering-hole");
            if downloaded.is_dir() {
                return downloaded;
            }
        }
        self.resources.join("watering-hole")
    }
}

static DIRS: OnceLock<Dirs> = OnceLock::new();

fn env_dir(name: &str) -> Option<PathBuf> {
    std::env::var_os(name).filter(|v| !v.is_empty()).map(PathBuf::from)
}

/// Works the folders out; called once, before any window loads.
pub fn init(app: &tauri::App) -> Result<(), String> {
    let checkout = env_dir("TEMBO_ROOT").or_else(|| {
        cfg!(debug_assertions).then(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".."))
    });
    let support = match env_dir("TEMBO_HOME") {
        Some(dir) => dir,
        None => app.path().app_data_dir().map_err(|e| e.to_string())?,
    };
    let resources = match &checkout {
        Some(dir) => dir.clone(),
        None => app.path().resource_dir().map_err(|e| e.to_string())?,
    };
    let dirs = Dirs {
        resources,
        data: env_dir("TEMBO_DATA").unwrap_or_else(|| support.join("data")),
        cache: if checkout.is_some() { None } else { Some(support) },
    };
    let _ = DIRS.set(dirs);
    Ok(())
}

pub fn dirs() -> &'static Dirs {
    DIRS.get().expect("paths::init runs during setup")
}
