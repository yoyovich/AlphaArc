import SwiftUI
import WebKit

// Uses the exact tab's cookie store, including its ephemeral private store. No fallback to the normal store.
struct CookiesView: View {
    let host: String
    @State private var store: WKHTTPCookieStore?

    init(host: String, store: WKHTTPCookieStore?) {
        self.host = host
        _store = State(initialValue: store)
    }
    @State private var cookies: [WebsiteCookie] = []
    @State private var busy = true
    @State private var confirmingDelete = false

    var body: some View {
        List {
            Section {
                ForEach(cookies) { entry in
                    NavigationLink {
                        CookieDetails(cookie: entry.cookie)
                    } label: {
                        VStack(alignment: .leading) {
                            Text(verbatim: entry.cookie.name).lineLimit(1)
                            Text(verbatim: entry.cookie.domain).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .onDelete { offsets in
                    let removed = offsets.map { cookies[$0].cookie }
                    Task { await delete(removed) }
                }
                .deleteDisabled(busy)
            } header: {
                Text(verbatim: host)
            } footer: {
                Text("Site cookies include sign-in sessions. Incognito uses its own temporary storage.")
            }
        }
        .overlay {
            if busy {
                ProgressView()
            } else if store == nil {
                ContentUnavailableView("Tab Unavailable", systemImage: "globe")
            } else if cookies.isEmpty {
                ContentUnavailableView("No Cookies", systemImage: "checkmark.shield")
            }
        }
        .navigationTitle("Cookies")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Delete Cookies", role: .destructive) { confirmingDelete = true }
                    .disabled(busy || cookies.isEmpty)
            }
        }
        .confirmationDialog("Delete Cookies", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete Cookies", role: .destructive) {
                Task { await delete(cookies.map(\.cookie)) }
            }
        } message: {
            Text("Delete cookies for \(host)?")
        }
        .refreshable { if !busy { await reload() } }
        .task { await reload() }
    }

    private func reload() async {
        guard let store else { busy = false; return }
        busy = true
        let all: [HTTPCookie] = await withCheckedContinuation { continuation in
            store.getAllCookies { continuation.resume(returning: $0) }
        }
        cookies = all.filter { CookieScope.includes(host: host, cookieDomain: $0.domain) }
            .sorted { ($0.domain, $0.name, $0.path) < ($1.domain, $1.name, $1.path) }
            .map { WebsiteCookie(cookie: $0) }
        busy = false
    }

    private func delete(_ removed: [HTTPCookie]) async {
        guard !busy, let store else { return }
        busy = true
        for cookie in removed {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                store.delete(cookie) { continuation.resume() }
            }
        }
        await reload()
    }
}

private struct CookieDetails: View {
    let cookie: HTTPCookie

    var body: some View {
        Form {
            LabeledContent("Name", value: cookie.name)
            LabeledContent("Domain", value: cookie.domain)
            LabeledContent("Path", value: cookie.path)
            LabeledContent("Expires", value: cookie.expiresDate?.formatted(date: .abbreviated, time: .shortened)
                ?? L10n.text("End of Session"))
            LabeledContent("Secure", value: L10n.text(cookie.isSecure ? "Yes" : "No"))
            LabeledContent("HTTP Only", value: L10n.text(cookie.isHTTPOnly ? "Yes" : "No"))
            DisclosureGroup("Value") {
                Text(verbatim: cookie.value).textSelection(.enabled).privacySensitive()
            }
        }
        .navigationTitle("Cookie Details")
        .navigationBarTitleDisplayMode(.inline)
    }
}
