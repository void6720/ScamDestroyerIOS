import SwiftUI

/// Files tab — scoped explorer over the app's own sandbox directories
/// (Documents / Caches / tmp), the iOS counterpart of the Android Files tab.
struct FilesView: View {
    @State private var entries: [FileEntry] = []
    @State private var current: URL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]

    struct FileEntry: Identifiable {
        let id = UUID()
        let url: URL
        let isDir: Bool
        let size: Int
    }

    var body: some View {
        NavigationStack {
            List {
                if current != FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0] {
                    Button {
                        current = current.deletingLastPathComponent()
                        reload()
                    } label: {
                        Label(".. (up)", systemImage: "arrow.up")
                    }
                }
                ForEach(entries) { entry in
                    Button {
                        if entry.isDir { current = entry.url; reload() }
                    } label: {
                        HStack {
                            Image(systemName: entry.isDir ? "folder.fill" : "doc")
                                .foregroundStyle(entry.isDir ? .yellow : .secondary)
                            Text(entry.url.lastPathComponent).lineLimit(1)
                            Spacer()
                            if !entry.isDir {
                                Text(ByteCountFormatter.string(fromByteCount: Int64(entry.size),
                                                               countStyle: .file))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
                if entries.isEmpty {
                    Text("This folder is empty.").foregroundStyle(.secondary)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Color(red: 0.03, green: 0.04, blue: 0.07).ignoresSafeArea())
            .navigationTitle("Files")
            .onAppear(perform: reload)
        }
    }

    private func reload() {
        let fm = FileManager.default
        let urls = (try? fm.contentsOfDirectory(
            at: current,
            includingPropertiesForKeys: [.isDirectoryKey, .fileSizeKey])) ?? []
        entries = urls.map { url in
            let v = try? url.resourceValues(forKeys: [.isDirectoryKey, .fileSizeKey])
            return FileEntry(url: url, isDir: v?.isDirectory ?? false, size: v?.fileSize ?? 0)
        }
        .sorted { ($0.isDir ? 0 : 1, $0.url.lastPathComponent.lowercased())
               < ($1.isDir ? 0 : 1, $1.url.lastPathComponent.lowercased()) }
    }
}
