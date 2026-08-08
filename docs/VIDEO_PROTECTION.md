# Video protection — what is actually blockable

Date: 2026-08-08

## The honest limits

Screenshots and screen recording are blocked by the operating system's DRM stack, not by
the website. No vendor — VdoCipher included — can block them everywhere:

| Platform / browser        | Screenshot + screen recording | Why |
|---------------------------|-------------------------------|-----|
| macOS Safari              | Blocked (black frame)         | Apple FairPlay DRM |
| iOS / iPadOS Safari       | Blocked                       | Apple FairPlay DRM |
| macOS Chrome / Firefox    | **Not blockable**             | Widevine L3 in software; the OS lets any recorder read the window |
| Windows Edge              | Partly blocked                | PlayReady |
| Windows Chrome / Firefox  | **Not blockable**             | same as macOS |
| Android app / Chrome      | Blocked on most devices       | Widevine L1 |

Sources: VdoCipher's own documentation — screen capture "can only be prevented in Safari on
Mac with the FairPlay DRM upgrade", not in Chrome or Firefox.

## Audio is never protected

Where DRM does block capture, it blocks the **picture only**. Video frames are decrypted
inside the secure enclave (FairPlay on Apple hardware, Widevine L1 on Android), so a screen
recording comes out black — but the audio path is outside that enclave and records normally.
This is true of every DRM platform, Netflix included, and no vendor setting changes it.

A browser cannot fix this. Only a native app can:

- **iOS** — poll `UIScreen.isCaptured` and pause + mute playback while a recording runs.
- **Android** — `FLAG_SECURE` on the player window plus
  `AudioManager.setAllowedCapturePolicy(ALLOW_CAPTURE_BY_NONE)`, which excludes the app's
  audio from screen-recorder capture at the OS level.

Until the mobile app exists (`PROJECT_PLAN.md` §19), an audio-only rip of a protected lesson
is possible, and the visual watermark cannot identify who made it — a black picture carries
no watermark either.

## What Baytara does about it

1. **Protected videos are Safari-only on macOS.** `POST /api/v1/video/playback` refuses to mint
   an OTP when the request comes from macOS in any browser other than Safari
   (`403 mac_needs_safari`, see `mac_without_safari()` in `backend/app/utils.py`). No OTP means
   no video — not a warning, an actual block. The learner sees an Arabic message telling them
   to open Safari.

   Which videos are protected is decided by `capture_protected()` in
   `backend/app/services/catalog_access.py`:

   | Video tier | Screen-capture rule |
   |------------|---------------------|
   | Paid (`baytarian`, `general`) | Always enforced; the admin toggle is locked on |
   | Free (`free`, `vet_free`)     | Off by default — plays in any browser. An admin can tick **حماية من تسجيل الشاشة** on the video to enforce it |

   Where a protected video may play:

   | Client | Protected video |
   |--------|-----------------|
   | Baytara app (UA carries `BaytaraApp/`) | allowed — the shell blocks capture itself |
   | Phone / tablet browser | refused, `403 app_required` — a mobile browser hands the audio to any recorder |
   | macOS Safari | allowed (needs the FairPlay upgrade on the account) |
   | macOS Chrome / Firefox | refused, `403 mac_needs_safari` |
   | Social in-app webview | refused, `403 unsupported_browser` |
   | Windows / Linux browser | allowed |

   Free content therefore reaches the widest audience, and the Safari requirement is only
   paid for where there is something to protect.
2. **Dynamic watermark stays on everywhere.** Name, email, phone and user id float over every
   stream (`watermark_for()`), so a recording made on an unblockable platform identifies who
   made it.
3. **No public URLs.** Only short-lived OTPs, issued after the enrollment check.

A User-Agent can be spoofed, so rule 1 raises the cost rather than making capture impossible.
Rule 2 is what makes a leaked recording traceable, and it does not depend on the browser.

## Sharing limits (what replaces the impossible audio block)

Since a browser cannot stop a recording, the web-side defence is to limit how far one
account can spread content. Enforced in `POST /api/v1/video/playback`, admins exempt:

- **One stream at a time per account.** A second device asking for an OTP while another
  device's session is still alive (heartbeat within 2 minutes) gets `409 already_playing`.
  A reload or lesson change from the *same* device is not a second stream.
- **40 playback tokens per account per hour** → `429 too_many_requests`. A learner never
  reaches it; a script walking the library does.

Both are visible in the admin Video Reports page, since every denial is written to
`video_playback_sessions` with its reason.

## Required in the VdoCipher account (not code)

These are dashboard/support actions on the VdoCipher side — the code above assumes they are done:

- **Enable the Apple FairPlay DRM upgrade** (email support@vdocipher.com). Without it, Safari on
  macOS cannot play at all, and the Safari-only rule above locks Mac users out entirely.
- **Enable DRM** (not plain encrypted HLS) on the account.
- **Disable downloads / offline playback** for the account.

## Deliberately not done

- Blocking the PrintScreen key or right-click in JavaScript: cosmetic, trivially bypassed,
  and it breaks accessibility. The block that matters is the OTP refusal.
- Detecting a running screen recorder from the browser: no web API exposes this.
