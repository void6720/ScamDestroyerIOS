import SwiftUI

/// ScamDestroyer for iOS — Liquid Glass edition.
/// Requires Xcode 26 / iOS 26 SDK for the native Liquid Glass APIs
/// (glassEffect, GlassEffectContainer, glass tab bars).
@main
struct ScamDestroyerIOSApp: App {
    @StateObject private var guardState = GuardState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(guardState)
                .preferredColorScheme(.dark)
        }
    }
}
