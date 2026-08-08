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

## What Baytara does about it

1. **macOS is Safari-only.** `POST /api/v1/video/playback` refuses to mint an OTP when the
   request comes from macOS in any browser other than Safari (`403 mac_needs_safari`, see
   `mac_without_safari()` in `backend/app/utils.py`). No OTP means no video — not a warning,
   an actual block. The learner sees an Arabic message telling them to open Safari.
2. **Dynamic watermark stays on everywhere.** Name, email, phone and user id float over every
   stream (`watermark_for()`), so a recording made on an unblockable platform identifies who
   made it.
3. **No public URLs.** Only short-lived OTPs, issued after the enrollment check.

A User-Agent can be spoofed, so rule 1 raises the cost rather than making capture impossible.
Rule 2 is what makes a leaked recording traceable, and it does not depend on the browser.

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
