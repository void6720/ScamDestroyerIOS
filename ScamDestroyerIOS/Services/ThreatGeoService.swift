import Foundation
import CoreLocation

/// Real lookups only — the same pipeline as Android's ThreatGeoRepository:
/// resolve the domain via Cloudflare DNS-over-HTTPS (deliberately around the
/// local filtered resolver, which NXDOMAINs blocked names), then geolocate
/// the IP via ipapi.co. No hardcoded guessed-region fallback: if the lookup
/// fails, the node simply isn't placed.
enum ThreatGeoService {

    static func resolve(query: String) async -> ThreatNode? {
        let ip: String
        if isIPv4(query) {
            ip = query
        } else if let resolved = await resolveViaDoH(domain: query) {
            ip = resolved
        } else {
            return nil
        }
        guard let geo = await geolocate(ip: ip) else { return nil }
        return ThreatNode(domain: query, ip: ip,
                          coordinate: CLLocationCoordinate2D(latitude: geo.0, longitude: geo.1),
                          firstSeen: Date())
    }

    private static func isIPv4(_ s: String) -> Bool {
        let parts = s.split(separator: ".")
        return parts.count == 4 && parts.allSatisfy { UInt8($0) != nil }
    }

    private static func resolveViaDoH(domain: String) async -> String? {
        var comps = URLComponents(string: "https://cloudflare-dns.com/dns-query")!
        comps.queryItems = [URLQueryItem(name: "name", value: domain),
                            URLQueryItem(name: "type", value: "A")]
        var req = URLRequest(url: comps.url!)
        req.setValue("application/dns-json", forHTTPHeaderField: "accept")
        guard let (data, _) = try? await URLSession.shared.data(for: req),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let answers = json["Answer"] as? [[String: Any]] else { return nil }
        return answers.compactMap { $0["data"] as? String }.first(where: isIPv4)
    }

    private static func geolocate(ip: String) async -> (Double, Double)? {
        guard let url = URL(string: "https://ipapi.co/\(ip)/json/"),
              let (data, _) = try? await URLSession.shared.data(from: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let lat = json["latitude"] as? Double,
              let lon = json["longitude"] as? Double else { return nil }
        return (lat, lon)
    }
}
