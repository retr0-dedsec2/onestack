use std::{fs, io::Read, path::PathBuf};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use crate::{config::DesktopManifest, protocol::DesktopError};

pub fn dispatch(command: &str, payload: &Value, manifest: &DesktopManifest) -> Result<Value, DesktopError> {
    match command {
        "check" => {
            let endpoint = payload.get("endpoint").and_then(Value::as_str).or(manifest.updater.endpoint.as_deref())
                .ok_or_else(|| DesktopError::invalid("No updater endpoint configured."))?;
            let body = ureq::get(endpoint).call().map_err(net_error)?.body_mut().read_to_string().map_err(net_error)?;
            let update: Value = serde_json::from_str(&body).map_err(|e| DesktopError::invalid(e.to_string()))?;
            let available = update.get("version").and_then(Value::as_str).map(|version| version != manifest.app.version).unwrap_or(false);
            Ok(json!({"available": available, "currentVersion": manifest.app.version, "update": if available { update } else { Value::Null }}))
        }
        "download" => {
            let update = payload.get("update").ok_or_else(|| DesktopError::invalid("Missing update manifest."))?;
            let url = update.get("url").and_then(Value::as_str).ok_or_else(|| DesktopError::invalid("Missing update URL."))?;
            if !url.starts_with("https://") { return Err(DesktopError::new("OS_DESKTOP_UPDATER_INSECURE_URL", "Updater downloads require HTTPS.")); }
            let mut response = ureq::get(url).call().map_err(net_error)?;
            let mut bytes = Vec::new(); response.body_mut().as_reader().read_to_end(&mut bytes).map_err(net_error)?;
            if let Some(expected) = update.get("sha256").and_then(Value::as_str) {
                let actual = format!("{:x}", Sha256::digest(&bytes));
                if actual.to_lowercase() != expected.to_lowercase() { return Err(DesktopError::new("OS_DESKTOP_UPDATE_HASH_MISMATCH", "Downloaded update SHA-256 does not match the manifest.")); }
            }
            let path = std::env::temp_dir().join(format!("onestack-update-{}", manifest.app.version));
            fs::write(&path, bytes).map_err(|e| DesktopError::new("OS_DESKTOP_IO_ERROR", e.to_string()))?;
            Ok(json!({"path": path.to_string_lossy()}))
        }
        "install" => {
            let path = payload.get("path").and_then(Value::as_str).map(PathBuf::from).ok_or_else(|| DesktopError::invalid("Missing downloaded update path."))?;
            if !path.exists() { return Err(DesktopError::invalid("Downloaded update file does not exist.")); }
            open::that(&path).map_err(|e| DesktopError::new("OS_DESKTOP_UPDATER_INSTALL_ERROR", e.to_string()))?;
            Ok(Value::Null)
        }
        _ => Err(DesktopError::new("OS_DESKTOP_UNKNOWN_COMMAND", format!("Unknown updater command {command}."))),
    }
}

fn net_error<E: std::fmt::Display>(error: E) -> DesktopError {
    DesktopError::new("OS_DESKTOP_NETWORK_ERROR", error.to_string())
}
