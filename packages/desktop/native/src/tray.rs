use std::collections::HashMap;
use serde::Deserialize;
use serde_json::Value;
use tray_icon::{Icon, TrayIcon, TrayIconBuilder, menu::{Menu, MenuEvent, MenuId, MenuItem, PredefinedMenuItem}};
use crate::protocol::DesktopError;

pub struct AppTray {
    pub id: String,
    pub icon: TrayIcon,
    pub menu: Menu,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
enum MenuEntry {
    Separator { r#type: String },
    Item { label: String, action: String, #[serde(default = "default_true")] enabled: bool },
}
fn default_true() -> bool { true }

pub fn create(id: String, payload: &Value, actions: &mut HashMap<MenuId, (String, String)>) -> Result<AppTray, DesktopError> {
    let menu = Menu::new();
    apply_menu(&menu, &id, payload.get("menu"), actions)?;
    let mut rgba = Vec::with_capacity(16 * 16 * 4);
    for y in 0..16 { for x in 0..16 {
        let active = x > 2 && x < 13 && y > 2 && y < 13;
        rgba.extend_from_slice(if active { &[25, 25, 28, 255] } else { &[0, 0, 0, 0] });
    }}
    let icon = Icon::from_rgba(rgba, 16, 16).map_err(|e| DesktopError::new("OS_DESKTOP_TRAY_ERROR", e.to_string()))?;
    let mut builder = TrayIconBuilder::new().with_id(id.clone()).with_menu(Box::new(menu.clone())).with_icon(icon);
    if let Some(tooltip) = payload.get("tooltip").and_then(Value::as_str) { builder = builder.with_tooltip(tooltip); }
    if let Some(title) = payload.get("title").and_then(Value::as_str) { builder = builder.with_title(title); }
    let tray = builder.build().map_err(|e| DesktopError::new("OS_DESKTOP_TRAY_ERROR", e.to_string()))?;
    Ok(AppTray { id, icon: tray, menu })
}

pub fn set_menu(tray: &AppTray, payload: &Value, actions: &mut HashMap<MenuId, (String, String)>) -> Result<(), DesktopError> {
    while !tray.menu.items().is_empty() { tray.menu.remove_at(0); }
    apply_menu(&tray.menu, &tray.id, payload.get("menu"), actions)
}

pub fn set_tooltip(tray: &AppTray, payload: &Value) -> Result<(), DesktopError> {
    let tooltip = payload.get("tooltip").and_then(Value::as_str).unwrap_or("");
    tray.icon.set_tooltip(Some(tooltip)).map_err(|e| DesktopError::new("OS_DESKTOP_TRAY_ERROR", e.to_string()))
}

fn apply_menu(menu: &Menu, tray_id: &str, raw: Option<&Value>, actions: &mut HashMap<MenuId, (String, String)>) -> Result<(), DesktopError> {
    actions.retain(|_, (id, _)| id != tray_id);
    let entries: Vec<MenuEntry> = raw.cloned().map(serde_json::from_value).transpose().map_err(|e| DesktopError::invalid(e.to_string()))?.unwrap_or_default();
    for entry in entries {
        match entry {
            MenuEntry::Separator { .. } => menu.append(&PredefinedMenuItem::separator()),
            MenuEntry::Item { label, action, enabled } => {
                let menu_id = MenuId(format!("onestack:{tray_id}:{action}"));
                let item = MenuItem::with_id(menu_id.clone(), label, enabled, None);
                actions.insert(menu_id, (tray_id.to_owned(), action));
                menu.append(&item)
            }
        }.map_err(|e| DesktopError::new("OS_DESKTOP_TRAY_ERROR", e.to_string()))?;
    }
    Ok(())
}

pub fn next_action(actions: &HashMap<MenuId, (String, String)>) -> Option<(String, String)> {
    MenuEvent::receiver().try_recv().ok().and_then(|event| actions.get(&event.id).cloned())
}
