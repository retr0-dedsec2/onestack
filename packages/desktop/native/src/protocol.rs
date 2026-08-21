use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROTOCOL: &str = "onestack.desktop.v1";

#[derive(Debug, Clone, Deserialize)]
pub struct DesktopRequest {
    pub protocol: String,
    pub id: String,
    pub namespace: String,
    pub command: String,
    #[serde(default)]
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct DesktopError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

impl DesktopError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self { code: code.into(), message: message.into(), details: None }
    }

    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new("OS_DESKTOP_INVALID_PAYLOAD", message)
    }

    pub fn denied(capability: &str) -> Self {
        Self::new(
            "OS_DESKTOP_PERMISSION_DENIED",
            format!("Desktop capability {capability} is not permitted."),
        )
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DesktopResponse {
    pub protocol: &'static str,
    pub id: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<DesktopError>,
}

impl DesktopResponse {
    pub fn ok(id: String, value: Value) -> Self {
        Self { protocol: PROTOCOL, id, ok: true, value: Some(value), error: None }
    }

    pub fn error(id: String, error: DesktopError) -> Self {
        Self { protocol: PROTOCOL, id, ok: false, value: None, error: Some(error) }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DesktopEvent {
    pub protocol: &'static str,
    pub scope: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
}
