import Cocoa
import WebKit
import Network

// The fixed loopback origin preserves IndexedDB across launches and upgrades.
// Nothing is exposed on Wi-Fi; only bundled static resources are served.
final class LocalServer {
    static let port: UInt16 = 38471
    private let root: URL
    private let queue = DispatchQueue(label: "pt.boschrange.local-http")
    private var listener: NWListener?

    init(root: URL) { self.root = root.standardizedFileURL.resolvingSymlinksInPath() }

    func start(ready: @escaping (Result<Void, Error>) -> Void) throws {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: Self.port)!)
        let listener = try NWListener(using: parameters)
        self.listener = listener
        var reported = false
        listener.stateUpdateHandler = { state in
            switch state {
            case .ready:
                if !reported { reported = true; DispatchQueue.main.async { ready(.success(())) } }
            case .failed(let error):
                if !reported { reported = true; DispatchQueue.main.async { ready(.failure(error)) } }
            default: break
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            guard let self = self else { connection.cancel(); return }
            connection.start(queue: self.queue)
            self.receive(connection, accumulated: Data())
        }
        listener.start(queue: queue)
    }

    private func receive(_ connection: NWConnection, accumulated: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] data, _, complete, error in
            guard let self = self else { connection.cancel(); return }
            var request = accumulated
            if let data = data { request.append(data) }
            if request.count > 16384 { self.respond(connection, status: "431 Request Header Fields Too Large"); return }
            if let text = String(data: request, encoding: .utf8), text.contains("\r\n\r\n") {
                self.handle(connection, request: text)
            } else if complete || error != nil {
                connection.cancel()
            } else {
                self.receive(connection, accumulated: request)
            }
        }
    }

    private func handle(_ connection: NWConnection, request: String) {
        let lines = request.components(separatedBy: "\r\n")
        let parts = (lines.first ?? "").split(separator: " ")
        guard parts.count == 3, parts[0] == "GET" || parts[0] == "HEAD" else {
            respond(connection, status: "405 Method Not Allowed"); return
        }
        // Reject DNS rebinding and absolute request targets.
        let host = lines.dropFirst().first { $0.lowercased().hasPrefix("host:") }?
            .dropFirst(5).trimmingCharacters(in: .whitespaces).lowercased()
        guard host == "127.0.0.1:\(Self.port)", parts[1].hasPrefix("/") else {
            respond(connection, status: "403 Forbidden"); return
        }
        let rawPath = String(parts[1]).components(separatedBy: "?")[0]
        guard let path = rawPath.removingPercentEncoding,
              !path.contains("\0"), !path.contains("\\"),
              !path.split(separator: "/").contains("..") else {
            respond(connection, status: "403 Forbidden"); return
        }
        let relative = path == "/" ? "index.html" : String(path.dropFirst())
        let file = root.appendingPathComponent(relative).standardizedFileURL.resolvingSymlinksInPath()
        guard file.path.hasPrefix(root.path + "/"),
              let bytes = try? Data(contentsOf: file) else {
            respond(connection, status: "404 Not Found"); return
        }
        let types = ["html": "text/html; charset=utf-8", "js": "application/javascript; charset=utf-8",
                     "css": "text/css; charset=utf-8", "svg": "image/svg+xml", "png": "image/png",
                     "json": "application/json", "webmanifest": "application/manifest+json"]
        respond(connection, status: "200 OK", body: bytes,
                mime: types[file.pathExtension] ?? "application/octet-stream", head: parts[0] == "HEAD")
    }

    private func respond(_ connection: NWConnection, status: String, body: Data = Data(), mime: String = "text/plain", head: Bool = false) {
        let headers = "HTTP/1.1 \(status)\r\nContent-Type: \(mime)\r\nContent-Length: \(body.count)\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n"
        var response = Data(headers.utf8)
        if !head { response.append(body) }
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var server: LocalServer!

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        installMenus()
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 860),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Bosch Range Lab 3.0"
        window.minSize = NSSize(width: 390, height: 650)
        window.contentView = webView
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        guard let root = Bundle.main.resourceURL?.appendingPathComponent("web") else {
            fail("Não foi possível encontrar os recursos da aplicação."); return
        }
        do {
            server = LocalServer(root: root)
            try server.start { [weak self] result in
                switch result {
                case .success:
                    self?.webView.load(URLRequest(url: URL(string: "http://127.0.0.1:\(LocalServer.port)/")!))
                case .failure(let error):
                    self?.fail("Não foi possível iniciar o serviço local. Feche outras cópias da aplicação. \(error.localizedDescription)")
                }
            }
        } catch { fail(error.localizedDescription) }
    }

    private func installMenus() {
        let menu = NSMenu()
        let appItem = NSMenuItem(title: "Bosch Range Lab", action: nil, keyEquivalent: "")
        menu.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Acerca do Bosch Range Lab", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Sair do Bosch Range Lab", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        let editItem = NSMenuItem(title: "Editar", action: nil, keyEquivalent: "")
        let editMenu = NSMenu(title: "Editar")
        for (title, action, key) in [("Desfazer", "undo:", "z"), ("Cortar", "cut:", "x"), ("Copiar", "copy:", "c"), ("Colar", "paste:", "v"), ("Selecionar tudo", "selectAll:", "a")] {
            editMenu.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        editItem.submenu = editMenu
        menu.addItem(editItem)
        NSApp.mainMenu = menu
    }

    private func fail(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "Bosch Range Lab"
        alert.informativeText = message
        alert.alertStyle = .critical
        alert.runModal()
        NSApp.terminate(nil)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    private func isLocal(_ url: URL) -> Bool {
        url.scheme == "http" && url.host == "127.0.0.1" && url.port == Int(LocalServer.port)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if action.shouldPerformDownload && (isLocal(url) || url.scheme == "blob") {
            decisionHandler(.download); return
        }
        if isLocal(url) { decisionHandler(.allow); return }
        if action.navigationType == .linkActivated && ["https", "http"].contains(url.scheme ?? "") {
            NSWorkspace.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, ["https", "http"].contains(url.scheme ?? ""), !isLocal(url) {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.urls : nil) }
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = URL(fileURLWithPath: suggestedFilename).lastPathComponent
        panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.url : nil) }
    }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.run()
