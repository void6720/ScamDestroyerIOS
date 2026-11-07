import SwiftUI

/// Root tab shell. On iOS 26 the TabView bar is rendered in Liquid Glass
/// automatically; the floating action pill uses GlassEffectContainer so the
/// glass elements blend and refract together, per the Liquid Glass guidelines.
struct ContentView: View {
    @EnvironmentObject private var state: GuardState

    var body: some View {
        TabView {
            VPNView()
                .tabItem { Label("VPN", systemImage: "shield.fill") }

            ThreatMapView()
                .tabItem { Label("Map", systemImage: "map.fill") }

            StudioView()
                .tabItem { Label("Studio", systemImage: "hammer.fill") }

            FilesView()
                .tabItem { Label("Files", systemImage: "folder.fill") }

            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
        }
        .tint(.green)
    }
}

/// Shared Liquid Glass card styling (iOS 26).
struct GlassCard<Content: View>: View {
    var cornerRadius: CGFloat = 28
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(20)
            .glassEffect(.regular, in: .rect(cornerRadius: cornerRadius))
    }
}
