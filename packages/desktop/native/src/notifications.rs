use notify_rust::Notification;
use serde_json::{json, Value};
use crate::protocol::DesktopError;

pub fn dispatch(command: &str, payload: &Value) -> Result<Value, DesktopError> {
    match command {
        "show" => {
            let title = payload.get("title").and_then(Value::as_str).ok_or_else(|| DesktopError::invalid("Missing notification title."))?;
            let mut notification = Notification::new();
            notification.summary(title);
            if let Some(body) = payload.get("body").and_then(Value::as_str) { notification.body(body); }
            if let Some(icon) = payload.get("icon").and_then(Value::as_str) { notification.icon(icon); }
            if let Some(timeout) = payload.get("timeoutMs").and_then(Value::as_i64) { notification.timeout(timeout as i32); }
            let handle = notification.show().map_err(|error| DesktopError::new("OS_DESKTOP_NOTIFICATION_ERROR", error.to_string()))?;
            Ok(json!({"id": handle.id().to_string()}))
        }
        _ => Err(DesktopError::new("OS_DESKTOP_UNKNOWN_COMMAND", format!("Unknown notifications command {command}."))),
    }
}
