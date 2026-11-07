import Foundation
import Testing
@testable import SailBrowser

struct LocalBuildTests {
    @Test func disabledCloudSyncDoesNotExposeOrOverwriteAnEarlierCache() async throws {
        let directories = AppDirectories.temporary()
        try FileManager.default.createDirectory(at: directories.support, withIntermediateDirectories: true)
        var cache = MacTabsCache()
        cache.devices = [MacDevice(id: "old-mac", name: "Old Mac", modified: .now, spaceIDs: [], current: nil)]
        let data = try JSONEncoder().encode(cache)
        let file = directories.support.appending(path: "mac-tabs.json")
        try data.write(to: file)
        let store = MacTabsStore(directories: directories, container: nil)
        await store.start()
        await store.fetch()
        await store.flush()
        #expect(store.macs.isEmpty)
        #expect(try Data(contentsOf: file) == data)
    }
}
