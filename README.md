# ScamDestroyer for iOS — v1.0 (Primary version)

The iOS counterpart of the Android ScamDestroyer, rebuilt in SwiftUI with
Apple's **Liquid Glass** design language (iOS 26): native glass tab bar,
`glassEffect` cards, `GlassEffectContainer` blending, glass buttons.

## What's in the box

- `ScamDestroyerIOS/` — the full SwiftUI source (App entry, ContentView tab
  shell, Views for VPN / Map / Studio / Files / Settings, GuardState model,
  Blocklist suffix matcher, ThreatGeoService with real DoH + geolocation).
- `ScamDestroyerIOS/Resources/playground/` — the same Studio assets as the
  Android app (Three.js, Wasmoon + Fengari fallback, Roblox-style shim),
  served to a locked-down WKWebView through a custom scheme handler.
- `project.yml` — XcodeGen spec (marketing version **1.0**, build 1,
  deployment target iOS 26.0). Or: create an iOS App project in Xcode 26,
  name it ScamDestroyerIOS, and drag the `ScamDestroyerIOS` folder in.
- `preview.html` — an interactive Liquid Glass mockup of the design.
  Open it in any browser; it is a design preview, **not** the app.

## Honest limits — read before expecting an .ipa

- **This project was authored on a Linux VM. There is no way to compile,
  sign, or install an iOS app without a Mac running Xcode.** Nothing here
  has been compiled; the source is written to the iOS 26 SDK APIs but only
  a Mac build can prove it end-to-end.
- Liquid Glass APIs (`glassEffect`, `.glass` button styles) require the
  **iOS 26 SDK (Xcode 26)** and an iOS 26 deployment target.
- Feature parity with Android is **not** 1:1, because iOS doesn't allow it:
  - **DNS firewall** — on Android it's a VpnService. On iOS it must live in
    a **Network Extension** (`NEDNSProxyProvider`), which requires the paid
    Apple Developer Program and the Network Extension entitlement from
    Apple. The SwiftUI control surface here is complete; the extension
    target itself is the next build step after enrollment.
  - **Notification guard** — Android uses an AccessibilityService. **iOS has
    no equivalent API**; this feature cannot be ported.
  - **Threat Map** — MapKit replaces Google Maps (no API key needed); the
    search / live-pin / node-list behavior matches the Android v1.28 layout,
    including the fly-to button pinned to the header's top-right corner.
  - **Ads** — the Settings toggle and rules (opt-in, default off) are
    ported; the AdMob iOS SDK (Google-Mobile-Ads-SDK via SPM) wires in on
    the Mac build.
- The Studio playground is standard Lua (Wasmoon/Fengari), **not full
  Luau**, and the editor is a plain text view — same honest limits as the
  Android Studio tab.
