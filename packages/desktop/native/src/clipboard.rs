use arboard::Clipboard;
use serde_json::Value;
use crate::protocol::DesktopError;

pub fn dispatch(command: &str, payload: &Value) -> Result<Value, DesktopError> {
    let mut clipboard = Clipboard::new().map_err(error)?;
    match command {
        "readText" => clipboard.get_text().map(Value::String).map_err(error),
        "writeText" => {
            let text = payload.get("text").and_then(Value::as_str).ok_or_else(|| DesktopError::invalid("Missing clipboard text."))?;
            clipboard.set_text(text.to_owned()).map(|_| Value::Null).map_err(error)
        }
        "clear" => clipboard.clear().map(|_| Value::Null).map_err(error),
        _ => Err(DesktopError::new("OS_DESKTOP_UNKNOWN_COMMAND", format!("Unknown clipboard command {command}."))),
    }
}

fn error(error: arboard::Error) -> DesktopError {
    DesktopError::new("OS_DESKTOP_CLIPBOARD_ERROR", error.to_string())
}
