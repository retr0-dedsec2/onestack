import UIKit
import WebKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.rootViewController = OneStackController()
        window?.makeKeyAndVisible()
        return true
    }
    func applicationDidBecomeActive(_ application: UIApplication) { (window?.rootViewController as? OneStackController)?.lifecycle("active") }
    func applicationDidEnterBackground(_ application: UIApplication) { (window?.rootViewController as? OneStackController)?.lifecycle("background") }
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        (window?.rootViewController as? OneStackController)?.lifecycle("deepLink", url: url.absoluteString); return true
    }
}

final class OneStackController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, UITextFieldDelegate {
    private var engine: WKWebView!
    private var config: [String: Any] = [:]
    private var callbacks: [ObjectIdentifier: String] = [:]
    private var content: UIView?
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .systemBackground
        do {
            let data = try Data(contentsOf: Bundle.main.url(forResource: "manifest", withExtension: "json")!)
            config = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
            let configuration = WKWebViewConfiguration()
            configuration.userContentController.add(self, name: "onestack")
            engine = WKWebView(frame: .zero, configuration: configuration)
            engine.navigationDelegate = self
            let js = try String(contentsOf: Bundle.main.url(forResource: "app", withExtension: "js")!, encoding: .utf8).replacingOccurrences(of: "</script", with: "<\\/script")
            engine.loadHTMLString("<html><script>\(js)</script></html>", baseURL: URL(string: "https://onestack.invalid/"))
        } catch { showError(error) }
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(action.navigationType == .other ? .allow : .cancel)
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let body = message.body as? [String: Any] else { return }
        do {
            if body["type"] as? String == "render", let node = body["node"] as? [String: Any] {
                callbacks.removeAll()
                let next = try render(node); content?.removeFromSuperview(); content = next
                view.addSubview(next); next.translatesAutoresizingMaskIntoConstraints = false
                NSLayoutConstraint.activate([next.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16), next.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16), next.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16)])
            } else if let request = body["request"] as? [String: Any] { invoke(request) }
        } catch { showError(error) }
    }
    func lifecycle(_ state: String, url: String? = nil) {
        guard engine != nil else { return }
        var detail: [String: Any] = ["state": state]; if let url = url { detail["url"] = url }
        if let data = try? JSONSerialization.data(withJSONObject: detail), let json = String(data: data, encoding: .utf8) { engine.evaluateJavaScript("globalThis.dispatchEvent(new CustomEvent('onestack:lifecycle', {detail:\(json)}))") }
    }
    private func failure(_ message: String) -> NSError { NSError(domain: "OneStack", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    private func showError(_ error: Error) { NSLog("OneStack: %@", error.localizedDescription) }
    private func emit(_ id: String, _ value: Any = NSNull()) {
        guard let data = try? JSONSerialization.data(withJSONObject: [id, value]), let json = String(data: data, encoding: .utf8) else { return }
        engine.evaluateJavaScript("globalThis.__onestackEvent?.(...\(json))")
    }
    private func invoke(_ request: [String: Any]) {
        var response: [String: Any] = ["id": request["id"] ?? ""]
        do {
            let namespace = request["namespace"] as? String ?? "", method = request["method"] as? String ?? ""
            guard (config["permissions"] as? [String: Bool])?[namespace] == true else { throw failure("Capability denied: \(namespace)") }
            let args = request["args"] as? [Any] ?? [], argument = args.first as? String ?? ""
            var value: Any = NSNull()
            switch "\(namespace).\(method)" {
            case "filesystem.read":
                let data = try Data(contentsOf: localFile(argument)); guard data.count <= 1048576 else { throw failure("File too large") }; value = String(data: data, encoding: .utf8) ?? ""
            case "filesystem.write":
                let file = try localFile(argument), contents = args.count > 1 ? args[1] as? String ?? "" : ""
                guard contents.utf8.count <= 1048576 else { throw failure("File too large") }
                try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
                try contents.write(to: file, atomically: true, encoding: .utf8)
            case "filesystem.remove":
                let file = try localFile(argument); if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
            case "system.info": value = ["platform": "ios", "version": UIDevice.current.systemVersion]
            case "clipboard.write": UIPasteboard.general.string = argument
            case "clipboard.read": value = UIPasteboard.general.string ?? ""
            case "haptics.impact": UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            case "externalUrls.open":
                guard let url = URL(string: argument), ["https", "http"].contains(url.scheme ?? "") else { throw failure("Invalid external URL") }
                UIApplication.shared.open(url)
            case "share.text":
                let sheet = UIActivityViewController(activityItems: [argument], applicationActivities: nil)
                sheet.popoverPresentationController?.sourceView = view
                present(sheet, animated: true)
            default: throw failure("Unsupported native operation: \(namespace).\(method)")
            }
            response["ok"] = true; response["value"] = value
        } catch { response["ok"] = false; response["error"] = ["code": "NATIVE_OPERATION_FAILED", "message": error.localizedDescription] }
        if let data = try? JSONSerialization.data(withJSONObject: response), let json = String(data: data, encoding: .utf8) { engine.evaluateJavaScript("globalThis.__onestackResponse?.(\(json))") }
    }
    private func localFile(_ key: String) throws -> URL {
        guard !key.isEmpty, !key.hasPrefix("/"), !key.contains("\\"), !key.components(separatedBy: "/").contains(where: { $0 == ".." || $0 == "." || $0.isEmpty }) else { throw failure("Invalid file key") }
        let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("OneStack").resolvingSymlinksInPath()
        let file = base.appendingPathComponent(key).resolvingSymlinksInPath()
        guard file.path.hasPrefix(base.path + "/") else { throw failure("File escapes sandbox") }
        return file
    }
    private func text(_ node: [String: Any]) -> String {
        if let value = node["children"] as? String { return value }
        return (node["children"] as? [[String: Any]] ?? []).map { text($0) }.joined()
    }
    private func render(_ node: [String: Any]) throws -> UIView {
        let props = node["props"] as? [String: Any] ?? [:], type = node["type"] as? String ?? ""
        let children = node["children"] as? [[String: Any]] ?? []
        func stack() throws -> UIStackView {
            let result = UIStackView(arrangedSubviews: try children.map { try render($0) })
            result.axis = (props["style"] as? [String: Any])?["flexDirection"] as? String == "row" ? .horizontal : .vertical
            result.spacing = 8; return result
        }
        switch type {
        case "View", "SafeArea": return try stack()
        case "ScrollView":
            let scroll = UIScrollView(), child = try stack(); scroll.addSubview(child); child.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([child.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor), child.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor), child.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor), child.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor), child.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor), scroll.heightAnchor.constraint(equalToConstant: 400)])
            return scroll
        case "Text": let label = UILabel(); label.text = text(node); label.numberOfLines = 0; return label
        case "Pressable":
            let button = UIButton(type: .system); button.setTitle(text(node), for: .normal); button.isEnabled = props["disabled"] as? Bool != true
            let id = props["onPress"] as? String ?? props["onClick"] as? String ?? ""
            button.addAction(UIAction { [weak self] _ in self?.emit(id) }, for: .touchUpInside); return button
        case "TextInput":
            let input = UITextField(); input.text = props["value"] as? String; input.placeholder = props["placeholder"] as? String; input.borderStyle = .roundedRect; input.isSecureTextEntry = props["type"] as? String == "password"
            callbacks[ObjectIdentifier(input)] = props["onInput"] as? String ?? props["onChange"] as? String
            input.addTarget(self, action: #selector(inputChanged(_:)), for: .editingChanged); return input
        case "Switch":
            let toggle = UISwitch(); toggle.isOn = props["checked"] as? Bool ?? false
            callbacks[ObjectIdentifier(toggle)] = props["onChange"] as? String
            toggle.addTarget(self, action: #selector(switchChanged(_:)), for: .valueChanged); return toggle
        case "ActivityIndicator": let indicator = UIActivityIndicatorView(style: .medium); indicator.startAnimating(); return indicator
        case "Image":
            let image = UIImageView(); image.contentMode = .scaleAspectFit; image.accessibilityLabel = props["alt"] as? String; image.heightAnchor.constraint(equalToConstant: 160).isActive = true
            if let src = props["src"] as? String, let url = URL(string: src), url.scheme == "https" {
                URLSession.shared.dataTask(with: url) { [weak image] data, _, _ in if let data = data { DispatchQueue.main.async { image?.image = UIImage(data: data) } } }.resume()
            }; return image
        case "WebView":
            guard config["allowWebViewFallback"] as? Bool == true else { throw failure("WebView fallback disabled") }
            let web = WKWebView(); web.heightAnchor.constraint(equalToConstant: 300).isActive = true
            if let src = props["src"] as? String, let url = URL(string: src), url.scheme == "https" { web.load(URLRequest(url: url)) }
            else { web.loadHTMLString(props["html"] as? String ?? "", baseURL: nil) }
            return web
        default: throw failure("Unsupported native primitive: \(type)")
        }
    }
    @objc private func inputChanged(_ input: UITextField) { if let id = callbacks[ObjectIdentifier(input)] { emit(id, input.text ?? "") } }
    @objc private func switchChanged(_ toggle: UISwitch) { if let id = callbacks[ObjectIdentifier(toggle)] { emit(id, toggle.isOn) } }
}
