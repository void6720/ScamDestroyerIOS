import Foundation

/// Suffix-matching blocklist — a direct port of the Android Blocklist.kt logic.
/// A host is blocked when it equals a listed domain or is a subdomain of one.
struct Blocklist {
    private(set) var domains: Set<String> = []

    mutating func load(fromText text: String) {
        for raw in text.split(whereSeparator: \.isNewline) {
            let line = raw.trimmingCharacters(in: .whitespaces)
            guard !line.isEmpty, !line.hasPrefix("#") else { continue }
            // hosts-file format: "0.0.0.0 domain"
            let parts = line.split(separator: " ")
            let host = (parts.count > 1 ? String(parts[1]) : line).lowercased()
            domains.insert(host)
        }
    }

    func isBlocked(_ host: String, whitelist: Set<String> = []) -> Bool {
        let h = host.lowercased()
        if whitelist.contains(h) { return false }
        var candidate = h
        while true {
            if domains.contains(candidate) { return true }
            guard let dot = candidate.firstIndex(of: ".") else { return false }
            candidate = String(candidate[candidate.index(after: dot)...])
        }
    }
}
