# Install ScamDestroyer iOS with SideStore (free Apple ID)

SideStore signs apps **on the iPhone itself** with your own free Apple ID — no
paid developer account, no computer needed after the one-time setup. Apps get
a 7-day signature; SideStore refreshes them automatically in the background
before they expire.

## You need
- The iPhone/iPad (iOS 26 for ScamDestroyer — it is built with iOS 26 Liquid Glass)
- A free Apple ID (a secondary/burner ID is fine and commonly recommended)
- One computer for the first setup only — Windows, Mac, **or Linux**
- The free **LocalDevVPN** app from the App Store
- Our build: `ScamDestroyerIOS-v1.0-unsigned.ipa` from the
  [v1.0 release](https://github.com/void6720/ScamDestroyerIOS/releases/tag/v1.0)

## One-time setup
1. On the computer, install **iloader** (the current SideStore installer,
   free, Windows/Mac/Linux) from sidestore.io.
2. Connect the iPhone by USB, unlock it, tap **Trust** if asked.
3. In iloader: sign in with your Apple ID (approve the 2FA prompt), pick your
   device, and click **SideStore (Stable)** — install the current build
   (0.7.0-alpha or newer; **do not use 0.6.4** — its sign-in is broken).
   iloader also places the pairing file SideStore needs.
4. On the iPhone: **Settings → General → VPN & Device Management** → under
   Developer App, tap your Apple ID → **Trust**.
5. Install **LocalDevVPN** from the App Store, open it, let it add its VPN
   configuration. SideStore installs/refreshes only while on **Wi-Fi with
   LocalDevVPN connected**.

## Install ScamDestroyer
1. On the iPhone, open the
   [v1.0 release](https://github.com/void6720/ScamDestroyerIOS/releases/tag/v1.0)
   in Safari and download `ScamDestroyerIOS-v1.0-unsigned.ipa` (lands in Files).
2. Open **SideStore**, go to **Settings** and sign in with the **same** Apple ID.
3. Connect **LocalDevVPN**, then in SideStore tap **My Apps → +** and pick the
   .ipa from Files. SideStore signs it with your ID and installs it.
4. First time only: refresh **SideStore itself first** (tap its 7 DAYS pill),
   then install ScamDestroyer — this avoids apps vanishing from the list.

## Keeping it alive
- Leave **Background App Refresh** on for SideStore and connect LocalDevVPN
  now and then — SideStore re-signs everything before the 7 days run out.
- Free-ID limits (Apple's, not ours): **3 active sideloaded apps** at a time
  (SideStore counts as one), **10 new App IDs per 7 days**.
- If refresh fails: check Wi-Fi + LocalDevVPN are both on, close the app being
  refreshed, retry. On iOS 26.4+, reinstalling SideStore via iloader fixes
  stubborn VPN errors.
