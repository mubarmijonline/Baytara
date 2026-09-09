// The wiring between a player and the session events.
//
// This is the piece that did not exist: PlaybackSessionController was written and tested,
// then never called by the player screen, so no session the app ever opened sent a `play`,
// a `pause`, an `ended` or a single heartbeat. Everything below is a rule the server
// enforces silently, which is why none of it surfaced as an error.
import 'package:baytara/core/network/api_error.dart';
import 'package:baytara/features/player/application/playback_session_controller.dart';
import 'package:baytara/features/player/application/telemetry_bridge.dart';
import 'package:baytara/features/player/data/playback_dto.dart';
import 'package:baytara/features/player/data/playback_repository.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeRepo implements PlaybackRepository {
  final List<Map<String, dynamic>> sent = [];

  List<String> get types => sent.map((e) => e['type'] as String).toList();

  @override
  Future<Map<String, dynamic>> sendEvent(String sessionId, PlaybackEvent event) async {
    sent.add(event.toJson());
    return const {};
  }

  @override
  Future<PlaybackSession> mint({required int lessonId, int? courseId}) =>
      throw UnimplementedError();

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

const _session = PlaybackSession.local(
  url: 'https://baytara.app/api/v1/video/hls/12/master.m3u8?t=x',
  sessionId: 'sess-1',
  resumePositionSeconds: 0,
  watermark: 'Someone · ID 7',
);

({PlaybackTelemetryBridge bridge, FakeRepo repo, PlaybackSessionController session})
    build() {
  final repo = FakeRepo();
  final session = PlaybackSessionController(
    repository: repo,
    session: _session,
    onSessionClosed: () {},
    onFatal: (_) {},
  );
  return (bridge: PlaybackTelemetryBridge(session), repo: repo, session: session);
}

PlayerSnapshot snap(int position, int duration,
        {bool playing = true, bool ended = false}) =>
    PlayerSnapshot(
      position: Duration(seconds: position),
      duration: Duration(seconds: duration),
      isPlaying: playing,
      isEnded: ended,
    );

void main() {
  group('telemetry bridge', () {
    test('nothing is sent before the first frame decodes', () async {
      final t = build();
      // Both players report a zero duration until then, and the server rejects any event
      // whose duration is not greater than zero. Sending `play` into that window would burn
      // the one event that moves the session out of pending.
      t.bridge.onSnapshot(snap(0, 0));
      t.bridge.onSnapshot(snap(0, 0));
      await Future<void>.delayed(Duration.zero);
      expect(t.repo.sent, isEmpty);
    });

    test('the start is deferred, not lost, until the duration is real', () async {
      final t = build();
      t.bridge.onSnapshot(snap(0, 0));
      t.bridge.onSnapshot(snap(0, 600));
      await Future<void>.delayed(Duration.zero);
      expect(t.repo.types, ['play']);
    });

    test('a notifier firing repeatedly produces one play, not one per callback', () async {
      final t = build();
      for (var i = 0; i < 5; i++) {
        t.bridge.onSnapshot(snap(i, 600));
      }
      await Future<void>.delayed(Duration.zero);
      expect(t.repo.types, ['play']);
    });

    test('pausing reports a pause and resuming reports a resume', () async {
      final t = build();
      t.bridge.onSnapshot(snap(0, 600));
      t.bridge.onSnapshot(snap(30, 600, playing: false));
      t.bridge.onSnapshot(snap(30, 600));
      await Future<void>.delayed(Duration.zero);
      // The server takes both play and resume as "playing"; the distinction is what makes
      // an admin's session view readable.
      expect(t.repo.types, ['play', 'pause', 'resume']);
    });

    test('a pause before any play is not reported', () async {
      final t = build();
      // Pausing something that never started reads as a stray event in a session view.
      t.bridge.onSnapshot(snap(0, 600, playing: false));
      await Future<void>.delayed(Duration.zero);
      expect(t.repo.sent, isEmpty);
    });

    test('the end is reported once', () async {
      final t = build();
      t.bridge.onSnapshot(snap(0, 600));
      t.bridge.onSnapshot(snap(600, 600, playing: false, ended: true));
      t.bridge.onSnapshot(snap(600, 600, playing: false, ended: true));
      await Future<void>.delayed(Duration.zero);
      expect(t.repo.types, ['play', 'ended']);
    });

    test('a rewatch after the end is reported again', () async {
      final t = build();
      t.bridge.onSnapshot(snap(0, 600));
      t.bridge.onSnapshot(snap(600, 600, playing: false, ended: true));
      // Seeked back and played again. Without this the second watch's coverage is lost.
      t.bridge.onSnapshot(snap(0, 600));
      await Future<void>.delayed(Duration.zero);
      // `resume` rather than a second `play`: the controller keeps the distinction so an
      // admin's session view shows one viewing that restarted, not two viewings.
      expect(t.repo.types, ['play', 'ended', 'resume']);
    });

    test('position ticks drive coverage, and a seek banks rather than invents it', () async {
      final t = build();
      for (var i = 0; i <= 20; i++) {
        t.bridge.onSnapshot(snap(i, 600));
      }
      // Jumped from 0:20 to 5:00. Everything between was skipped and must not be credited.
      t.bridge.onSnapshot(snap(300, 600));
      t.bridge.onSnapshot(snap(301, 600));
      await Future<void>.delayed(Duration.zero);

      expect(t.session.coverage.watchedSeconds, 21);
      expect(t.session.coverage.coveredSeconds, lessThan(30));
      expect(t.session.coverage.durationSeconds, 600);
    });

    test('leaving mid-lesson pauses rather than letting the session time out', () async {
      final t = build();
      // Ticked a second at a time, as a real player does. A single 45-second jump is a
      // SEEK to the coverage tracker and banks nothing, which is the correct reading of it.
      for (var i = 0; i <= 45; i++) {
        t.bridge.onSnapshot(snap(i, 600));
      }
      t.bridge.onLeave();
      await Future<void>.delayed(Duration.zero);
      // A session with no closing event is swept as abandoned 60s later, losing the run.
      expect(t.repo.types, ['play', 'pause']);
      expect(t.repo.sent.last['covered_seconds'], 45);
    });

    test('leaving without having played sends nothing', () async {
      final t = build();
      t.bridge.onLeave();
      await Future<void>.delayed(Duration.zero);
      expect(t.repo.sent, isEmpty);
    });

    test('a capture reports suspicious and stops the run', () async {
      final t = build();
      t.bridge.onSnapshot(snap(0, 600));
      t.bridge.onSnapshot(snap(20, 600));
      t.bridge.onBlocked(SuspiciousReason.screenRecording);
      await Future<void>.delayed(Duration.zero);
      expect(t.repo.types, ['play', 'suspicious']);
      expect(t.repo.sent.last['metadata'], {'reason': 'screen_recording'});
    });

    test('a closed session stops the bridge sending anything further', () async {
      final repo = FakeRepo();
      final session = PlaybackSessionController(
        repository: repo,
        session: _session,
        onSessionClosed: () {},
        onFatal: (_) {},
      );
      final bridge = PlaybackTelemetryBridge(session);
      bridge.onSnapshot(snap(0, 600));
      await Future<void>.delayed(Duration.zero);
      session.outcome = SessionOutcome.closed;
      bridge.onSnapshot(snap(30, 600, playing: false));
      await Future<void>.delayed(Duration.zero);
      expect(repo.types, ['play']);
    });
  });

  group('ApiErrorCode still routes playback refusals', () {
    test('no_video is a real refusal a self-hosted lesson can hit while packaging', () {
      // source=local answers no_video until local_status is "ready".
      expect(ApiErrorCode.noVideo.wire, 'no_video');
    });
  });
}
