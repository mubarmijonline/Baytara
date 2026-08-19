# Baytara — Flutter app

The native Android and iOS app for [baytara.app](https://baytara.app). It talks to the same
API as the website; the backend is not modified to suit it.

This is **not** the Capacitor shell. That still lives in `mobile/`, still builds, and still
ships. It is retired only once this app passes its definition of done.

## Status

Milestone 0 of 8 — toolchain and skeleton. See `docs/milestones/mobile-00-*.md` and the
per-milestone files after it. The four tabs render placeholders; the interceptor stack,
route guards, error vocabulary and localisation underneath them are real and tested.

## Build

```bash
cd mobile_app && flutter build apk --debug
```

Requires the toolchain installed on this server:
`/development/flutter` (3.47.0 stable) and `/development/android-sdk`. Put both on `PATH`
and set `ANDROID_HOME` before building.

There is no emulator here and no display. Testing means sideloading the APK to a real
Android phone — copy it over, enable "install unknown apps", tap it. Same as `mobile/`.

**iOS cannot be built on this machine.** It needs macOS. The Dart is cross-platform and the
iOS native guards are written, but nothing in `ios/` has ever been compiled. That is
milestone 8.

## What the client must get right

Three things, each of which silently breaks video if it drifts:

1. **`User-Agent` contains `BaytaraApp/1`.** `APP_UA_MARKER` in `backend/app/utils.py` is
   checked before an OTP is minted for any capture-protected lesson. It must be on the Dio
   client *and* on every WebView or custom tab the app opens.
2. **The device id never regenerates.** Two devices per account, keyed on this value. A
   fresh id burns one of the user's two slots.
3. **One refresh across concurrent 401s.** See `core/network/refresh_interceptor.dart` —
   the comment there explains why a shared future alone is not enough.

## What the anti-recording layers actually do

Stated plainly, because it is easy to leave people believing more than is true.

**These prevent a capture:**

| | |
|---|---|
| `FLAG_SECURE` (Android) | recorders capture black, screenshots blocked for the window |
| `ALLOW_CAPTURE_BY_NONE` (Android 10+) | the app's audio is excluded from the recording — the file comes out **silent**. DRM never does this |
| FairPlay / Widevine L1 | the decoded picture sits in a buffer the recorder cannot read |

**These only detect.** They stop nothing. They raise the cost and produce evidence:

- screenshot detection (iOS gives no way to block a screenshot)
- screen-recording and mirroring detection
- root / jailbreak checks
- the inaudible audio watermark, which makes a leaked file traceable to one account

On Widevine **L3** devices the Android video path is not hardware-protected and a determined
capture can succeed. The security level is readable at runtime.

**The app is not uncapturable, and nobody should be told that it is.**
