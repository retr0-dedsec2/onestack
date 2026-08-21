use std::{collections::HashSet, fs, path::{Path, PathBuf}};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default = "default_name")]
    pub name: String,
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(default = "default_identifier")]
    pub identifier: String,
}

fn default_name() -> String { "OneStack App".into() }
fn default_version() -> String { "0.0.0".into() }
fn default_identifier() -> String { "dev.onestack.app".into() }

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowConfig {
    #[serde(default = "default_title")]
    pub title: String,
    #[serde(default = "default_width")]
    pub width: f64,
    #[serde(default = "default_height")]
    pub height: f64,
    #[serde(default = "default_true")]
    pub resizable: bool,
    #[serde(default)]
    pub transparent: bool,
    #[serde(default = "default_true")]
    pub decorations: bool,
    #[serde(default)]
    pub always_on_top: bool,
    #[serde(default)]
    pub fullscreen: bool,
}

fn default_title() -> String { "OneStack App".into() }
fn default_width() -> f64 { 1200.0 }
fn default_height() -> f64 { 800.0 }
fn default_true() -> bool { true }

impl Default for WindowConfig {
    fn default() -> Self {
        Self {
            title: default_title(), width: default_width(), height: default_height(),
            resizable: true, transparent: false, decorations: true,
            always_on_top: false, fullscreen: false,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FileSystemPolicy {
    #[serde(default)]
    pub read: Vec<String>,
    #[serde(default)]
    pub write: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterConfig {
    pub endpoint: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DesktopManifest {
    #[serde(default)]
    pub app: AppConfig,
    #[serde(default)]
    pub window: WindowConfig,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub filesystem: FileSystemPolicy,
    #[serde(default)]
    pub updater: UpdaterConfig,
    pub url: Option<String>,
    pub assets: Option<String>,
}

impl DesktopManifest {
    pub fn load() -> Self {
        let path = std::env::var_os("ONESTACK_DESKTOP_MANIFEST")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(".onestack/desktop.json"));
        fs::read_to_string(path)
            .ok()
            .and_then(|source| serde_json::from_str(&source).ok())
            .unwrap_or_default()
    }

    pub fn capabilities(&self) -> HashSet<String> {
        self.permissions.iter().cloned().collect()
    }

    pub fn resolve_scope(&self, scope: &str) -> Option<PathBuf> {
        match scope {
            "$home" => dirs::home_dir(),
            "$documents" => dirs::document_dir(),
            "$downloads" => dirs::download_dir(),
            "$desktop" => dirs::desktop_dir(),
            "$appData" => dirs::data_local_dir(),
            "$cache" => dirs::cache_dir(),
            "$temp" => Some(std::env::temp_dir()),
            other => Some(PathBuf::from(other)),
        }
    }

    pub fn is_path_allowed(&self, path: &Path, write: bool) -> bool {
        let scopes = if write { &self.filesystem.write } else { &self.filesystem.read };
        if scopes.iter().any(|scope| scope == "*") { return true; }
        let candidate = if path.is_absolute() { path.to_path_buf() } else {
            std::env::current_dir().unwrap_or_default().join(path)
        };
        let candidate = normalize(&candidate);
        scopes.iter().filter_map(|scope| self.resolve_scope(scope)).any(|base| {
            candidate.starts_with(normalize(&base))
        })
    }
}

fn normalize(path: &Path) -> PathBuf {
    path.components().collect()
}
