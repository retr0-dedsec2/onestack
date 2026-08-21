use notify_rust::Notification;
use serde_json::{json, Value};
use tao::event_loop::EventLoopProxy;
use crate::{protocol::{DesktopError, DesktopEvent, PROTOCOL}, HostEvent};

pub fn dispatch(command: &str, payload: &Value, proxy: &EventLoopProxy<HostEvent>, window_id: &str) -> Result<Value, DesktopError> {
    match command {
        "show" => {
            let title = payload.get("title").and_then(Value::as_str).ok_or_else(|| DesktopError::invalid("Missing notification title."))?;
            let mut notification = Notification::new();
            notification.summary(title).action("default", "Open");
            if let Some(body) = payload.get("body").and_then(Value::as_str) { notification.body(body); }
            if let Some(icon) = payload.get("icon").and_then(Value::as_str) { notification.icon(icon); }
            if let Some(timeout) = payload.get("timeoutMs").and_then(Value::as_i64) { notification.timeout(timeout as i32); }
            let handle = notification.show().map_err(|error| DesktopError::new("OS_DESKTOP_NOTIFICATION_ERROR", error.to_string()))?;
            let notification_id = handle.id().to_string();
            let event_id = notification_id.clone();
            let proxy = proxy.clone(); let target = window_id.to_owned();
            std::thread::spawn(move || {
                handle.wait_for_action(|action| {
                    if action != "__closed" {
                        let _ = proxy.send_event(HostEvent::Native {
                            window_id: target,
                            event: DesktopEvent { protocol: PROTOCOL, scope: "notification".into(), name: "click".into(), target: Some(event_id), payload: Some(json!({"action": action})) },
                        });
                    }
                });
            });
            Ok(json!({"id": notification_id}))
        }
        _ => Err(DesktopError::new("OS_DESKTOP_UNKNOWN_COMMAND", format!("Unknown notifications command {command}."))),
    }
}
