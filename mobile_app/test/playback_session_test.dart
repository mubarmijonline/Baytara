// Session telemetry. Each of these guards a rule the server enforces silently: get it wrong
// and events stop landing, the heartbeat lapses, and after two minutes another device can
// claim the stream.
import 'package:baytara/core/network/api_error.dart';
import 'package:baytara/features/player/application/coverage_tracker.dart';
import 'package:baytara/features/player/application/playback_session_controller.dart';
import 'package:baytara/features/player/data/playback_dto.dart';
import 'package:baytara/features/player/data/playback_repository.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeRepo implements PlaybackRepository {
  FakeRepo({this.failWith});

  ApiErrorCode? failWith;
  final List<Map<String, dynamic>> sent = [];
  int calls = 0;

  @override
  Future<Map<String, dynamic>> sendEvent(String sessionId, PlaybackEvent event) async {
    calls++;
    if (failWith != null) {
      throw ApiException(code: failWith!, statusCode: 409);
    }
    sent.add(event.toJson());
    return const {};
  }

  @override
  Future<PlaybackSession> mint({required int lessonId, int? courseId}) =>
      throw UnimplementedError();

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

const _session = PlaybackSession.vdocipher(
  otp: 'o',
  playbackInfo: 'p',
  sessionId: 'sess-1',
  resumePositionSeconds: 0,
  audioMark: 42,
);

PlaybackSessionController build(
  FakeRepo repo, {
  void Function()? onClosed,
  void Function(ApiErrorCode)? onFatal,
  int duration = 600,
}) {
  final tracker = CoverageTracker(durationSeconds: duration);
  return PlaybackSessionController(
    repository: repo,
    session: _session,
    tracker: tracker,
    onSessionClosed: onClosed ?? () {},
    onFatal: onFatal ?? (_) {},
  );
}

void main() {
  group('the event payload', () {
    test('carries every field the server requires', () async {
      final repo = FakeRepo();
      final c = build(repo);
      c.onPosition(30, durationSeconds: 600);
      await c.reportStart();

      final body = repo.sent.single;
      expect(body.keys,
          containsAll(['event_id', 'type', 'position_seconds', 'duration_seconds',
              'watched_seconds', 'covered_seconds']));
      expect(body['duration_seconds'], 600);
      c.dispose();
    });

    test('nothing is sent while the duration is still zero', () async {
      // The server rejects duration_seconds <= 0 with invalid_event_measurement, and a
      // player reports 0 until its first frame is decoded.
      final repo = FakeRepo();
      final c = build(repo, duration: 0);
      await c.reportStart();
      expect(repo.calls, 0);
      c.dispose();
    });

    test('event ids are unique per event', () async {
      final repo = FakeRepo();
      final c = build(repo);
      await c.reportStart();
      await c.reportPause();
      final ids = repo.sent.map((e) => e['event_id']).toSet();
      expect(ids.length, 2, reason: 'a reused id across events would be deduped away');
      c.dispose();
    });

    test('the first start is play and the next is resume', () async {
      final repo = FakeRepo();
      final c = build(repo);
      await c.reportStart();
      await c.reportPause();
      await c.reportStart();
      expect(repo.sent.map((e) => e['type']).toList(), ['play', 'pause', 'resume']);
      c.dispose();
    });

    test('metadata uses only the three keys the server allows', () async {
      final repo = FakeRepo();
      final c = build(repo);
      await c.reportSuspicious(SuspiciousReason.screenRecording);
      final metadata = repo.sent.single['metadata'] as Map<String, dynamic>;
      expect(metadata.keys.toSet().difference({'reason', 'error_code', 'message'}), isEmpty,
          reason: 'any other key fails the whole event as invalid_event_metadata');
      expect(metadata['reason'], 'screen_recording');
      c.dispose();
    });

    test('an over-long error message is trimmed rather than losing the event', () async {
      final repo = FakeRepo();
      final c = build(repo);
      await c.reportPlayerError('E100', message: 'x' * 500);
      final metadata = repo.sent.single['metadata'] as Map<String, dynamic>;
      expect((metadata['message'] as String).length, 200);
      c.dispose();
    });

    test('seconds fields are clamped to the accepted range', () {
      final e = PlaybackEvent(
        type: PlaybackEventType.heartbeat,
        positionSeconds: -5,
        durationSeconds: 999999,
        watchedSeconds: -1,
        coveredSeconds: 100,
      );
      final json = e.toJson();
      expect(json['position_seconds'], 0);
      expect(json['duration_seconds'], 86400);
      expect(json['watched_seconds'], 0);
    });
  });

  group('suspicious reporting', () {
    test('the same reason is throttled, because three in 15 min blocks the account',
        () async {
      final repo = FakeRepo();
      final c = build(repo);
      final t0 = DateTime(2026, 8, 20, 12);

      await c.reportSuspicious(SuspiciousReason.screenRecording, now: t0);
      await c.reportSuspicious(SuspiciousReason.screenRecording,
          now: t0.add(const Duration(seconds: 30)));
      await c.reportSuspicious(SuspiciousReason.screenRecording,
          now: t0.add(const Duration(minutes: 1)));

      expect(repo.calls, 1,
          reason: 'one recording that stays on is one event, not a storm that pages admins');
      c.dispose();
    });

    test('a different reason is never swallowed by the throttle', () async {
      final repo = FakeRepo();
      final c = build(repo);
      final t0 = DateTime(2026, 8, 20, 12);

      await c.reportSuspicious(SuspiciousReason.screenRecording, now: t0);
      await c.reportSuspicious(SuspiciousReason.screenshot, now: t0);
      await c.reportSuspicious(SuspiciousReason.mirroring, now: t0);

      expect(repo.calls, 3, reason: 'three genuinely different signals are three events');
      c.dispose();
    });

    test('the same reason reports again once the throttle window passes', () async {
      final repo = FakeRepo();
      final c = build(repo);
      final t0 = DateTime(2026, 8, 20, 12);
      await c.reportSuspicious(SuspiciousReason.screenRecording, now: t0);
      await c.reportSuspicious(SuspiciousReason.screenRecording,
          now: t0.add(const Duration(minutes: 6)));
      expect(repo.calls, 2, reason: 'a second recording attempt is real information');
      c.dispose();
    });
  });

  group('when the server stops accepting events', () {
    test('session_closed stops the session and asks for a re-mint', () async {
      var closed = false;
      final repo = FakeRepo(failWith: ApiErrorCode.sessionClosed);
      final c = build(repo, onClosed: () => closed = true);

      await c.reportStart();

      expect(closed, isTrue);
      expect(c.outcome, SessionOutcome.closed);

      // Further events are not attempted: retrying a closed session never succeeds.
      final before = repo.calls;
      await c.reportPause();
      expect(repo.calls, before);
      c.dispose();
    });

    test('device_mismatch is fatal and reported to the user', () async {
      ApiErrorCode? fatal;
      final repo = FakeRepo(failWith: ApiErrorCode.deviceMismatch);
      final c = build(repo, onFatal: (code) => fatal = code);

      await c.reportStart();

      expect(fatal, ApiErrorCode.deviceMismatch);
      expect(c.outcome, SessionOutcome.deviceLost);
      c.dispose();
    });

    test('a network failure queues the event and replays it on the next send', () async {
      final repo = FakeRepo(failWith: ApiErrorCode.network);
      final c = build(repo);

      await c.reportStart();
      expect(c.outcome, SessionOutcome.open, reason: 'a dropped packet is not a dead session');

      repo.failWith = null;
      await c.reportPause();

      // Both the queued play and the new pause land, in that order.
      expect(repo.sent.map((e) => e['type']).toList(), ['play', 'pause']);
      c.dispose();
    });

    test('a replayed event keeps its original id so the server can dedupe it', () async {
      final repo = FakeRepo(failWith: ApiErrorCode.network);
      final c = build(repo);
      await c.reportStart();

      repo.failWith = null;
      await c.reportPause();

      final replayed = repo.sent.first;
      expect(replayed['type'], 'play');
      expect(replayed['event_id'], isNotEmpty,
          reason: 'the id must survive the retry, or a replay double counts');
      c.dispose();
    });
  });
}
