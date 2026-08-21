use std::path::PathBuf;
use serde_json::Value;
use crate::protocol::DesktopError;

pub fn dispatch(command: &str, payload: &Value) -> Result<Value, DesktopError> {
    match command {
        "openExternal" => {
            let url = payload.get("url").and_then(Value::as_str).ok_or_else(|| DesktopError::invalid("Missing URL."))?;
            if !(url.starts_with("https://") || url.starts_with("http://") || url.starts_with("mailto:")) {
                return Err(DesktopError::new("OS_DESKTOP_UNSAFE_URL", "Only http, https and mailto URLs are allowed by shell.openExternal."));
            }
            open::that(url).map(|_| Value::Null).map_err(error)
        }
        "revealFile" => {
            let path = payload.get("path").and_then(Value::as_str).map(PathBuf::from).ok_or_else(|| DesktopError::invalid("Missing path."))?;
            let target = path.parent().unwrap_or(path.as_path());
            open::that(target).map(|_| Value::Null).map_err(error)
        }
        _ => Err(DesktopError::new("OS_DESKTOP_UNKNOWN_COMMAND", format!("Unknown shell command {command}."))),
    }
}

fn error(error: std::io::Error) -> DesktopError {
    DesktopError::new("OS_DESKTOP_SHELL_ERROR", error.to_string())
}
