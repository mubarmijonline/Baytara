// The two shapes POST /video/playback can answer with.
//
// The bug pinned here made every self-hosted lesson unplayable in the app. The parser read
// `j['otp'] as String` unconditionally, which against a kind:"local" response is a
// TypeError -- not an ApiException -- so it went straight past the player's
// `on ApiException` catch and took the screen down with no refusal message and nothing
// reported. It shipped the moment the second delivery path did, and no test would have
// caught it because no test fed the parser a local response.
import 'package:baytara/features/player/data/playback_dto.dart';
import 'package:flutter_test/flutter_test.dart';

/// Trimmed from backend/app/api/v1/video.py, the VdoCipher branch. Note it carries no
/// `kind` key at all: it predates the second path, which is why an absent kind must mean
/// VdoCipher rather than "unknown".
const _vdocipher = {
  'otp': '20160313versASE323',
  'playbackInfo': 'eyJ2aWRlb0lkIjoiMTIzIn0=',
  'session_id': 'sess-abc',
  'resume_position_seconds': 0,
  'audio_mark': 42,
};

/// The self-hosted branch of the same endpoint. The URL is RELATIVE on the wire.
const _local = {
  'kind': 'local',
  'url': '/api/v1/video/hls/12/master.m3u8?t=12.7.sess-abc.1790000000.abcdef',
  'session_id': 'sess-abc',
  'resume_position_seconds': 95,
  'audio_mark': 7,
  'watermark': '  Ahmed Diab · a@b.com · +201000000000 · ID 7  ',
};

void main() {
  group('delivery kind', () {
    test('a response with no kind is the DRM path', () {
      final s = PlaybackSession.fromJson(Map<String, dynamic>.from(_vdocipher));
      expect(s.kind, PlaybackKind.vdocipher);
      expect(s.otp, '20160313versASE323');
      expect(s.playbackInfo, 'eyJ2aWRlb0lkIjoiMTIzIn0=');
      expect(s.url, isNull);
      expect(s.watermark, isNull);
    });

    test('a local response parses instead of throwing', () {
      // The regression. Before the fix this line threw a TypeError on the missing otp.
      final s = PlaybackSession.fromJson(Map<String, dynamic>.from(_local));
      expect(s.kind, PlaybackKind.local);
      expect(s.otp, isNull);
      expect(s.playbackInfo, isNull);
    });

    test('the relative playlist URL is resolved against the API origin', () {
      final s = PlaybackSession.fromJson(Map<String, dynamic>.from(_local));
      // A player can no more open a relative path than NetworkImage can.
      expect(s.url, startsWith('https://'));
      expect(s.url, endsWith('/api/v1/video/hls/12/master.m3u8'
          '?t=12.7.sess-abc.1790000000.abcdef'));
    });

    test('an absolute URL is left alone', () {
      final s = PlaybackSession.fromJson({
        ..._local,
        'url': 'https://cdn.example.com/hls/master.m3u8?t=x',
      });
      expect(s.url, 'https://cdn.example.com/hls/master.m3u8?t=x');
    });

    test('both paths share the fields the telemetry is keyed on', () {
      final drm = PlaybackSession.fromJson(Map<String, dynamic>.from(_vdocipher));
      final local = PlaybackSession.fromJson(Map<String, dynamic>.from(_local));
      expect(drm.sessionId, local.sessionId);
      expect(local.resumePositionSeconds, 95);
      expect(drm.audioMark, 42);
      expect(local.audioMark, 7);
    });

    test('the watermark is trimmed, because this app is what draws it', () {
      final s = PlaybackSession.fromJson(Map<String, dynamic>.from(_local));
      expect(s.watermark, 'Ahmed Diab · a@b.com · +201000000000 · ID 7');
    });

    test('a local response with no watermark is not a parse failure', () {
      final j = Map<String, dynamic>.from(_local)..remove('watermark');
      expect(PlaybackSession.fromJson(j).watermark, isNull);
    });

    test('an unknown kind falls back to the DRM path rather than throwing', () {
      // Failing closed: a future delivery name must not crash an older build.
      expect(PlaybackKind.fromWire('something_new'), PlaybackKind.vdocipher);
      expect(PlaybackKind.fromWire(null), PlaybackKind.vdocipher);
    });
  });
}
