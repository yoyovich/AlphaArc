import SwiftUI
import WebKit

struct SiteSettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var confirmingClear = false
    let host: String

    var body: some View {
        let blocksGlobally = !env.browser.settings.blockedCategories.isEmpty
        let isPrivate = env.activeIsPrivate
        NavigationStack {
            Form {
                Section {
                    if blocksGlobally {
                        Toggle("Content Blocking", isOn: changing(\.blocksTrackers))
                    }
                    Toggle("JavaScript", isOn: changing(\.allowsJavaScript))
                    Toggle("Only Necessary Cookies", isOn: changing(\.allowsCookieAutomation))
                        .disabled(!env.browser.settings.automaticallyHandlesCookies || !env.siteSettings(forHost: host).allowsJavaScript)
                    Toggle("Force Dark Websites", isOn: changing(\.allowsForcedDark))
                        .disabled(!env.browser.settings.forcesDarkWebsites || !env.siteSettings(forHost: host).allowsJavaScript)
                } footer: {
                    Text("Website features follow global settings and pause when JavaScript is off.")
                }
                Section {
                    permission("Camera", .camera)
                    permission("Microphone", .microphone)
                } header: {
                    Text("Permissions")
                } footer: {
                    if isPrivate {
                        Text("Private tabs ask every time.")
                    }
                }
                .disabled(isPrivate)
                Section {
                    NavigationLink {
                        CookiesView(host: host, store: env.activeController?.webView.configuration.websiteDataStore.httpCookieStore)
                            .id(host)
                    } label: {
                        Label("Cookies", systemImage: "list.bullet.rectangle")
                    }
                    Button("Clear Website Data", role: .destructive) {
                        confirmingClear = true
                    }
                    .confirmationDialog("Clear Website Data", isPresented: $confirmingClear, titleVisibility: .visible) {
                        Button("Clear Website Data", role: .destructive) {
                            Task { await env.clearSiteData(forHost: host) }
                        }
                    } message: {
                        Text("Cookies and stored data for \(host) will be removed.")
                    }
                }
            }
            .navigationTitle(host)
            .navigationBarTitleDisplayMode(.inline)
            .sheetDoneButton()
        }
    }

    // Takes effect on the site's next request; a capture already running goes on.
    private func permission(_ title: String, _ kind: MediaKind) -> some View {
        Picker(LocalizedStringKey(title), selection: Binding {
            env.sites[host][kind]
        } set: {
            env.haptics.fire(.settingsChange)
            env.sites[host][kind] = $0
        }) {
            ForEach(SitePermission.allCases, id: \.self) {
                Text(LocalizedStringKey($0.label))
            }
        }
        .pickerStyle(.menu)
    }

    private func changing(_ setting: WritableKeyPath<SiteSettings, Bool>) -> Binding<Bool> {
        Binding {
            env.siteSettings(forHost: host)[keyPath: setting]
        } set: {
            env.haptics.fire(.settingsChange)
            var settings = env.siteSettings(forHost: host)
            settings[keyPath: setting] = $0
            env.setSiteSettings(settings, forHost: host)
        }
    }
}
