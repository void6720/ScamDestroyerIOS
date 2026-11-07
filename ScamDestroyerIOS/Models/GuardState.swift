import Foundation
import CoreLocation

/// One intercepted (blocked) DNS lookup, mirroring the Android GuardState log line.
struct BlockEvent: Identifiable, Equatable {
    let id = UUID()
    let time: Date
    let domain: String
}

/// A located threat node on the map — a blocked domain resolved to
/// real coordinates (Cloudflare DoH + IP geolocation), same as Android.
struct ThreatNode: Identifiable, Equatable {
    let id = UUID()
    let domain: String
    let ip: String
    var coordinate: CLLocationCoordinate2D?
    let firstSeen: Date

    var located: Bool { coordinate != nil }
    var isLive: Bool { Date().timeIntervalSince(firstSeen) < 30 }

    static func == (lhs: ThreatNode, rhs: ThreatNode) -> Bool { lhs.id == rhs.id }
}

/// In-memory session state, the iOS counterpart of Android's GuardState + GuardPrefs.
@MainActor
final class GuardState: ObservableObject {
    @Published var shieldOn: Bool = false
    @Published var blocks: [BlockEvent] = []          // newest first, capped at 40 like Android
    @Published var nodes: [ThreatNode] = []           // newest first
    @Published var adsEnabled: Bool = false           // opt-in support banner, default OFF (same rule as Android)

    static let maxBlocks = 40

    func logBlock(domain: String, node: ThreatNode? = nil) {
        blocks.insert(BlockEvent(time: Date(), domain: domain), at: 0)
        if blocks.count > Self.maxBlocks { blocks.removeLast(blocks.count - Self.maxBlocks) }
        if let node { nodes.insert(node, at: 0) }
    }
}
