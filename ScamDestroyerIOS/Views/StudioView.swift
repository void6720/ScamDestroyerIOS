import SwiftUI
import WebKit

/// Studio tab — the playground, counterpart of the Android tab.
/// Same isolation rules: a dedicated WKWebView that serves ONLY the bundled
/// assets through a custom scheme (playground://), everything else refused.
/// The page runs Three.js + a Lua runtime (Wasmoon WASM, Fengari fallback)
/// with the Roblox-style shim — standard Lua core, not full Luau.
struct StudioView: View {
    @State private var consoleLines: [String] = []

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                PlaygroundWebView { line in
                    consoleLines.append(line)
                    if consoleLines.count > 30 { consoleLines.removeFirst() }
                }
                consoleStrip
            }
            .navigationTitle("Studio")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var consoleStrip: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 2) {
                ForEach(Array(consoleLines.enumerated()), id: \.offset) { _, line in
                    Text(line).font(.caption2.monospaced())
                        .foregroundStyle(.green)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(8)
        }
        .frame(maxHeight: 84)
        .background(.black.opacity(0.85))
    }
}

/// WKWebView locked to the bundled playground assets via a custom scheme
/// handler — the iOS equivalent of Android's PlaygroundAssetClient.
struct PlaygroundWebView: UIViewRepresentable {
    var onLog: (String) -> Void

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(PlaygroundSchemeHandler(), forURLScheme: "playground")
        let content = WKUserContentController()
        content.add(context.coordinator, name: "log")
        config.userContentController = content
        let web = WKWebView(frame: .zero, configuration: config)
        web.load(URLRequest(url: URL(string: "playground://local/index.html")!))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(onLog: onLog) }

    final class Coordinator: NSObject, WKScriptMessageHandler {
        let onLog: (String) -> Void
        init(onLog: @escaping (String) -> Void) { self.onLog = onLog }
        func userContentController(_ controller: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            if let text = message.body as? String { onLog(text) }
        }
    }
}

/// Serves files from the app bundle's `playground` folder and nothing else.
/// Mirrors the Android interceptor: unknown hosts and paths get an error,
/// never the network.
final class PlaygroundSchemeHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, url.host == "local" else {
            task.didFailWithError(URLError(.resourceUnavailable)); return
        }
        let name = url.lastPathComponent
        let ext = url.pathExtension
        guard let file = Bundle.main.url(forResource: name, withExtension: ext,
                                         subdirectory: "playground"),
              let data = try? Data(contentsOf: file) else {
            task.didFailWithError(URLError(.fileDoesNotExist)); return
        }
        let mime = ["html": "text/html", "js": "text/javascript",
                    "wasm": "application/wasm", "css": "text/css"][ext] ?? "application/octet-stream"
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": mime,
                                                      "Content-Length": "\(data.count)"])!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
