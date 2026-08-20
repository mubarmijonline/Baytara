# Baytara — Flutter app

The native Android and iOS app for [baytara.app](https://baytara.app). It talks to the same
API as the website; the backend is not modified to suit it.

This is **not** the Capacitor shell. That still lives in `mobile/`, still builds, and still
ships. It is retired only once this app passes its definition of done.

## Status

Milestones 0-7 of 8 done. Milestone 8 (iOS) is blocked on hardware.
See `docs/milestones/mobile-*.md`.

Done: toolchain and skeleton, auth with device binding and the phone gate, catalogue
browsing, the player with its telemetry and capture guards, learning and certificates,
payments, verification, and the account surface. 165 tests, analyze clean, Android APK
builds. No placeholder screens remain.

**Nothing has run on a real phone, and no Swift in this repo has ever been compiled.**
Every protection claim below is a design intent, not an observation. Do not repeat any of it
as fact until the hardware checklists in `docs/milestones/mobile-03-*.md` and
`mobile-08-*.md` have been worked through.

## Build

```bash
cd mobile_app && flutter build apk --debug
```

The watermark acceptance check, which round-trips Dart-generated audio through the backend's
own decoder:

```bash
cd mobile_app && ./tool/verify_watermark.sh
```

On the dev server the toolchain lives at `/development/flutter` (3.47.0 stable) and
`/development/android-sdk`; both are already on `PATH` via `~/.bashrc`.

**To run it on your own laptop, see [RUNNING.md](RUNNING.md)** — that covers copying the
project, the Flutter SDK, and creating an emulator in Android Studio.

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
