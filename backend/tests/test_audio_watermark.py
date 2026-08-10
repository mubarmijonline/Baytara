"""Round-trip self-check for the inaudible account watermark.

Runs the REAL browser encoder (frontend/web/src/lib/audioWatermark.js) inside Chromium
via an OfflineAudioContext, mixes it under speech-band content, squeezes the result
through AAC the way a phone screen recorder would, and decodes it with
tools/decode_audio_watermark.py. Proves the JS encoder and the Python decoder agree on
the wire format, and that the mark survives lossy compression.

    python3 -m tests.test_audio_watermark       (needs ffmpeg; no DB)

Run with the system python3, not backend/.venv — playwright is installed there.
"""
import math
import struct
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

from tools.decode_audio_watermark import decode, extract_pcm, SAMPLE_RATE

ENCODER = Path(__file__).resolve().parents[2] / "frontend/web/src/lib/audioWatermark.js"
ACCOUNT_ID = 4242
SECONDS = 4


def render_in_browser():
    """Render one watermark frame with the production encoder; returns float samples."""
    from playwright.sync_api import sync_playwright

    source = ENCODER.read_text().replace("export const", "const").replace("export function", "function")
    page_js = f"""
      {source}
      window.__render = async () => {{
        const rate = {SAMPLE_RATE};
        const ctx = new OfflineAudioContext(1, rate * {SECONDS}, rate);
        // lesson-like content underneath: a speech-band tone plus noise, well above the mark
        const speech = ctx.createOscillator();
        const speechGain = ctx.createGain();
        speech.frequency.value = 700;
        speechGain.gain.value = 0.25;
        speech.connect(speechGain); speechGain.connect(ctx.destination);
        speech.start(0); speech.stop({SECONDS});
        scheduleFrame(ctx, ctx.destination, {ACCOUNT_ID}, 0.5);
        const buffer = await ctx.startRendering();
        return Array.from(buffer.getChannelData(0));
      }};
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("about:blank")
        page.add_script_tag(content=page_js)
        samples = page.evaluate("window.__render()")
        browser.close()
    return samples


def write_wav(path, samples):
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        clipped = [max(-1.0, min(1.0, s)) for s in samples]
        wav.writeframes(struct.pack("<%dh" % len(clipped), *[int(s * 32767) for s in clipped]))


def demo():
    samples = render_in_browser()
    assert len(samples) == SAMPLE_RATE * SECONDS, len(samples)
    peak = max(abs(s) for s in samples)
    assert peak < 0.9, f"output clipping, peak={peak}"

    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / "clean.wav"
        write_wav(raw, samples)

        # 1. clean signal decodes
        marks = decode(extract_pcm(raw))
        assert marks, "watermark not found in the clean render"
        assert marks[0]["account_id"] == ACCOUNT_ID, marks
        print(f"clean render      -> account {marks[0]['account_id']} at {marks[0]['at_seconds']}s")

        # 2. and survives what a screen recorder does to it (AAC 128 kbps)
        compressed = Path(tmp) / "recorded.m4a"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw),
                        "-c:a", "aac", "-b:a", "128k", str(compressed)], check=True)
        marks = decode(extract_pcm(compressed))
        assert marks, "watermark did not survive AAC 128k — lower the carrier band"
        assert marks[0]["account_id"] == ACCOUNT_ID, marks
        print(f"after AAC 128kbps -> account {marks[0]['account_id']} at {marks[0]['at_seconds']}s")

        # 3. audio without a mark must not produce one
        silent = [0.25 * math.sin(2 * math.pi * 700 * i / SAMPLE_RATE) for i in range(SAMPLE_RATE * 2)]
        plain = Path(tmp) / "plain.wav"
        write_wav(plain, silent)
        assert decode(extract_pcm(plain)) == [], "false positive on unmarked audio"
        print("unmarked audio    -> no false positive")

    print("audio watermark self-check OK")


if __name__ == "__main__":
    sys.exit(demo())
