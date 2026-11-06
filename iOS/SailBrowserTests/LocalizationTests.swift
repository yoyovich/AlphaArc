import Foundation
import Testing
@testable import SailBrowser

struct LocalizationTests {
    private func bundle(_ language: String) throws -> Bundle {
        let path = try #require(Bundle.main.path(forResource: language, ofType: "lproj"))
        return try #require(Bundle(path: path))
    }

    @Test func bothLanguagesArePackagedAndRussianUIKeysResolve() throws {
        let ru = try bundle("ru")
        let en = try bundle("en")
        #expect(ru.localizedString(forKey: "Settings", value: nil, table: nil) == "Настройки")
        #expect(en.localizedString(forKey: "Settings", value: nil, table: nil) == "Settings")
        #expect(ru.localizedString(forKey: "Only Necessary Cookies", value: nil, table: nil) == "Только необходимые cookie")
    }

    @Test func russianFormattedMessagesKeepTheSiteName() throws {
        let ru = try bundle("ru")
        let format = ru.localizedString(forKey: "Delete cookies for %@?", value: nil, table: nil)
        #expect(String(format: format, "example.com") == "Удалить cookie сайта example.com?")
    }

    @Test func permissionDescriptionsArePackagedInTheirOwnTable() throws {
        let ru = try bundle("ru")
        #expect(ru.localizedString(forKey: "NSCameraUsageDescription", value: nil, table: "InfoPlist")
            == "Сайты могут запрашивать доступ к камере.")
    }
}
