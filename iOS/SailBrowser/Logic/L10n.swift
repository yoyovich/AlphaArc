import Foundation

// SwiftUI localizes literal keys itself. UIKit and strings assembled before rendering need an explicit lookup.
nonisolated enum L10n {
    static var locale: Locale {
        let language = Bundle.main.preferredLocalizations.first ?? "en"
        let identifier = Locale.current.region.map { language + "_" + $0.identifier } ?? language
        return Locale(identifier: identifier)
    }

    static func text(_ key: String) -> String {
        NSLocalizedString(key, comment: "")
    }

    static func format(_ key: String, _ arguments: CVarArg...) -> String {
        String(format: text(key), locale: Locale.current, arguments: arguments)
    }
}
