// The watermark encoder.
//
// The unit assertions below check the wire format in isolation. The assertion that actually
// matters is the round trip against backend/tools/decode_audio_watermark.py, which lives in
// tool/verify_watermark.sh: a format that only this file agrees with cannot read a leak.
import 'dart:io';
import 'dart:typed_data';

import 'package:baytara/core/audio/audio_watermark.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('nibble encoding', () {
    test('an account id becomes 8 big-endian nibbles plus an XOR checksum', () {
      final n = markNibbles(0x12345678);
      expect(n.length, 9);
      expect(n.sublist(0, 8), [1, 2, 3, 4, 5, 6, 7, 8]);
      expect(n.last, 1 ^ 2 ^ 3 ^ 4 ^ 5 ^ 6 ^ 7 ^ 8);
    });

    test('a small id is left-padded, not truncated', () {
      expect(markNibbles(42).sublist(0, 8), [0, 0, 0, 0, 0, 0, 2, 10]);
    });

    test('the checksum of a zero id is zero', () {
      expect(markNibbles(0), List.filled(9, 0));
    });
  });

  group('tone mapping', () {
    test('nibbles map onto the 15.0 to 16.5 kHz band', () {
      expect(toneHz(0), 15000);
      expect(toneHz(15), 16500);
      for (var n = 0; n < 16; n++) {
        expect(toneHz(n), 15000 + n * 100);
      }
    });

    test('a frame is the two preamble tones then nine payload tones', () {
      final tones = frameTones(1);
      expect(tones.length, 11);
      expect(tones[0], 14800, reason: 'sync low');
      expect(tones[1], 16800, reason: 'sync high');
      // The preamble sits outside the payload band, which is what lets the decoder find it.
      expect(tones[0], lessThan(15000));
      expect(tones[1], greaterThan(16500));
    });
  });

  group('the rendered WAV', () {
    test('is a valid 16-bit mono 44.1 kHz file', () {
      final wav = renderWatermarkWav(42);
      final view = ByteData.sublistView(wav);

      expect(String.fromCharCodes(wav.sublist(0, 4)), 'RIFF');
      expect(String.fromCharCodes(wav.sublist(8, 12)), 'WAVE');
      expect(view.getUint16(20, Endian.little), 1, reason: 'PCM');
      expect(view.getUint16(22, Endian.little), 1, reason: 'mono');
      expect(view.getUint32(24, Endian.little), 44100);
      expect(view.getUint16(34, Endian.little), 16, reason: 'bits per sample');
      expect(view.getUint32(4, Endian.little), wav.length - 8);
      expect(view.getUint32(40, Endian.little), wav.length - 44);
    });

    test('is one 1.65 second frame plus a silent tail', () {
      final wav = renderWatermarkWav(42);
      final seconds = (wav.length - 44) / 2 / 44100;
      // The tail is required, not padding for neatness: the decoder scans while
      // `position + step * 11 < len(samples)`, so a clip exactly one frame long is never
      // examined. Verified by tool/verify_watermark.sh.
      expect(seconds, closeTo(1.65 + WatermarkSpec.tailMs / 1000, 0.05));
      expect(WatermarkSpec.repeatEvery.inSeconds, 20,
          reason: 'the table in AUDIO_WATERMARK.md and the web source both say 20');
    });

    test('stays quiet: nothing approaches full scale', () {
      final wav = renderWatermarkWav(0xFFFFFFFF);
      final view = ByteData.sublistView(wav);
      var peak = 0;
      for (var i = 44; i < wav.length; i += 2) {
        final s = view.getInt16(i, Endian.little).abs();
        if (s > peak) peak = s;
      }
      // gain 0.03 of full scale, about -30 dBFS.
      expect(peak, lessThan((32767 * 0.05).round()));
      expect(peak, greaterThan((32767 * 0.02).round()), reason: 'still above the noise floor');
    });

    test('starts and ends at silence, so there is no click', () {
      final wav = renderWatermarkWav(7);
      final view = ByteData.sublistView(wav);
      expect(view.getInt16(44, Endian.little).abs(), lessThan(50));
      expect(view.getInt16(wav.length - 2, Endian.little).abs(), lessThan(50));
    });

    test('the same account always renders identical bytes', () {
      expect(renderWatermarkWav(99), renderWatermarkWav(99));
    });

    test('different accounts render different audio', () {
      expect(renderWatermarkWav(1), isNot(renderWatermarkWav(2)));
    });
  });

  test('writes a fixture the Python decoder can be run against', () {
    // tool/verify_watermark.sh decodes these with the real backend decoder. Written here so
    // the fixtures cannot drift from the encoder they are meant to test.
    final dir = Directory('build/watermark_fixtures')..createSync(recursive: true);
    for (final id in [1, 42, 0x12345678, 4294967295]) {
      File('${dir.path}/account_$id.wav').writeAsBytesSync(renderWatermarkWav(id));
    }
    expect(dir.listSync().length, 4);
  });
}
