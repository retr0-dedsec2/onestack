use std::{borrow::Cow, path::{Path, Component}};
use wry::http::{Request, Response};

/// Serve only files beneath the packaged asset root. Navigation routes fall back to index.html.
pub fn response(root: &Path, request: Request<Vec<u8>>) -> Response<Cow<'static, [u8]>> {
    let reply = |status, mime: &str, bytes: Vec<u8>| Response::builder().status(status).header("Content-Type", mime).header("X-Content-Type-Options", "nosniff").body(Cow::Owned(bytes)).unwrap();
    if request.method() != "GET" && request.method() != "HEAD" { return reply(405, "text/plain", b"Method not allowed".to_vec()); }
    let raw = request.uri().path().trim_start_matches('/');
    if raw.starts_with("api/") { return reply(503, "application/json", br#"{"code":"NOT_CONFIGURED","error":"Set the HTTPS backend URL for this application"}"#.to_vec()); }
    if raw.contains('\\') || raw.contains(':') || Path::new(raw).components().any(|c| !matches!(c, Component::Normal(_))) { return reply(400, "text/plain", b"Invalid path".to_vec()); }
    let Ok(root) = root.canonicalize() else { return reply(404, "text/plain", b"Missing assets".to_vec()); };
    let candidate = root.join(if raw.is_empty() { "index.html" } else { raw });
    let path = if candidate.is_file() { candidate } else if Path::new(raw).extension().is_none() { root.join("index.html") } else { return reply(404, "text/plain", b"Not found".to_vec()); };
    let Ok(path) = path.canonicalize() else { return reply(404, "text/plain", b"Not found".to_vec()); };
    if !path.starts_with(&root) { return reply(403, "text/plain", b"Forbidden".to_vec()); }
    let mime = match path.extension().and_then(|s| s.to_str()).unwrap_or("") {
        "html" => "text/html; charset=utf-8", "js" | "mjs" => "text/javascript", "css" => "text/css",
        "json" => "application/json", "svg" => "image/svg+xml", "png" => "image/png", "jpg" | "jpeg" => "image/jpeg", "woff2" => "font/woff2", _ => "application/octet-stream",
    };
    match std::fs::read(path) { Ok(bytes) => reply(200, mime, if request.method() == "HEAD" { vec![] } else { bytes }), Err(_) => reply(404, "text/plain", b"Not found".to_vec()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn routes_and_assets_stay_inside_the_bundle() {
        let root = std::env::temp_dir().join(format!("onestack-assets-{}", std::process::id()));
        std::fs::create_dir_all(root.join("assets")).unwrap();
        std::fs::write(root.join("index.html"), b"app").unwrap();
        std::fs::write(root.join("assets/main.js"), b"console.log('app')").unwrap();
        for path in ["/", "/billing", "/assets/main.js"] {
            let response = response(&root, Request::builder().uri(format!("onestack://localhost{path}")).body(vec![]).unwrap());
            assert_eq!(response.status(), 200);
        }
        let response = response(&root, Request::builder().uri("onestack://localhost/../outside").body(vec![]).unwrap());
        assert_eq!(response.status(), 400);
        std::fs::remove_dir_all(root).unwrap();
    }
}
