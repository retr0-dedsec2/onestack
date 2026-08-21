use std::{fs, path::{Path, PathBuf}, time::UNIX_EPOCH};
use serde_json::{json, Value};
use crate::{config::DesktopManifest, protocol::DesktopError};

fn path_from(payload: &Value, key: &str) -> Result<PathBuf, DesktopError> {
    payload.get(key).and_then(Value::as_str).map(PathBuf::from)
        .ok_or_else(|| DesktopError::invalid(format!("Missing string field {key}.")))
}

fn require_path(manifest: &DesktopManifest, path: &Path, write: bool) -> Result<(), DesktopError> {
    let capability = if write { "filesystem.write" } else { "filesystem.read" };
    if !manifest.permissions.iter().any(|item| item == capability) {
        return Err(DesktopError::denied(capability));
    }
    if !manifest.is_path_allowed(path, write) {
        return Err(DesktopError::new("OS_DESKTOP_PATH_DENIED", format!("Path {} is outside the configured filesystem scopes.", path.display())));
    }
    Ok(())
}

pub fn dispatch(command: &str, payload: &Value, manifest: &DesktopManifest) -> Result<Value, DesktopError> {
    match command {
        "path" => {
            let kind = payload.get("kind").and_then(Value::as_str).ok_or_else(|| DesktopError::invalid("Missing path kind."))?;
            let path = manifest.resolve_scope(match kind {
                "home" => "$home", "documents" => "$documents", "downloads" => "$downloads",
                "desktop" => "$desktop", "appData" => "$appData", "cache" => "$cache", "temp" => "$temp",
                _ => return Err(DesktopError::invalid("Unknown portable path kind.")),
            }).ok_or_else(|| DesktopError::new("OS_DESKTOP_PATH_UNAVAILABLE", format!("The {kind} directory is not available.")))?;
            Ok(json!(path.to_string_lossy()))
        }
        "readText" => {
            let path = path_from(payload, "path")?; require_path(manifest, &path, false)?;
            fs::read_to_string(path).map(Value::String).map_err(io_error)
        }
        "writeText" => {
            let path = path_from(payload, "path")?; require_path(manifest, &path, true)?;
            let content = payload.get("content").and_then(Value::as_str).ok_or_else(|| DesktopError::invalid("Missing content."))?;
            if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(io_error)?; }
            fs::write(path, content).map(|_| Value::Null).map_err(io_error)
        }
        "readBinary" => {
            let path = path_from(payload, "path")?; require_path(manifest, &path, false)?;
            fs::read(path).map(|bytes| json!(bytes)).map_err(io_error)
        }
        "writeBinary" => {
            let path = path_from(payload, "path")?; require_path(manifest, &path, true)?;
            let content: Vec<u8> = serde_json::from_value(payload.get("content").cloned().unwrap_or_default())
                .map_err(|error| DesktopError::invalid(error.to_string()))?;
            if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(io_error)?; }
            fs::write(path, content).map(|_| Value::Null).map_err(io_error)
        }
        "exists" => {
            let path = path_from(payload, "path")?; require_path(manifest, &path, false)?;
            Ok(json!(path.exists()))
        }
        "stat" => {
            let path = path_from(payload, "path")?; require_path(manifest, &path, false)?;
            let metadata = fs::metadata(&path).map_err(io_error)?;
            let modified = metadata.modified().ok().and_then(|time| time.duration_since(UNIX_EPOCH).ok()).map(|value| value.as_millis() as u64);
            Ok(json!({"path": path.to_string_lossy(), "size": metadata.len(), "isFile": metadata.is_file(), "isDirectory": metadata.is_dir(), "modifiedMs": modified}))
        }
        "mkdir" => {
            let path = path_from(payload, "path")?; require_path(manifest, &path, true)?;
            if payload.get("recursive").and_then(Value::as_bool).unwrap_or(true) { fs::create_dir_all(path) } else { fs::create_dir(path) }
                .map(|_| Value::Null).map_err(io_error)
        }
        "remove" => {
            let path = path_from(payload, "path")?; require_path(manifest, &path, true)?;
            if path.is_dir() {
                if payload.get("recursive").and_then(Value::as_bool).unwrap_or(false) { fs::remove_dir_all(path) } else { fs::remove_dir(path) }
            } else { fs::remove_file(path) }.map(|_| Value::Null).map_err(io_error)
        }
        "rename" => {
            let from = path_from(payload, "from")?; let to = path_from(payload, "to")?;
            require_path(manifest, &from, true)?; require_path(manifest, &to, true)?;
            fs::rename(from, to).map(|_| Value::Null).map_err(io_error)
        }
        "copy" => {
            let from = path_from(payload, "from")?; let to = path_from(payload, "to")?;
            require_path(manifest, &from, false)?; require_path(manifest, &to, true)?;
            fs::copy(from, to).map(|_| Value::Null).map_err(io_error)
        }
        "readDir" => {
            let path = path_from(payload, "path")?; require_path(manifest, &path, false)?;
            let entries = fs::read_dir(path).map_err(io_error)?.filter_map(Result::ok).map(|entry| {
                let metadata = entry.metadata().ok();
                json!({"name": entry.file_name().to_string_lossy(), "path": entry.path().to_string_lossy(), "isFile": metadata.as_ref().map(|m| m.is_file()).unwrap_or(false), "isDirectory": metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false)})
            }).collect::<Vec<_>>();
            Ok(Value::Array(entries))
        }
        _ => Err(DesktopError::new("OS_DESKTOP_UNKNOWN_COMMAND", format!("Unknown filesystem command {command}."))),
    }
}

fn io_error(error: std::io::Error) -> DesktopError {
    DesktopError::new("OS_DESKTOP_IO_ERROR", error.to_string())
}
