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

## What is verified, and what is not

`backend/tests/test_audio_watermark.py` runs the **real browser encoder** inside Chromium via
an `OfflineAudioContext`, mixes it under speech-band content, re-encodes to AAC 128 kbps the
way a phone recorder does, and decodes it back. It asserts the id round-trips, and that clean
audio yields no false positive.

Not yet verified, and only a real device can settle it: that a given phone's screen recorder
preserves the 15–16.5 kHz band in practice. Record a lesson on the target phone and run the
decoder over the file. If the mark is missing, the carrier band is the thing to lower —
`WM.baseHz` in the encoder and the matching constants in the decoder.

## Limits, stated plainly

- It does not stop recording, muting or copying. It attributes.
- Someone who knows the scheme can notch out a 1.5 kHz band and destroy the mark. That costs
  them audio tooling and intent; it is a different adversary from a student with a phone.
- Teenagers may hear 15 kHz. The burst is 1.65 s every 90 s at −30 dBFS, under the narration.
- If the account is shared, the id names the buyer, not the person who recorded it. The
  concurrent-stream limit in `VIDEO_PROTECTION.md` is what keeps those the same person.
