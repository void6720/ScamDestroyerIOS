import SwiftUI

/// VPN tab — the home screen, mirroring Android (Shield merged into VPN).
/// The DNS firewall itself runs in a Network Extension (NEDNSProxyProvider)
/// once the entitlement is granted; this view is the control surface.
struct VPNView: View {
    @EnvironmentObject private var state: GuardState

    var body: some View {
        NavigationStack {
            ZStack {
                backdrop
                ScrollView {
                    VStack(spacing: 16) {
                        statusCard
                        if state.shieldOn {
                            blockLogCard
                        } else {
                            disconnectedCard
                        }
                    }
                    .padding(16)
                }
            }
            .navigationTitle("ScamDestroyer")
        }
    }

    private var backdrop: some View {
        LinearGradient(colors: [Color(red: 0.04, green: 0.05, blue: 0.09),
                                Color(red: 0.02, green: 0.10, blue: 0.07)],
                       startPoint: .top, endPoint: .bottom)
            .ignoresSafeArea()
    }

    private var statusCard: some View {
        GlassCard {
            VStack(spacing: 12) {
                Image(systemName: state.shieldOn ? "shield.fill" : "shield.slash")
                    .font(.system(size: 44))
                    .foregroundStyle(state.shieldOn ? .green : .secondary)
                Text(state.shieldOn ? "PROTECTED" : "NOT PROTECTED")
                    .font(.headline).tracking(2)
                Text(state.shieldOn
                     ? "DNS firewall is filtering lookups on this device."
                     : "Turn the shield on to start filtering malicious domains.")
                    .font(.subheadline).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button {
                    withAnimation { state.shieldOn.toggle() }
                } label: {
                    Text(state.shieldOn ? "Stop shield" : "Start shield")
                        .font(.headline)
                        .padding(.horizontal, 28).padding(.vertical, 10)
                }
                .buttonStyle(.glassProminent)
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var disconnectedCard: some View {
        GlassCard {
            HStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red)
                Text("PROTECTION DISCONNECTED — the shield is off.")
                    .font(.subheadline.bold())
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var blockLogCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("RECENT BLOCKS").font(.caption.bold()).tracking(1.5)
                    .foregroundStyle(.secondary)
                if state.blocks.isEmpty {
                    Text("No intercepted domains yet this session.")
                        .font(.subheadline).foregroundStyle(.secondary)
                } else {
                    ForEach(state.blocks) { block in
                        HStack {
                            Text(block.time, style: .time).font(.caption.monospaced())
                                .foregroundStyle(.secondary)
                            Text(block.domain).font(.caption).lineLimit(1)
                            Spacer()
                            Image(systemName: "hand.raised.fill")
                                .font(.caption).foregroundStyle(.red)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
