// The inaudible account watermark.
//
// A phone screen recorder captures the digital audio mix, not a microphone, so anything the
// app emits lands in a recording at full fidelity, including tones the speaker barely
// reproduces and most adults cannot hear. A short burst encoding the viewer's account id
// therefore rides along in any rip of the lesson and names the account it came from.
//
// This prevents nothing. On Android the recording is already silent
// (ALLOW_CAPTURE_BY_NONE), so this is the belt for iOS and for any path where that policy
// does not apply. It makes a leak attributable, which is what lets someone act on it.
//
// The wire format must match backend/tools/decode_audio_watermark.py exactly, or a leaked
// file cannot be read. It is ported from frontend/web/src/lib/audioWatermark.js. Note the
// prose in docs/AUDIO_WATERMARK.md says the frame repeats every 90 seconds; its own table
// and the web source both say 20, and 20 is correct: a thirty-second rip has to contain a
// whole frame.
import 'dart:math' as math;
import 'dart:typed_data';

class WatermarkSpec {
  const WatermarkSpec();

  static const int baseHz = 15000;
  static const int stepHz = 100;
  static const int syncLowHz = 14800;
  static const int syncHighHz = 16800;
  static const int toneMs = 120;
  static const int gapMs = 30;

  /// About -30 dBFS: inaudible over speech, still well clear of the noise floor.
  static const double gain = 0.03;

  /// One frame is roughly 1.65s of tone; a 30s rip must contain a whole one.
  static const Duration repeatEvery = Duration(seconds: 20);

  /// Silence appended after the frame.
  ///
  /// Not cosmetic. The decoder scans while `position + step * 11 < len(samples)`, so a clip
  /// that is *exactly* one frame long is never examined at all: the condition is false at
  /// position 0. In a real recording the frame is surrounded by the rest of the audio, but
  /// the rendered clip has to stand on its own, and a frame at the very end of a recording
  /// would be missed for the same reason. A short tail costs nothing and removes both.
  static const int tailMs = 250;

  static const int sampleRate = 44100;
  static const int payloadNibbles = 8;
}

/// The account id as 8 nibbles, big-endian, plus an XOR checksum nibble.
List<int> markNibbles(int accountId) {
  final value = accountId.toUnsigned(32);
  final nibbles = <int>[];
  for (var shift = 28; shift >= 0; shift -= 4) {
    nibbles.add((value >> shift) & 0xF);
  }
  final checksum = nibbles.fold<int>(0, (acc, n) => acc ^ n);
  return [...nibbles, checksum];
}

int toneHz(int nibble) => WatermarkSpec.baseHz + nibble * WatermarkSpec.stepHz;

/// The tones of one whole frame, in order: two preamble tones then the nine payload ones.
List<int> frameTones(int accountId) => [
      WatermarkSpec.syncLowHz,
      WatermarkSpec.syncHighHz,
      ...markNibbles(accountId).map(toneHz),
    ];

/// One frame as a 16-bit mono PCM WAV, ready to hand to an audio player.
///
/// Rendered once per session and replayed, rather than synthesised each time: the bytes are
/// identical for a given account and the encoding is not free on a phone.
Uint8List renderWatermarkWav(int accountId) {
  const rate = WatermarkSpec.sampleRate;
  final toneSamples = (rate * WatermarkSpec.toneMs / 1000).round();
  final gapSamples = (rate * WatermarkSpec.gapMs / 1000).round();
  final tones = frameTones(accountId);
  final tailSamples = (rate * WatermarkSpec.tailMs / 1000).round();
  final total = tones.length * (toneSamples + gapSamples) + tailSamples;

  final pcm = Int16List(total);
  var offset = 0;
  // 8 ms of ramp at each edge, so a burst has no audible click.
  final ramp = (rate * 0.008).round();

  for (final hz in tones) {
    for (var i = 0; i < toneSamples; i++) {
      // A linear ramp in and out; anything sharper is heard as a tick even up here.
      var envelope = 1.0;
      if (i < ramp) {
        envelope = i / ramp;
      } else if (i > toneSamples - ramp) {
        envelope = (toneSamples - i) / ramp;
      }
      final sample =
          math.sin(2 * math.pi * hz * i / rate) * WatermarkSpec.gain * envelope;
      pcm[offset + i] = (sample * 32767).round().clamp(-32768, 32767);
    }
    offset += toneSamples + gapSamples; // the gap stays as silence
  }

  return _wavFromPcm(pcm, rate);
}

Uint8List _wavFromPcm(Int16List pcm, int sampleRate) {
  const headerBytes = 44;
  final dataBytes = pcm.length * 2;
  final out = ByteData(headerBytes + dataBytes);

  void ascii(int at, String s) {
    for (var i = 0; i < s.length; i++) {
      out.setUint8(at + i, s.codeUnitAt(i));
    }
  }

  ascii(0, 'RIFF');
  out.setUint32(4, 36 + dataBytes, Endian.little);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  out.setUint32(16, 16, Endian.little); // PCM chunk size
  out.setUint16(20, 1, Endian.little); // format: PCM
  out.setUint16(22, 1, Endian.little); // mono
  out.setUint32(24, sampleRate, Endian.little);
  out.setUint32(28, sampleRate * 2, Endian.little); // byte rate
  out.setUint16(32, 2, Endian.little); // block align
  out.setUint16(34, 16, Endian.little); // bits per sample
  ascii(36, 'data');
  out.setUint32(40, dataBytes, Endian.little);

  for (var i = 0; i < pcm.length; i++) {
    out.setInt16(headerBytes + i * 2, pcm[i], Endian.little);
  }
  return out.buffer.asUint8List();
}
