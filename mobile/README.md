# Baytara app shell

A thin Capacitor wrapper around **https://baytara.app**. It exists for one reason: the two
screen-capture protections that a browser cannot provide.

| | Android | iOS | Mobile web |
|---|---|---|---|
| Picture in a recording | blank (`FLAG_SECURE`) | blank (FairPlay, needs the account upgrade) | blank |
| **Audio in a recording** | **silent** (`ALLOW_CAPTURE_BY_NONE`) | **playback refuses to run while recording** | **recorded — unavoidable** |

The web app itself is unchanged: the shell loads the live site, so every deploy of
`frontend/web` reaches app users immediately. No separate release for content changes.

## How the protections work

**Android** — `MainActivity.onCreate` sets `FLAG_SECURE` on the window and calls
`AudioManager.setAllowedCapturePolicy(ALLOW_CAPTURE_BY_NONE)` (Android 10+). The system
recorder captures a black frame and no sound at all. Nothing to detect, nothing to react to.

**iOS** — Apple offers no audio-capture policy, so `ScreenCaptureGuard.swift` watches
`UIScreen.capturedDidChangeNotification`. When a recording (or a mirroring session) starts it
calls `window.__baytaraCaptureChanged(true)` in the web app — which pauses and mutes the
VdoCipher player (`frontend/web/src/components/SecureVdoPlayer.jsx`) — and covers the screen
with "أوقف تسجيل الشاشة لمتابعة المشاهدة". Playback resumes when the recording stops.
Prevention by refusal: nothing plays, so nothing is captured.

## Build — Android (works on this Linux server)

```bash
cd mobile/android && ./gradlew assembleDebug
```

Output: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Sideload it to test:
enable "install unknown apps", copy the APK to the phone, tap it. No Play Store account
needed for testing. Requires JDK 17 and the Android SDK (`android/local.properties` must
point at the SDK — see `local.properties.example`).

For the Play Store you additionally need a Google Play developer account ($25 one-off), a
release keystore, and `./gradlew bundleRelease`.

## Build — iOS (needs a Mac)

An `.ipa` can only be produced on macOS with Xcode; this server cannot build it.

```bash
cd mobile && npm install && npx cap sync ios && npx cap open ios
```

Then in Xcode: set the team, bundle id `app.baytara.mobile`, and Run. Shipping to the App
Store needs an Apple Developer account ($99/year).

## Notes

- `capacitor.config.json` points `server.url` at the production site. To test against a local
  build instead, drop `server.url` and copy `frontend/web/dist` into `mobile/www`.
- Apple sometimes rejects apps that are only a website wrapper (guideline 4.2). The capture
  protections and native behaviour are the argument for this one; if review pushes back, the
  answer is to add native shell features (downloads, push, offline notes) rather than to drop
  the wrapper.
- Once the apps ship you can decide whether protected videos stay playable in mobile browsers
  at all. Making them app-only is what actually closes the audio hole — while the mobile web
  remains open, a recording there still captures sound.
