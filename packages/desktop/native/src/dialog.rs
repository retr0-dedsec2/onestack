use rfd::FileDialog;
use serde_json::{json, Value};
use crate::protocol::DesktopError;

fn apply_options(mut dialog: FileDialog, payload: &Value) -> FileDialog {
    if let Some(directory) = payload.get("directory").and_then(Value::as_str) { dialog = dialog.set_directory(directory); }
    if let Some(name) = payload.get("defaultName").and_then(Value::as_str) { dialog = dialog.set_file_name(name); }
    if let Some(filters) = payload.get("filters").and_then(Value::as_array) {
        for filter in filters {
            if let (Some(name), Some(exts)) = (filter.get("name").and_then(Value::as_str), filter.get("extensions").and_then(Value::as_array)) {
                let extensions = exts.iter().filter_map(Value::as_str).collect::<Vec<_>>();
                dialog = dialog.add_filter(name, &extensions);
            }
        }
    }
    dialog
}

pub fn dispatch(command: &str, payload: &Value) -> Result<Value, DesktopError> {
    let dialog = apply_options(FileDialog::new(), payload);
    match command {
        "openFile" => {
            if payload.get("multiple").and_then(Value::as_bool).unwrap_or(false) {
                Ok(dialog.pick_files().map(|paths| json!(paths.iter().map(|p| p.to_string_lossy()).collect::<Vec<_>>())).unwrap_or(Value::Null))
            } else {
                Ok(dialog.pick_file().map(|path| json!([path.to_string_lossy()])).unwrap_or(Value::Null))
            }
        }
        "openDirectory" => Ok(dialog.pick_folder().map(|path| json!(path.to_string_lossy())).unwrap_or(Value::Null)),
        "saveFile" => Ok(dialog.save_file().map(|path| json!(path.to_string_lossy())).unwrap_or(Value::Null)),
        _ => Err(DesktopError::new("OS_DESKTOP_UNKNOWN_COMMAND", format!("Unknown dialog command {command}."))),
    }
}
