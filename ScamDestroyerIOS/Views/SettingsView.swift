import SwiftUI

/// Settings — including the opt-in support banner (same rules as Android:
/// default OFF, no ad SDK activity while off) and the app info block.
struct SettingsView: View {
    @EnvironmentObject private var state: GuardState

    var body: some View {
        NavigationStack {
            Form {
                Section("Protection") {
                    Toggle("DNS shield starts on launch", isOn: .constant(false))
                    Text("The DNS firewall itself runs in the Network Extension "
                         + "once the entitlement is granted — see README.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section("Support") {
                    Toggle("Support Banner (Ads)", isOn: $state.adsEnabled)
                    Text("Opt-in, off by default. Never tap your own banner — "
                         + "that's invalid traffic on your own AdMob account.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section("About") {
                    LabeledContent("App", value: "ScamDestroyer for iOS")
                    LabeledContent("Version", value: "1.1.0")
                    LabeledContent("Assistant", value: "On-device AI (Foundation Models)")
                    LabeledContent("Design", value: "Liquid Glass (iOS 26)")
                    LabeledContent("Edition", value: "Primary version")
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color(red: 0.03, green: 0.04, blue: 0.07).ignoresSafeArea())
            .navigationTitle("Settings")
        }
    }
}
