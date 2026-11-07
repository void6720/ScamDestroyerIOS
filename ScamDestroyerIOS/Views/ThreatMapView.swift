import SwiftUI
import MapKit

/// Threat Map — MapKit counterpart of the Android Google Maps screen.
/// Header search (domain / IP, history first then live resolve), pulsing
/// rings + LIVE tags on fresh pins, tappable node list.
/// NOTE: the fly-to (target) button lives in the header's TOP-RIGHT corner.
struct ThreatMapView: View {
    @EnvironmentObject private var state: GuardState
    @State private var query = ""
    @State private var camera = MapCameraPosition.region(
        MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 25, longitude: 10),
                           span: MKCoordinateSpan(latitudeDelta: 90, longitudeDelta: 90)))
    @State private var searching = false

    var body: some View {
        ZStack(alignment: .top) {
            Map(position: $camera) {
                ForEach(state.nodes.filter { $0.located }) { node in
                    Annotation(node.domain, coordinate: node.coordinate!) {
                        pin(for: node)
                    }
                }
            }
            .mapStyle(.standard(elevation: .realistic))
            .ignoresSafeArea()

            header
            if !state.nodes.isEmpty { nodePanel }
        }
    }

    // MARK: - Header (Liquid Glass, floating)

    private var header: some View {
        VStack(spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("THREAT MAP").font(.headline).tracking(2.5)
                    Text("Intercepted endpoint origins")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                // Fly-to-latest-threat target — pinned to the corner, per design.
                Button {
                    if let node = state.nodes.first(where: { $0.located }) {
                        flyTo(node, span: 12)
                    }
                } label: {
                    Image(systemName: "location.fill")
                        .padding(10)
                }
                .buttonStyle(.glass)
                .clipShape(Circle())
            }
            HStack {
                TextField("Search domain or IP…", text: $query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onSubmit { submitSearch() }
                if searching {
                    ProgressView()
                } else {
                    Button { submitSearch() } label: {
                        Image(systemName: "magnifyingglass").foregroundStyle(.green)
                    }
                }
            }
        }
        .padding(16)
        .glassEffect(.regular, in: .rect(cornerRadius: 28))
        .padding(.horizontal, 14).padding(.top, 14)
    }

    // MARK: - Node list panel (never covers the map attribution)

    private var nodePanel: some View {
        VStack {
            Spacer()
            VStack(alignment: .leading, spacing: 8) {
                Text("THREAT NODES").font(.caption.bold()).tracking(1.5)
                    .foregroundStyle(.secondary)
                ForEach(state.nodes.prefix(6)) { node in
                    Button { if node.located { flyTo(node, span: 8) } } label: {
                        HStack {
                            Text(node.domain).font(.subheadline).lineLimit(1)
                            if node.isLive {
                                Text("LIVE").font(.caption2.bold()).foregroundStyle(.red)
                            }
                            Spacer()
                            Text(node.ip).font(.caption.monospaced())
                                .foregroundStyle(.secondary)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
            .glassEffect(.regular, in: .rect(cornerRadius: 28))
            .padding(.horizontal, 14).padding(.bottom, 14)
        }
    }

    // MARK: - Pin with pulse ring for fresh (<30 s) nodes

    @ViewBuilder
    private func pin(for node: ThreatNode) -> some View {
        ZStack {
            if node.isLive {
                Circle().fill(.red.opacity(0.25)).frame(width: 44, height: 44)
                Circle().stroke(.red.opacity(0.6), lineWidth: 2).frame(width: 30, height: 30)
            }
            Circle().fill(.red).frame(width: 14, height: 14)
                .overlay(Circle().stroke(.white, lineWidth: 2))
        }
    }

    // MARK: - Search + camera

    private func flyTo(_ node: ThreatNode, span: CLLocationDegrees) {
        guard let c = node.coordinate else { return }
        withAnimation(.easeInOut(duration: 1.5)) {
            camera = .region(MKCoordinateRegion(
                center: c, span: MKCoordinateSpan(latitudeDelta: span, longitudeDelta: span)))
        }
    }

    private func submitSearch() {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return }
        // History first — same rule as Android.
        if let hit = state.nodes.first(where: { $0.domain == q || $0.ip == q }), hit.located {
            flyTo(hit, span: 12)
            return
        }
        searching = true
        Task {
            let node = await ThreatGeoService.resolve(query: q)
            searching = false
            if let node {
                state.nodes.insert(node, at: 0)
                flyTo(node, span: 12)
            }
        }
    }
}
