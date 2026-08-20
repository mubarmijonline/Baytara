# mobile-03 — Player, telemetry and capture guards

**Status:** code complete; **every protection claim here is unverified until it runs on a
real phone.** See "What hardware has to confirm".

## Goal

Play a DRM-protected lesson, report the telemetry the server needs to keep the session
alive, and make a screen recording worthless.

## What actually prevents a capture, and what only notices one

This distinction is the whole milestone, and it is stated in `mobile_app/README.md` too so
nobody is left believing more than is true.

**Prevents:**

| | |
|---|---|
| `FLAG_SECURE` (Android) | the recorder captures a black frame; screenshots refused |
| `ALLOW_CAPTURE_BY_NONE` (Android 10+) | the app's audio is excluded from the recording, so the file comes out **silent**. DRM never does this |
| FairPlay / Widevine L1 | the decoded picture sits in hardware the recorder cannot read |

**Only detects.** These stop nothing; they raise the cost and produce evidence:
screenshot detection (iOS cannot block one), recording and mirroring detection, and the
inaudible audio watermark.

On a Widevine **L3** device the Android video path is not hardware protected and a
determined capture can succeed. `widevineSecurityLevel()` reports the level; nothing refuses
playback on it, because that is a product decision, not a client one.

`FLAG_SECURE` is scoped to the player route rather than the whole app. Blocking screenshots
everywhere would stop someone sending a colleague a course description, which costs goodwill
and protects nothing.

## The event contract, read out of the server

`docs/FLUTTER_APP_PROMPT.md` §5.2 lists the event fields. Four rules it does not mention are
enforced strictly in `backend/app/services/video_monitoring.py`, and each one silently kills
the heartbeat if broken. Miss the beat for two minutes and another device can claim the
stream.

1. **`duration_seconds` must be greater than zero**, or the event is rejected as
   `invalid_event_measurement`. A player reports 0 until its first frame decodes, so
   `PlaybackEvent.isSendable` gates every send and nothing goes out until a duration exists.
2. **`metadata` accepts exactly three keys** — `error_code`, `message`, `reason` — and
   values of at most 200 characters. Any other key fails the whole event. A player error
   message is easily longer than 200 chars, so it is trimmed rather than losing the event.
3. **Every seconds field must be 0..86400.** All four are clamped, so one bad reading from
   the player cannot poison a session's telemetry.
4. **`event_id` dedupe is asymmetric.** Replaying an id against the *same* session is a
   harmless no-op, which is what makes retrying a failed send safe. Reusing one across two
   sessions is `event_id_conflict`. So ids are per-event and a queued retry keeps its
   original id.

There is also an anti-inflation cap: `watched` and `covered` are clamped server-side to
`ceil(elapsed * 2.5) + 5` seconds since the session started. Over-reporting achieves nothing.

## watched vs covered, and why conflating them breaks completion

The server tracks two different numbers:

- **`watched_seconds`** — total time playing. Rewatching a minute five times is five minutes.
- **`covered_seconds`** — the union of parts seen at least once. That same rewatch is one
  minute.

`completion_percent` is computed from **covered**, and an `ended` event below 90% closes the
session as `abandoned` with reason `insufficient_coverage`.

So reporting watched time in the covered field marks a course complete for someone who
looped the intro, and reporting covered in the watched field under-counts real viewing.
`CoverageTracker` keeps disjoint merged spans for coverage and a separate running total for
watched time. A backwards jump, or a forward jump over five seconds, is treated as a seek:
the run so far is banked and a new one opened, so scrubbing from 0:10 to 20:00 credits
neither watched nor covered time for the part that was skipped.

## Suspicious events are throttled, deliberately

Three `suspicious` events in fifteen minutes block playback for the account **and notify
every admin** (`SUSPICIOUS_LIMIT` in `backend/app/api/v1/video.py`). A screen recording that
stays running would otherwise fire on every callback and page the admins over one incident.

So reports are throttled **per reason** on a five minute window: the same condition
repeating is one event, while a genuinely different signal (recording, then a screenshot,
then mirroring) is never swallowed. Real repeat attempts still report once the window passes.

## The audio watermark round-trips against the real decoder

`lib/core/audio/audio_watermark.dart` renders the frame as 16-bit mono 44.1 kHz PCM:
16 tones at `15000 + nibble x 100` Hz, preamble 14800 then 16800, 8 payload nibbles carrying
the account id big-endian plus an XOR checksum, 120 ms tones with 30 ms gaps, gain 0.03.

**Unit tests on the format would not have caught the bug this had.** `tool/verify_watermark.sh`
decodes Dart-generated audio with `backend/tools/decode_audio_watermark.py`, and the first
run failed on all four fixtures. The cause: the decoder scans while
`position + step * 11 < len(samples)`, so a clip that is *exactly* one frame long is never
examined at all. A 250 ms silent tail fixes it, and the same flaw would have lost any frame
sitting at the very end of a recording.

All four fixtures now decode to the right account id, including `0` boundaries and
`4294967295`.

## What was built

```
lib/core/audio/audio_watermark.dart                 encoder, verified against the decoder
lib/features/player/
  data/playback_dto.dart                            event contract incl. the four rules above
  data/playback_repository.dart                     mint + events
  application/coverage_tracker.dart                 watched vs covered
  application/playback_session_controller.dart      heartbeat, retry queue, throttling
  application/playback_guard.dart                   one service over two platform stories
  ui/player_screen.dart                             protections on, mint, play, map refusals
android/.../MainActivity.kt                         FLAG_SECURE + ALLOW_CAPTURE_BY_NONE + API 35 callback
ios/Runner/CaptureGuard.swift                       written, NEVER COMPILED (see below)
tool/verify_watermark.sh                            the watermark acceptance check
```

`screen_protector` 1.5.3 was evaluated and **rejected**. It only wraps `FLAG_SECURE`, which
`MainActivity` already sets; it does not do `ALLOW_CAPTURE_BY_NONE`, which is the protection
that matters most on Android; and it fails to compile against this AGP/Kotlin combination.
The native implementation is the source of truth, as the contract doc itself advises.

## Tests

`flutter test` — **118 passing** (77 from mobile-00..02, 41 new), `flutter analyze` clean,
`tool/verify_watermark.sh` green.

| File | Covers |
|---|---|
| `coverage_tracker_test.dart` | rewatching adds to watched but not covered; seeks credit nothing skipped; completion driven by covered; a small tick gap is not a seek |
| `playback_session_test.dart` | nothing sent while duration is 0; metadata limited to the three allowed keys; over-long messages trimmed; per-reason throttling; `session_closed` stops the session; a network failure queues and replays with the original id |
| `audio_watermark_test.dart` | nibble and tone mapping; WAV header; amplitude stays near -30 dBFS; no click at the edges |

## What hardware has to confirm

Nothing below can be checked on a headless Linux server, and **none of it should be reported
as working until it has been**:

- [ ] A protected lesson plays on Android, watermark visible and not covered by our UI.
- [ ] A screen recording produces a file that is **black and silent**. Both, not either.
- [ ] Heartbeats land every 15s and `frontend/admin/src/pages/VideoReports.jsx` shows the
      session with correct watched seconds.
- [ ] Three suspicious events in 15 minutes block playback and the app explains why.
- [ ] The audio watermark survives a real screen recording, decoded with
      `python -m tools.decode_audio_watermark <recording>`.
- [ ] Widevine level on the test device (L1 vs L3) and what that means for the product.
- [ ] **iOS: none of `CaptureGuard.swift` has ever been compiled.** FairPlay blanking a
      recording is the entire iOS protection story and remains unproven. Milestone 8.

## Deferred

**The watermark is generated but not yet played during a lesson.** The encoder is finished
and verified; scheduling it every 20 seconds needs an audio-playback package, and on Android
the recording is already silent, so the watermark's real value is on iOS. Wiring it is
grouped with iOS bring-up rather than done blind now. This is the one part of the milestone
that is genuinely incomplete rather than merely unverified.

## Still open, and not fixable in the client

- **`mobile_requires_app` must stay off until the apps publish.** Turning it on removes
  protected playback from mobile web entirely. Go-live checklist, not a milestone item.
- **VdoCipher account tier needs confirming in writing** — specifically whether FairPlay
  blanks recordings on this plan. Asked for during M3 so the answer arrives before M8
  rather than at it.
