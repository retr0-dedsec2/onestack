use std::{collections::HashSet, fs, path::{Component, Path, PathBuf}};
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
        Self { title: default_title(), width: default_width(), height: default_height(), resizable: true, transparent: false, decorations: true, always_on_top: false, fullscreen: false }
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FileSystemPolicy {
    #[serde(default)] pub read: Vec<String>,
    #[serde(default)] pub write: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdaterConfig { pub endpoint: Option<String> }

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DesktopManifest {
    #[serde(default)] pub app: AppConfig,
    #[serde(default)] pub window: WindowConfig,
    #[serde(default)] pub permissions: Vec<String>,
    #[serde(default)] pub filesystem: FileSystemPolicy,
    #[serde(default)] pub updater: UpdaterConfig,
    pub url: Option<String>,
    pub assets: Option<String>,
    #[serde(skip)] pub manifest_dir: PathBuf,
}

impl DesktopManifest {
    pub fn load() -> Self {
        let candidates = manifest_candidates();
        for path in candidates {
            if let Ok(source) = fs::read_to_string(&path) {
                if let Ok(mut manifest) = serde_json::from_str::<Self>(&source) {
                    manifest.manifest_dir = path.parent().unwrap_or(Path::new(".")).to_path_buf();
                    return manifest;
                }
            }
        }
        Self::default()
    }

    pub fn capabilities(&self) -> HashSet<String> { self.permissions.iter().cloned().collect() }

    pub fn asset_index(&self) -> Option<PathBuf> {
        let assets = self.assets.as_deref()?;
        let direct = self.manifest_dir.join(assets).join("index.html");
        if direct.exists() { return Some(direct); }
        let sibling = self.manifest_dir.parent().unwrap_or(&self.manifest_dir).join(assets).join("index.html");
        if sibling.exists() { return Some(sibling); }
        None
    }

    pub fn resolve_scope(&self, scope: &str) -> Option<PathBuf> {
        match scope {
            "$home" => dirs::home_dir(), "$documents" => dirs::document_dir(), "$downloads" => dirs::download_dir(),
            "$desktop" => dirs::desktop_dir(), "$appData" => dirs::data_local_dir(), "$cache" => dirs::cache_dir(),
            "$temp" => Some(std::env::temp_dir()), other => Some(PathBuf::from(other)),
        }
    }

    pub fn is_path_allowed(&self, path: &Path, write: bool) -> bool {
        let scopes = if write { &self.filesystem.write } else { &self.filesystem.read };
        if scopes.iter().any(|scope| scope == "*") { return safe_path(path).is_some(); }
        let Some(candidate) = safe_path(path) else { return false; };
        scopes.iter().filter_map(|scope| self.resolve_scope(scope)).filter_map(|base| safe_path(&base)).any(|base| candidate.starts_with(base))
    }
}

fn manifest_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(path) = std::env::var_os("ONESTACK_DESKTOP_MANIFEST") { candidates.push(PathBuf::from(path)); }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join(".onestack/desktop.json"));
            candidates.push(dir.join("../Resources/.onestack/desktop.json"));
        }
    }
    candidates.push(PathBuf::from(".onestack/desktop.json"));
    candidates
}

fn safe_path(path: &Path) -> Option<PathBuf> {
    let absolute = if path.is_absolute() { path.to_path_buf() } else { std::env::current_dir().ok()?.join(path) };
    if absolute.components().any(|component| matches!(component, Component::ParentDir)) { return None; }
    if absolute.exists() { return absolute.canonicalize().ok(); }
    let mut existing = absolute.clone();
    let mut missing = Vec::new();
    while !existing.exists() {
        let name = existing.file_name()?.to_owned();
        missing.push(name);
        if !existing.pop() { return None; }
    }
    let mut resolved = existing.canonicalize().ok()?;
    for name in missing.into_iter().rev() { resolved.push(name); }
    Some(resolved)
}
