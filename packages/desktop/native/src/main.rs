mod clipboard;
mod config;
mod dialog;
mod filesystem;
mod notifications;
mod protocol;
mod shell;
mod tray;
mod updater;

use std::collections::HashMap;
use config::{DesktopManifest, WindowConfig};
use protocol::{DesktopError, DesktopEvent, DesktopRequest, DesktopResponse, PROTOCOL};
use serde_json::{json, Value};
use tao::{dpi::LogicalSize, event::{Event, WindowEvent}, event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy, EventLoopWindowTarget}, window::{Fullscreen, Window, WindowBuilder, WindowId}};
use tray_icon::menu::MenuId;
use url::Url;
use wry::{WebView, WebViewBuilder};

#[derive(Debug, Clone)]
pub(crate) enum HostEvent {
    Ipc { window_id: String, body: String },
    Native { window_id: String, event: DesktopEvent },
}

struct AppWindow { id: String, window: Window, webview: WebView }
struct HostState {
    manifest: DesktopManifest,
    windows: HashMap<String, AppWindow>,
    window_ids: HashMap<WindowId, String>,
    trays: HashMap<String, tray::AppTray>,
    tray_actions: HashMap<MenuId, (String, String)>,
    next_window: u64,
    next_tray: u64,
}

fn main() -> anyhow::Result<()> {
    let manifest = DesktopManifest::load();
    let event_loop = EventLoopBuilder::<HostEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();
    let mut state = HostState { manifest: manifest.clone(), windows: HashMap::new(), window_ids: HashMap::new(), trays: HashMap::new(), tray_actions: HashMap::new(), next_window: 1, next_tray: 0 };
    let main_window = create_window(&event_loop, "main".into(), manifest.window.clone(), initial_url(&manifest), proxy.clone())?;
    state.window_ids.insert(main_window.window.id(), main_window.id.clone()); state.windows.insert(main_window.id.clone(), main_window);

    event_loop.run(move |event, target, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::UserEvent(HostEvent::Ipc { window_id, body }) => handle_ipc(&mut state, target, &proxy, &window_id, &body),
            Event::UserEvent(HostEvent::Native { window_id, event }) => emit_event(&state, &window_id, event),
            Event::MainEventsCleared => {
                while let Some((tray_id, action)) = tray::next_action(&state.tray_actions) {
                    broadcast_event(&state, DesktopEvent { protocol: PROTOCOL, scope: "tray".into(), name: "action".into(), target: Some(tray_id), payload: Some(json!({"action": action})) });
                }
            }
            Event::WindowEvent { window_id, event: WindowEvent::CloseRequested, .. } => if let Some(id) = state.window_ids.get(&window_id).cloned() { emit_event(&state, &id, DesktopEvent { protocol: PROTOCOL, scope: "window".into(), name: "close-requested".into(), target: Some(id.clone()), payload: None }); },
            Event::WindowEvent { window_id, event: WindowEvent::Resized(size), .. } => if let Some(id) = state.window_ids.get(&window_id).cloned() { emit_event(&state, &id, DesktopEvent { protocol: PROTOCOL, scope: "window".into(), name: "resize".into(), target: Some(id.clone()), payload: Some(json!({"width": size.width, "height": size.height})) }); },
            Event::WindowEvent { window_id, event: WindowEvent::Focused(focused), .. } => if let Some(id) = state.window_ids.get(&window_id).cloned() { emit_event(&state, &id, DesktopEvent { protocol: PROTOCOL, scope: "desktop".into(), name: if focused { "focus".into() } else { "blur".into() }, target: Some(id.clone()), payload: None }); },
            Event::WindowEvent { window_id, event: WindowEvent::ThemeChanged(theme), .. } => if let Some(id) = state.window_ids.get(&window_id).cloned() { emit_event(&state, &id, DesktopEvent { protocol: PROTOCOL, scope: "desktop".into(), name: "theme-change".into(), target: Some(id.clone()), payload: Some(json!({"theme": format!("{theme:?}").to_lowercase()})) }); },
            Event::WindowEvent { window_id, event: WindowEvent::Suspended, .. } => if let Some(id) = state.window_ids.get(&window_id).cloned() { emit_event(&state, &id, DesktopEvent { protocol: PROTOCOL, scope: "desktop".into(), name: "suspend".into(), target: Some(id.clone()), payload: None }); },
            Event::WindowEvent { window_id, event: WindowEvent::Resumed, .. } => if let Some(id) = state.window_ids.get(&window_id).cloned() { emit_event(&state, &id, DesktopEvent { protocol: PROTOCOL, scope: "desktop".into(), name: "resume".into(), target: Some(id.clone()), payload: None }); },
            _ => {}
        }
    });
}

fn initial_url(manifest: &DesktopManifest) -> Option<String> {
    if let Some(url) = manifest.url.clone() { return Some(url); }
    manifest.asset_index().and_then(|path| Url::from_file_path(path).ok()).map(|url| url.to_string())
}

fn create_window(target: &EventLoopWindowTarget<HostEvent>, id: String, options: WindowConfig, url: Option<String>, proxy: EventLoopProxy<HostEvent>) -> anyhow::Result<AppWindow> {
    let mut builder = WindowBuilder::new().with_title(options.title.clone()).with_inner_size(LogicalSize::new(options.width, options.height)).with_resizable(options.resizable).with_transparent(options.transparent).with_decorations(options.decorations).with_always_on_top(options.always_on_top);
    if options.fullscreen { builder = builder.with_fullscreen(Some(Fullscreen::Borderless(None))); }
    let window = builder.build(target)?;
    let ipc_id = id.clone(); let init_id = serde_json::to_string(&id)?;
    let mut webview_builder = WebViewBuilder::new().with_initialization_script(format!("globalThis.__ONESTACK_DESKTOP_WINDOW_ID__={init_id};")).with_ipc_handler(move |request| { let _ = proxy.send_event(HostEvent::Ipc { window_id: ipc_id.clone(), body: request.body().clone() }); });
    if let Some(url) = url { webview_builder = webview_builder.with_url(&url); } else { webview_builder = webview_builder.with_html("<!doctype html><meta charset=utf-8><title>OneStack</title><body><h1>OneStack Desktop</h1><p>No production assets or development URL were found.</p></body>"); }
    let webview = webview_builder.build(&window)?;
    Ok(AppWindow { id, window, webview })
}

fn handle_ipc(state: &mut HostState, target: &EventLoopWindowTarget<HostEvent>, proxy: &EventLoopProxy<HostEvent>, window_id: &str, body: &str) {
    let request = match serde_json::from_str::<DesktopRequest>(body) {
        Ok(request) if request.protocol == PROTOCOL => request,
        Ok(request) => { send_response(state, window_id, DesktopResponse::error(request.id, DesktopError::invalid("Unsupported desktop protocol version."))); return; }
        Err(error) => { send_response(state, window_id, DesktopResponse::error("invalid".into(), DesktopError::invalid(error.to_string()))); return; }
    };
    let id = request.id.clone(); let result = dispatch(state, target, proxy, window_id, &request);
    send_response(state, window_id, match result { Ok(value) => DesktopResponse::ok(id, value), Err(error) => DesktopResponse::error(id, error) });
}

fn require(state: &HostState, capability: &str) -> Result<(), DesktopError> {
    if state.manifest.capabilities().contains(capability) { Ok(()) } else { Err(DesktopError::denied(capability)) }
}

fn dispatch(state: &mut HostState, target: &EventLoopWindowTarget<HostEvent>, proxy: &EventLoopProxy<HostEvent>, current_id: &str, request: &DesktopRequest) -> Result<Value, DesktopError> {
    match request.namespace.as_str() {
        "filesystem" => filesystem::dispatch(&request.command, &request.payload, &state.manifest),
        "dialog" => { require(state, if request.command == "saveFile" { "filesystem.write" } else { "filesystem.read" })?; dialog::dispatch(&request.command, &request.payload) }
        "clipboard" => { require(state, if request.command == "readText" { "clipboard.read" } else { "clipboard.write" })?; clipboard::dispatch(&request.command, &request.payload) }
        "notifications" => { require(state, "notifications.show")?; notifications::dispatch(&request.command, &request.payload, proxy, current_id) }
        "shell" => { require(state, if request.command == "openExternal" { "shell.external" } else { "shell.revealFile" })?; shell::dispatch(&request.command, &request.payload) }
        "system" => { require(state, "system.info")?; if request.command != "info" { return Err(DesktopError::new("OS_DESKTOP_UNKNOWN_COMMAND", "Unknown system command.")); } Ok(json!({"os": platform_os(), "arch": platform_arch(), "version": std::env::consts::OS, "appVersion": state.manifest.app.version})) }
        "updater" => { require(state, &format!("updater.{}", request.command))?; updater::dispatch(&request.command, &request.payload, &state.manifest) }
        "window" => dispatch_window(state, target, proxy, current_id, &request.command, &request.payload),
        "tray" => dispatch_tray(state, &request.command, &request.payload),
        _ => Err(DesktopError::new("OS_DESKTOP_UNKNOWN_COMMAND", format!("Unknown desktop namespace {}.", request.namespace))),
    }
}

fn dispatch_tray(state: &mut HostState, command: &str, payload: &Value) -> Result<Value, DesktopError> {
    require(state, "tray.create")?;
    if command == "create" {
        state.next_tray += 1; let id = format!("tray-{}", state.next_tray);
        let app_tray = tray::create(id.clone(), payload, &mut state.tray_actions)?; state.trays.insert(id.clone(), app_tray);
        return Ok(json!({"id": id}));
    }
    let id = payload.get("id").and_then(Value::as_str).ok_or_else(|| DesktopError::invalid("Missing tray id."))?.to_owned();
    if command == "remove" { state.tray_actions.retain(|_, (tray_id, _)| tray_id != &id); state.trays.remove(&id); return Ok(Value::Null); }
    let app_tray = state.trays.get(&id).ok_or_else(|| DesktopError::new("OS_DESKTOP_TRAY_NOT_FOUND", format!("Tray {id} does not exist.")))?;
    match command { "setMenu" => tray::set_menu(app_tray, payload, &mut state.tray_actions)?, "setTooltip" => tray::set_tooltip(app_tray, payload)?, _ => return Err(DesktopError::new("OS_DESKTOP_UNKNOWN_COMMAND", format!("Unknown tray command {command}."))) }
    Ok(Value::Null)
}

fn dispatch_window(state: &mut HostState, target: &EventLoopWindowTarget<HostEvent>, proxy: &EventLoopProxy<HostEvent>, current_id: &str, command: &str, payload: &Value) -> Result<Value, DesktopError> {
    if command == "create" {
        require(state, "window.create")?; state.next_window += 1; let id = format!("window-{}", state.next_window); let defaults = state.manifest.window.clone();
        let options = WindowConfig { title: payload.get("title").and_then(Value::as_str).unwrap_or(&defaults.title).to_owned(), width: payload.get("width").and_then(Value::as_f64).unwrap_or(defaults.width), height: payload.get("height").and_then(Value::as_f64).unwrap_or(defaults.height), resizable: payload.get("resizable").and_then(Value::as_bool).unwrap_or(defaults.resizable), transparent: payload.get("transparent").and_then(Value::as_bool).unwrap_or(defaults.transparent), decorations: payload.get("decorations").and_then(Value::as_bool).unwrap_or(!payload.get("frameless").and_then(Value::as_bool).unwrap_or(false)), always_on_top: payload.get("alwaysOnTop").and_then(Value::as_bool).unwrap_or(false), fullscreen: payload.get("fullscreen").and_then(Value::as_bool).unwrap_or(false) };
        let route = payload.get("route").and_then(Value::as_str).unwrap_or("/"); let base = initial_url(&state.manifest).unwrap_or_else(|| "about:blank".into()); let url = if base.starts_with("http") { Some(format!("{}{}", base.trim_end_matches('/'), route)) } else { Some(base) };
        let app_window = create_window(target, id.clone(), options, url, proxy.clone()).map_err(|e| DesktopError::new("OS_DESKTOP_WINDOW_ERROR", e.to_string()))?;
        state.window_ids.insert(app_window.window.id(), id.clone()); state.windows.insert(id.clone(), app_window); return Ok(json!({"id": id}));
    }
    if command == "list" { return Ok(json!(state.windows.keys().cloned().collect::<Vec<_>>())); }
    require(state, "window.control")?; let id = payload.get("id").and_then(Value::as_str).unwrap_or(current_id).to_owned();
    if command == "closeConfirmed" || command == "close" { if let Some(window) = state.windows.remove(&id) { state.window_ids.remove(&window.window.id()); drop(window); } return Ok(Value::Null); }
    let app = state.windows.get(&id).ok_or_else(|| DesktopError::new("OS_DESKTOP_WINDOW_NOT_FOUND", format!("Window {id} does not exist.")))?;
    match command { "minimize" => app.window.set_minimized(true), "maximize" => app.window.set_maximized(true), "unmaximize" => app.window.set_maximized(false), "show" => app.window.set_visible(true), "hide" => app.window.set_visible(false), "focus" => app.window.set_focus(), "setTitle" => app.window.set_title(payload.get("title").and_then(Value::as_str).unwrap_or("")), "setFullscreen" => app.window.set_fullscreen(if payload.get("fullscreen").and_then(Value::as_bool).unwrap_or(false) { Some(Fullscreen::Borderless(None)) } else { None }), "setAlwaysOnTop" => app.window.set_always_on_top(payload.get("alwaysOnTop").and_then(Value::as_bool).unwrap_or(false)), "setSize" => app.window.set_inner_size(LogicalSize::new(payload.get("width").and_then(Value::as_f64).unwrap_or(800.0), payload.get("height").and_then(Value::as_f64).unwrap_or(600.0))), "center" => center_window(&app.window), _ => return Err(DesktopError::new("OS_DESKTOP_UNKNOWN_COMMAND", format!("Unknown window command {command}."))) }
    Ok(Value::Null)
}

fn center_window(window: &Window) { if let Some(monitor) = window.current_monitor() { let outer = window.outer_size(); let size = monitor.size(); let pos = monitor.position(); window.set_outer_position(tao::dpi::PhysicalPosition::new(pos.x + (size.width.saturating_sub(outer.width) / 2) as i32, pos.y + (size.height.saturating_sub(outer.height) / 2) as i32)); } }
fn send_response(state: &HostState, window_id: &str, response: DesktopResponse) { if let Some(window) = state.windows.get(window_id) { if let Ok(json) = serde_json::to_string(&response) { let _ = window.webview.evaluate_script(&format!("globalThis.__ONESTACK_DESKTOP_RECEIVE__?.({json});")); } } }
fn emit_event(state: &HostState, window_id: &str, event: DesktopEvent) { if let Some(window) = state.windows.get(window_id) { if let Ok(json) = serde_json::to_string(&event) { let _ = window.webview.evaluate_script(&format!("globalThis.__ONESTACK_DESKTOP_EVENT__?.({json});")); } } }
fn broadcast_event(state: &HostState, event: DesktopEvent) { for id in state.windows.keys() { emit_event(state, id, event.clone()); } }
fn platform_os() -> &'static str { match std::env::consts::OS { "windows" => "windows", "macos" => "macos", "linux" => "linux", _ => "unknown" } }
fn platform_arch() -> &'static str { match std::env::consts::ARCH { "x86_64" => "x64", "aarch64" => "arm64", "x86" | "i686" => "x86", _ => "other" } }
