import Foundation
import WebKit

// Pure policy, shared by navigation, settings changes and persistence tests.
nonisolated struct WebsiteFeatureOptions: Equatable, Sendable {
    var necessaryCookies = false
    var forceDark = false
    var keepsCookieBannersVisible = false

    func blockingCategories(from categories: Set<BlockingCategory>) -> Set<BlockingCategory> {
        keepsCookieBannersVisible ? categories.subtracting([.cookieBanners]) : categories
    }

    static let disabled = WebsiteFeatureOptions()

    init(necessaryCookies: Bool = false, forceDark: Bool = false, keepsCookieBannersVisible: Bool = false) {
        self.necessaryCookies = necessaryCookies
        self.forceDark = forceDark
        self.keepsCookieBannersVisible = keepsCookieBannersVisible || necessaryCookies
    }

    init(settings: BrowserSettings, site: SiteSettings) {
        // A site exception in global necessary-only mode means manual choice, never a hidden banner.
        keepsCookieBannersVisible = settings.automaticallyHandlesCookies
        necessaryCookies = settings.automaticallyHandlesCookies && site.allowsCookieAutomation && site.allowsJavaScript
        forceDark = settings.forcesDarkWebsites && site.allowsForcedDark && site.allowsJavaScript
    }
}

enum WebsiteFeatures {
    static let world = WKContentWorld.world(name: "SailWebsiteFeatures")
    private static let consent = source("necessary-cookies")
    private static let dark = source("force-dark")

    static func scripts(for options: WebsiteFeatureOptions) -> [WKUserScript] {
        var scripts: [WKUserScript] = []
        for (enabled, source) in [(options.necessaryCookies, consent), (options.forceDark, dark)] where enabled {
            scripts.append(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: false, in: world))
        }
        return scripts
    }

    static func synchronize(_ webView: WKWebView, frame: WKFrameInfo, options: WebsiteFeatureOptions) {
        let source = (options.necessaryCookies ? consent : "globalThis.__sailNecessaryCookies?.stop();")
            + "\n" + (options.forceDark ? dark : "globalThis.__sailForceDark?.stop();")
        webView.evaluateJavaScript(source, in: frame, in: world) { _ in }
    }

    private static func source(_ name: String) -> String {
        guard let url = Bundle.main.url(forResource: name, withExtension: "js"),
              let text = try? String(contentsOf: url, encoding: .utf8)
        else { preconditionFailure("Missing website feature resource: \(name).js") }
        return text
    }
}
