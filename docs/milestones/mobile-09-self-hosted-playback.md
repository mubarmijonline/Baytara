# mobile-09 — The second delivery path, and the telemetry that was never wired

**Status:** code complete, tests green. **Nothing here has run on hardware.** Neither had
mobile-03, and two of the three defects below are the kind that only a running player
reveals.

## Goal

Play a lesson the server hosts itself, and make the app actually report the session events
the server has been waiting for since mobile-03.

## Why this milestone exists

The Flutter app was written in August, when `POST /video/playback` had one answer: a
VdoCipher OTP. Between 2 and 8 September the web line added a second delivery path
(`Lesson.source`, `backend/app/api/v1/local_hls.py`) and the endpoint gained a second
response shape. Nothing on the mobile side was told.

## Three defects, all silent

### 1. Every self-hosted lesson crashed the player

`PlaybackSession.fromJson` read `j['otp'] as String` unconditionally. Against a
`kind:"local"` response that is a **TypeError, not an ApiException**, so it went straight
past the player screen's `on ApiException` catch: no refusal message, no error reported, the
screen simply died. Every locally hosted video has been unplayable in the app from the
moment the second path shipped.

The parser now takes either shape, and `PlaybackSession` has two named constructors so a
session cannot hold the wrong half of the contract — reading `otp` off a local session is a
compile error rather than a null in front of a learner. An absent `kind` means VdoCipher,
because the DRM response predates the field and has never carried it; an unrecognised one
means VdoCipher too, so a future delivery name cannot crash an older build.

### 2. No session the app ever opened sent a single event

`PlaybackSessionController` was written in mobile-03, tested to 118 tests, and then never
called. `player_screen.dart` wired `onError` and nothing else: no `play`, no `pause`, no
`ended`, no position tick. Every consequence was silent —

- `reportStart` is what starts the 15s heartbeat, so no heartbeat ever ran and the server's
  sweep closed every session as abandoned after 60 seconds of genuine watching;
- coverage stayed at zero, so no lesson recorded progress, `resume_position_seconds` never
  advanced, and **no course could ever complete from the app**;
- "one stream at a time" was comparing against sessions that already looked dead, so it
  stopped guarding anything.

`PlaybackTelemetryBridge` is the missing piece. Both players are `ValueNotifier`s carrying
position, duration, `isPlaying` and an ended flag, so one set of rules drives DRM and
self-hosted playback alike, and the rules live somewhere testable rather than inside a
widget — which matters because there is still no hardware in this repo to run either player
on.

The one rule worth stating: **the start is deferred, not lost.** Both players report a
duration of zero until the first frame decodes, and the server rejects any event whose
duration is not greater than zero. Reporting `play` inside that window would burn the one
event that moves the session out of `pending`, so nothing is sent until the duration is
real.

### 3. Resuming opened at zero

`resume_position_seconds` was fed to the coverage tracker and never to the player, so the
tracker believed the viewer was at 12:30 while the picture started from the beginning. Both
players are now seeked.

## The self-hosted path

Delivery is AES-128 encrypted HLS. Every playlist, segment and key URI carries the signed
token minted by `POST /video/playback`, so `LocalPlayerView` authenticates nothing and never
touches key material: it is handed one master playlist URL and ExoPlayer/AVPlayer does the
rest. `video_player` 2.14.0 was added for this.

The URL arrives **relative** (`/api/v1/video/hls/12/master.m3u8?t=...`) and is resolved
against the API origin. This is the same trap that hid every instructor avatar in August, so
`resolveMediaUrl` moved from the catalogue DTO into `core/network/media_url.dart` — the
player needs the rule and should not import a catalogue DTO to get it.

### The watermark is ours to draw

This is the part that is easy to skip and would quietly weaken the thing we host ourselves.
On the DRM path VdoCipher bakes the viewer's identity into the picture server-side. On this
path the server sends `watermark` as **text** and states that our player renders it. So
`LocalPlayerView` draws it, moving it between anchor points every 17 seconds so a crop or an
overlay placed once cannot keep it off a recording for a whole lesson.

The inaudible audio watermark (`audio_mark`) is sent on both paths and is unchanged.

## What is unchanged, deliberately

The capture guards. `_guard.enable()` still runs **before** the mint on both paths, so there
is no window in which a frame could reach a recorder unprotected, and FLAG_SECURE plus
ALLOW_CAPTURE_BY_NONE apply to the self-hosted picture exactly as they do to the DRM one.
The self-hosted path is not more protected than DRM and this milestone does not claim it is:
there is no Widevine here at all, so on this path a determined capture is bounded only by
FLAG_SECURE.

## Verification

217 tests, `flutter analyze` clean.

`test/playback_kind_test.dart` pins both response shapes, including the local one that used
to throw. `test/telemetry_bridge_test.dart` pins the event rules: nothing before the first
frame, one `play` per start however often the notifier fires, `resume` rather than a second
`play` after a rewatch, `ended` once, a pause before any play suppressed, a seek banking
rather than inventing coverage, and leaving mid-lesson pausing rather than letting the
session time out.

## What hardware still has to confirm

Everything mobile-03 already listed, plus:

- that ExoPlayer fetches the AES key through the token'd URI and decrypts — the token
  logic is server-side and tested there, but no phone has asked for a key yet;
- that the events now actually land, which is visible in the admin session view and is the
  first check worth doing on a real device;
- that the watermark is legible in a recording without covering the lecture.
