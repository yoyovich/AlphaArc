import WebKit

// A restored back/forward-cache document keeps its JavaScript state. Ask native policy again in that exact
// frame, so settings changed since it was visited also apply to cached pages and embedded frames.
final class WebsiteFeatureSync: NSObject, WKScriptMessageHandler {
    static let handlerName = "sailFeatureRestore"
    static let script = WKUserScript(
        source: """
            addEventListener('pageshow', event => {
              if (event.persisted) window.webkit.messageHandlers.\(handlerName).postMessage('restore');
            });
            """,
        injectionTime: .atDocumentStart, forMainFrameOnly: false, in: WebsiteFeatures.world)

    var options: (WebTabController, String) -> WebsiteFeatureOptions = { _, _ in .disabled }
    private let controllers = NSMapTable<WKWebView, WebTabController>.weakToWeakObjects()

    func install(on content: WKUserContentController) {
        content.addUserScript(Self.script)
        content.add(self, contentWorld: WebsiteFeatures.world, name: Self.handlerName)
    }

    func route(_ controller: WebTabController) {
        controllers.setObject(controller, forKey: controller.webView)
    }

    func userContentController(_ content: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.body as? String == "restore", let webView = message.webView,
              let controller = controllers.object(forKey: webView) else { return }
        let host = message.frameInfo.securityOrigin.host
        WebsiteFeatures.synchronize(webView, frame: message.frameInfo, options: options(controller, host))
    }
}
