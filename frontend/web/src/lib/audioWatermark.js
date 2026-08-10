// Inaudible audio watermark.
//
// A phone screen recorder captures the digital audio mix, not a microphone, so anything
// this page emits lands in the recording at full fidelity — including tones the speaker
// barely reproduces and most adults cannot hear. We emit the viewer's account id as a
// short burst of high tones every couple of minutes. A leaked file can then be decoded
// (backend/tools/decode_audio_watermark.py) and traced back to the account.
//
// This does NOT prevent recording. Nothing in a browser can. It makes a leak attributable.
//
// Wire format (keep in sync with the decoder — docs/AUDIO_WATERMARK.md):
//   symbol alphabet : 16 tones, 15000 Hz + nibble * 100 Hz  (15000..16500)
//   preamble        : SYNC_LOW then SYNC_HIGH
//   payload         : 8 nibbles, account id as 32-bit big-endian hex
//   checksum        : 1 nibble, XOR of the payload nibbles
//   timing          : 120 ms tone, 30 ms gap
export const WM = {
  baseHz: 15000,
  stepHz: 100,
  syncLowHz: 14800,
  syncHighHz: 16800,
  toneMs: 120,
  gapMs: 30,
  gain: 0.03, // ~-30 dBFS: inaudible over speech, still well above the noise floor
  repeatMs: 90000,
};

export function markNibbles(accountId) {
  const value = Number(accountId) >>> 0;
  const nibbles = [];
  for (let shift = 28; shift >= 0; shift -= 4) nibbles.push((value >>> shift) & 0xf);
  const checksum = nibbles.reduce((acc, n) => acc ^ n, 0);
  return [...nibbles, checksum];
}

function toneHz(nibble) {
  return WM.baseHz + nibble * WM.stepHz;
}

/** Schedule one frame (preamble + payload + checksum) starting at `startAt`. Exported for the round-trip test. */
export function scheduleFrame(ctx, destination, accountId, startAt) {
  const sequence = [WM.syncLowHz, WM.syncHighHz, ...markNibbles(accountId).map(toneHz)];
  const step = (WM.toneMs + WM.gapMs) / 1000;
  sequence.forEach((hz, index) => {
    const begin = startAt + index * step;
    const end = begin + WM.toneMs / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz;
    // ramp the edges so the burst has no audible click
    gain.gain.setValueAtTime(0, begin);
    gain.gain.linearRampToValueAtTime(WM.gain, begin + 0.008);
    gain.gain.setValueAtTime(WM.gain, end - 0.008);
    gain.gain.linearRampToValueAtTime(0, end);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(begin);
    osc.stop(end + 0.01);
  });
  return startAt + sequence.length * step;
}

export function frameSeconds() {
  return (10 + 1) * (WM.toneMs + WM.gapMs) / 1000; // 2 sync + 8 payload + 1 checksum
}

/**
 * Emit the watermark for as long as the lesson plays.
 * Returns a stop() function; call it on pause, end and unmount.
 */
export function startAudioWatermark(accountId) {
  if (!accountId) return () => {};
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return () => {};

  let ctx;
  try {
    ctx = new Ctx();
  } catch {
    return () => {}; // no audio context (rare, locked-down browsers) — nothing to do
  }
  // Playback always starts from a tap, so the context is allowed to run; resume anyway
  // because iOS suspends it whenever the page was backgrounded.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  let stopped = false;
  let timer;

  const emit = () => {
    if (stopped) return;
    try {
      scheduleFrame(ctx, ctx.destination, accountId, ctx.currentTime + 0.05);
    } catch {
      // a scheduling failure must never interrupt the lesson
    }
    timer = setTimeout(emit, WM.repeatMs);
  };
  emit();

  return () => {
    stopped = true;
    clearTimeout(timer);
    ctx.close().catch(() => {});
  };
}
