import SwiftUI

// Blocking and website preferences. Changes refresh both live and off-screen web views.
struct BlockingSection: View {
    let changing: (WritableKeyPath<BrowserSettings, Bool>) -> Binding<Bool>

    var body: some View {
        Section {
            Toggle(isOn: changing(\.blocksAds)) {
                SettingsLabel("Block Ads", systemImage: "nosign", color: .orange)
            }
            Toggle(isOn: changing(\.blocksTrackers)) {
                SettingsLabel("Block Trackers", systemImage: "eye.slash.fill", color: .indigo)
            }
            Toggle(isOn: changing(\.blocksCookieBanners)) {
                SettingsLabel("Block Cookie Banners", systemImage: "xmark.shield.fill", color: .teal)
            }
            .disabled(changing(\.automaticallyHandlesCookies).wrappedValue)
            Toggle(isOn: changing(\.automaticallyHandlesCookies)) {
                SettingsLabel("Only Necessary Cookies", systemImage: "checkmark.shield.fill", color: .green)
            }
        } header: {
            Text("Privacy and Blocking")
        } footer: {
            Text("Automatically rejects optional cookies on supported banners. Never accepts all. Unknown banners stay visible; banner hiding is paused while this is enabled.")
        }
        Section {
            Toggle(isOn: changing(\.forcesDarkWebsites)) {
                SettingsLabel("Force Dark Websites", systemImage: "moon.fill", color: .indigo)
            }
        } header: {
            Text("Website Appearance")
        } footer: {
            Text("Adapts light pages without inverting images. You can turn this off for an individual site.")
        }
    }
}
