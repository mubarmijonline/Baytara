#!/usr/bin/env python3
"""Read the inaudible account watermark out of a leaked recording.

    python -m tools.decode_audio_watermark leak.mp4
    python -m tools.decode_audio_watermark leak.m4a --json

Takes any file ffmpeg can read (screen recording, extracted audio), finds every
watermark frame emitted by frontend/web/src/lib/audioWatermark.js, and prints the
account ids it carries. Wire format lives in docs/AUDIO_WATERMARK.md.

Pure stdlib — Goertzel over 10 ms hops, no numpy needed.
"""
import argparse
import json
import math
import struct
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

# keep in sync with frontend/web/src/lib/audioWatermark.js
BASE_HZ = 15000
STEP_HZ = 100
SYNC_LOW_HZ = 14800
SYNC_HIGH_HZ = 16800
TONE_MS = 120
GAP_MS = 30
SYMBOLS = 16
PAYLOAD_NIBBLES = 8

SAMPLE_RATE = 44100
HOP_MS = 10
# a tone must beat the surrounding band by this ratio to count as present
DETECT_RATIO = 3.0


def extract_pcm(path):
    """Decode any media file to mono 44.1 kHz 16-bit PCM via ffmpeg."""
    def run(wav_path):
        cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(path),
               "-ac", "1", "-ar", str(SAMPLE_RATE), "-c:a", "pcm_s16le", wav_path]
        subprocess.run(cmd, check=True, capture_output=True)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = tmp.name
    try:
        run(wav_path)
    except (subprocess.CalledProcessError, PermissionError, OSError):
        # some environments deny writes to the system temp dir — fall back beside the input
        Path(wav_path).unlink(missing_ok=True)
        wav_path = str(Path(path).with_suffix(".watermark-probe.wav"))
        run(wav_path)
    with wave.open(wav_path, "rb") as wav:
        frames = wav.readframes(wav.getnframes())
        samples = list(struct.unpack("<%dh" % (len(frames) // 2), frames))
    Path(wav_path).unlink(missing_ok=True)
    return samples


def goertzel(samples, start, length, freq, rate=SAMPLE_RATE):
    """Energy at one frequency over samples[start:start+length]."""
    k = int(0.5 + (length * freq) / rate)
    omega = (2.0 * math.pi * k) / length
    coeff = 2.0 * math.cos(omega)
    s1 = s2 = 0.0
    for i in range(start, min(start + length, len(samples))):
        s0 = samples[i] + coeff * s1 - s2
        s2, s1 = s1, s0
    return s1 * s1 + s2 * s2 - coeff * s1 * s2


def tone_frequencies():
    return [BASE_HZ + n * STEP_HZ for n in range(SYMBOLS)]


def read_symbol(samples, start):
    """Strongest watermark tone in the window, or None if none stands out."""
    window = int(SAMPLE_RATE * TONE_MS / 1000)
    if start + window > len(samples):
        return None, 0.0
    energies = [goertzel(samples, start, window, hz) for hz in tone_frequencies()]
    best = max(range(SYMBOLS), key=lambda i: energies[i])
    others = sorted(energies)[:-1]
    floor = (sum(others) / len(others)) or 1e-9
    if energies[best] < floor * DETECT_RATIO:
        return None, energies[best]
    return best, energies[best]


def _sync_at(samples, position):
    """True if the two preamble tones sit at this position."""
    window = int(SAMPLE_RATE * TONE_MS / 1000)
    step = int(SAMPLE_RATE * (TONE_MS + GAP_MS) / 1000)
    if position + step + window > len(samples):
        return False
    low = goertzel(samples, position, window, SYNC_LOW_HZ)
    high = goertzel(samples, position + step, window, SYNC_HIGH_HZ)
    if low <= 0 or high <= 0:
        return False
    # both preamble tones must beat the payload band at their own position
    low_floor = max(goertzel(samples, position, window, hz) for hz in tone_frequencies())
    high_floor = max(goertzel(samples, position + step, window, hz) for hz in tone_frequencies())
    return low > low_floor * DETECT_RATIO and high > high_floor * DETECT_RATIO


def decode(samples):
    """Every account id found, with the second it was heard at."""
    step = int(SAMPLE_RATE * (TONE_MS + GAP_MS) / 1000)
    hop = int(SAMPLE_RATE * HOP_MS / 1000)
    found = []
    position = 0
    while position + step * 11 < len(samples):
        if not _sync_at(samples, position):
            position += hop
            continue
        nibbles = []
        for index in range(PAYLOAD_NIBBLES + 1):
            symbol, _ = read_symbol(samples, position + step * (2 + index))
            if symbol is None:
                break
            nibbles.append(symbol)
        if len(nibbles) == PAYLOAD_NIBBLES + 1:
            payload, checksum = nibbles[:PAYLOAD_NIBBLES], nibbles[-1]
            expected = 0
            for n in payload:
                expected ^= n
            if expected == checksum:
                account = 0
                for n in payload:
                    account = (account << 4) | n
                found.append({"account_id": account, "at_seconds": round(position / SAMPLE_RATE, 2)})
                position += step * 11
                continue
        position += hop
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file", help="recording to inspect (any format ffmpeg reads)")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args()

    samples = extract_pcm(args.file)
    marks = decode(samples)

    if args.json:
        print(json.dumps({"marks": marks}, ensure_ascii=False))
        return 0 if marks else 1

    if not marks:
        print("No watermark found. The recording may predate the watermark, or the "
              "recorder's codec stripped the band — check with --json and a spectrogram.")
        return 1
    accounts = sorted({m["account_id"] for m in marks})
    print(f"{len(marks)} watermark frame(s) found.")
    for account in accounts:
        times = [m["at_seconds"] for m in marks if m["account_id"] == account]
        print(f"  account id {account}  at {', '.join(f'{t}s' for t in times[:8])}"
              + (" ..." if len(times) > 8 else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
