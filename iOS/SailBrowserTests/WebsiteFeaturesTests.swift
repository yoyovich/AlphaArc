import Foundation
import Testing
import WebKit
@testable import SailBrowser

struct WebsiteFeaturesTests {
    @Test func globalAndSitePreferencesCombineWithoutBypassingDisabledJavaScript() {
        var settings = BrowserSettings()
        var site = SiteSettings()
        #expect(WebsiteFeatureOptions(settings: settings, site: site) == .init(necessaryCookies: true, forceDark: true))
        site.allowsForcedDark = false
        #expect(WebsiteFeatureOptions(settings: settings, site: site) == .init(necessaryCookies: true))
        site.allowsCookieAutomation = false
        #expect(WebsiteFeatureOptions(settings: settings, site: site) == .init(keepsCookieBannersVisible: true))
        site = SiteSettings()
        settings.automaticallyHandlesCookies = false
        #expect(WebsiteFeatureOptions(settings: settings, site: site) == .init(forceDark: true))
        settings.forcesDarkWebsites = false
        #expect(WebsiteFeatureOptions(settings: settings, site: site) == .disabled)
        settings.forcesDarkWebsites = true
        settings.automaticallyHandlesCookies = true
        site.allowsJavaScript = false
        #expect(WebsiteFeatureOptions(settings: settings, site: site) == .init(keepsCookieBannersVisible: true))
    }

    @Test func necessaryOnlyModeDoesNotHideTheChoiceBeforeRejectingIt() {
        let all = Set(BlockingCategory.allCases)
        #expect(WebsiteFeatureOptions(necessaryCookies: true).blockingCategories(from: all) == [.ads, .trackers])
        #expect(WebsiteFeatureOptions.disabled.blockingCategories(from: all) == all)
        #expect(WebsiteFeatureOptions(keepsCookieBannersVisible: true).blockingCategories(from: all) == [.ads, .trackers])
        #expect(WebsiteFeatureOptions(necessaryCookies: true).blockingCategories(from: []) == [])
    }

    @Test func newSettingsRoundTripAndOldFilesKeepTheirData() throws {
        var settings = BrowserSettings()
        settings.automaticallyHandlesCookies = false
        settings.forcesDarkWebsites = false
        #expect(try JSONDecoder().decode(BrowserSettings.self, from: JSONEncoder().encode(settings)) == settings)
        let old = Data(#"{"archiveInterval":"sevenDays","zoomByHost":{"example.com":1.5},"blocksAds":false}"#.utf8)
        let migrated = try JSONDecoder().decode(BrowserSettings.self, from: old)
        #expect(migrated.archiveInterval == .sevenDays)
        #expect(migrated.zoomByHost == ["example.com": 1.5])
        #expect(!migrated.blocksAds)
        #expect(migrated.automaticallyHandlesCookies)
        #expect(migrated.forcesDarkWebsites)
    }

    @Test func siteExceptionsRoundTripAndOldSitesStillDecode() throws {
        var site = SiteSettings()
        site.allowsCookieAutomation = false
        site.allowsForcedDark = false
        #expect(try JSONDecoder().decode(SiteSettings.self, from: JSONEncoder().encode(site)) == site)
        let migrated = try JSONDecoder().decode(SiteSettings.self, from: Data(#"{"blocksTrackers":false,"allowsJavaScript":true}"#.utf8))
        #expect(!migrated.blocksTrackers)
        #expect(migrated.allowsCookieAutomation && migrated.allowsForcedDark)
    }

    @Test func privateSiteExceptionsStayInMemory() async throws {
        let directories = AppDirectories.temporary()
        let store = SiteSettingsStore(directories: directories)
        var site = SiteSettings()
        site.allowsForcedDark = false
        site.allowsCookieAutomation = false
        store.set(site, forHost: "private.example", isPrivate: true)
        store.set(site, forHost: "saved.example", isPrivate: false)
        await store.flush()
        #expect(!store.settings(forHost: "private.example", isPrivate: true).allowsForcedDark)
        #expect(store.settings(forHost: "private.example", isPrivate: false).allowsForcedDark)
        let saved = try String(contentsOf: directories.support.appending(path: "site-settings.json"), encoding: .utf8)
        #expect(!saved.contains("private.example"))
        let restored = SiteSettingsStore(directories: directories)
        #expect(restored.settings(forHost: "private.example", isPrivate: true).allowsCookieAutomation)
        #expect(!restored.settings(forHost: "saved.example", isPrivate: false).allowsCookieAutomation)
        store.endPrivateSession()
        #expect(store.settings(forHost: "private.example", isPrivate: true).allowsForcedDark)
    }

    @Test func scriptChangesAreIdempotentAndPreserveOtherFeatures() {
        let blocker = ContentBlocker(categories: [])
        let controller = WKUserContentController()
        blocker.attach(controller)
        let other = WKUserScript(source: "void 0;", injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        controller.addUserScript(other)
        let options = WebsiteFeatureOptions(necessaryCookies: true, forceDark: true)
        blocker.setBlocking(false, host: "example.com", options: options, on: controller)
        #expect(controller.userScripts.count == 3)
        #expect(controller.userScripts.contains { $0 === other })
        #expect(controller.userScripts.filter { $0 !== other }.allSatisfy {
            $0.injectionTime == .atDocumentStart && !$0.isForMainFrameOnly
        })
        blocker.setBlocking(false, host: "example.com", options: options, on: controller)
        #expect(controller.userScripts.count == 3)
        blocker.setBlocking(false, host: "example.com", options: .disabled, on: controller)
        #expect(controller.userScripts.count == 1)
        #expect(controller.userScripts.first === other)
    }
}
