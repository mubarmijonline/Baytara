# Inaudible audio watermark

Date: 2026-08-10

## Why it exists

A screen recording of a protected lesson comes out with a **black picture and normal sound**.
The picture is blank because decoded video sits in a secure hardware buffer the recorder
cannot read. Audio has no such buffer on any platform, and no browser tells a page that a
recording started — so audio capture cannot be prevented or muted on the mobile web. See
`VIDEO_PROTECTION.md`.

This feature does not try to prevent it. It makes the resulting file **traceable to one
account**, which is what lets you act on a leak.

The mechanism relies on one fact: a phone screen recorder captures the **digital audio mix**,
not a microphone. Anything the page emits is in the recording at full fidelity — including
tones the phone's speaker barely reproduces and most adults cannot hear.

## How it works

While a lesson plays, `frontend/web/src/lib/audioWatermark.js` emits a short burst of high
tones every 90 seconds, encoding the viewer's account id. The id comes from the playback
response (`audio_mark`, issued in `POST /api/v1/video/playback`), so it is the same account
the OTP and the visual watermark were issued to.

Wire format — the encoder and `backend/tools/decode_audio_watermark.py` must agree:

| | |
|---|---|
| Symbol alphabet | 16 tones, `15000 + nibble × 100` Hz (15.0–16.5 kHz) |
| Preamble | 14800 Hz, then 16800 Hz |
| Payload | 8 nibbles — account id as 32-bit big-endian |
| Checksum | 1 nibble — XOR of the payload nibbles |
| Timing | 120 ms tone, 30 ms gap → one frame ≈ 1.65 s |
| Level | gain 0.03 (≈ −30 dBFS), with 8 ms ramps so there is no click |
| Repeat | every 20 s of playback (a 30-second rip must contain a whole frame) |

## Reading a leaked file

```bash
cd backend && python3 -m tools.decode_audio_watermark /path/to/leak.mp4
```

```
2 watermark frame(s) found.
  account id 4242  at 0.43s, 90.43s
```

Any format ffmpeg reads works — the screen recording itself, or audio extracted from it.
`--json` gives machine-readable output. Cross-reference the id with `users.id`.

## Confirmed on real hardware

2026-08-11, iPhone / iOS 18.7 / Safari 26.5.2. A 53-second screen recording of a lesson on
baytara.app decoded to:

```
3 watermark frame(s) found.
  account id 36  at 6.95s, 26.95s, 46.96s
```

The full chain works: Safari emits the tones, the iOS recorder captures them through
HEVC/AAC, the decoder reads the account id back. The recorded picture is black; the account
id is in the sound.

An earlier attempt on the same phone decoded to nothing. Spectrum analysis showed 14–18 kHz
as a flat noise floor with no cliff — the band survived, the tones were never emitted. Cause:
iOS starts an `AudioContext` only inside a user gesture, and ours was created in the player's
`play` handler, which arrives by postMessage from a cross-origin iframe and does not count.
`primeAudioWatermark()` now runs inside the tap. **Recordings made before 2026-08-11 18:08
EEST carry no watermark.**

## What is verified, and what is not

`backend/tests/test_audio_watermark.py` runs the **real browser encoder** inside Chromium via
an `OfflineAudioContext`, mixes it under speech-band content, re-encodes to AAC 128 kbps the
way a phone recorder does, and decodes it back. It asserts the id round-trips, and that clean
audio yields no false positive.

iOS is now confirmed end to end (above). Android is not yet tested — repeat the same
procedure on an Android phone. If a mark is ever missing, check the spectrum first: a flat
noise floor across 14–18 kHz means the tones were not emitted (a client bug), while a cliff
above ~16 kHz means the codec stripped them and `WM.baseHz` must come down on both sides.

## Limits, stated plainly

- It does not stop recording, muting or copying. It attributes.
- Someone who knows the scheme can notch out a 1.5 kHz band and destroy the mark. That costs
  them audio tooling and intent; it is a different adversary from a student with a phone.
- Teenagers may hear 15 kHz. The burst is 1.65 s every 90 s at −30 dBFS, under the narration.
- If the account is shared, the id names the buyer, not the person who recorded it. The
  concurrent-stream limit in `VIDEO_PROTECTION.md` is what keeps those the same person.
