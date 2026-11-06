import Foundation

// Scope the manager to the current site and its parent-domain cookies:
// but a cookie for a sibling or a lookalike domain never appears in this site's manager.
nonisolated enum CookieScope {
    static func includes(host: String, cookieDomain: String) -> Bool {
        let dots = CharacterSet(charactersIn: ".")
        let host = host.lowercased().trimmingCharacters(in: dots)
        let domain = cookieDomain.lowercased().trimmingCharacters(in: dots)
        guard !host.isEmpty, !domain.isEmpty else { return false }
        return host == domain || host.hasSuffix("." + domain)
    }
}

nonisolated struct WebsiteCookie: Identifiable {
    nonisolated struct Key: Hashable {
        let domain: String
        let path: String
        let name: String
    }

    let cookie: HTTPCookie
    var id: Key { Key(domain: cookie.domain, path: cookie.path, name: cookie.name) }
}
