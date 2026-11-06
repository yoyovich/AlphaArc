import Foundation
import Testing
@testable import SailBrowser

struct CookieScopeTests {
    @Test func parentCookiesMatchWithDomainBoundaries() {
        #expect(CookieScope.includes(host: "example.com", cookieDomain: ".example.com"))
        #expect(CookieScope.includes(host: "shop.example.com", cookieDomain: ".example.com"))
        #expect(!CookieScope.includes(host: "notexample.com", cookieDomain: "example.com"))
        #expect(!CookieScope.includes(host: "example.com.evil.test", cookieDomain: "example.com"))
        #expect(!CookieScope.includes(host: "shop.example.com", cookieDomain: "other.example.com"))
        #expect(!CookieScope.includes(host: "example.com", cookieDomain: "shop.example.com"))
    }

    @Test func caseAndTrailingDotsAreNormalizedButEmptyDomainsNeverMatch() {
        #expect(CookieScope.includes(host: "SHOP.Example.COM.", cookieDomain: ".Example.Com"))
        #expect(!CookieScope.includes(host: "", cookieDomain: "example.com"))
        #expect(!CookieScope.includes(host: "example.com", cookieDomain: "."))
    }

    @Test func sameNamedCookiesOnDifferentPathsHaveDistinctIdentities() throws {
        func cookie(_ path: String) throws -> HTTPCookie {
            try #require(HTTPCookie(properties: [.domain: "example.com", .path: path, .name: "session", .value: "test"]))
        }
        let root = WebsiteCookie(cookie: try cookie("/"))
        let account = WebsiteCookie(cookie: try cookie("/account"))
        #expect(root.id != account.id)
        #expect(root.id == WebsiteCookie(cookie: try cookie("/")).id)
    }
}
