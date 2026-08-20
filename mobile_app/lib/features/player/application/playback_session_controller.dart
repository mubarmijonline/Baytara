// ignore_for_file: prefer_initializing_formals
// Drives one playback session: the heartbeat, the event stream, and what happens when the
// server stops accepting either.
//
// The cadence is not a preference. The server treats a session as live for two minutes past
// its last event (CONCURRENT_GRACE in backend/app/api/v1/video.py) and a background sweep
// marks anything idle for 60s as abandoned. Miss the beat and a second device can claim the
// stream out from under this one, so the 15s heartbeat is a hard requirement.
import 'dart:async';

import '../../../core/network/api_error.dart';
import '../data/playback_dto.dart';
import '../data/playback_repository.dart';
import 'coverage_tracker.dart';

/// How the session ended, when it did.
enum SessionOutcome { open, closed, deviceLost, blocked }

class PlaybackSessionController {
  PlaybackSessionController({
    required PlaybackRepository repository,
    required PlaybackSession session,
    required this.onSessionClosed,
    required this.onFatal,
    Duration heartbeat = const Duration(seconds: 15),
    CoverageTracker? tracker,
  })  : _repo = repository,
        _session = session,
        _heartbeatInterval = heartbeat,
        coverage = tracker ?? CoverageTracker();

  final PlaybackRepository _repo;
  final PlaybackSession _session;
  final Duration _heartbeatInterval;

  /// Called when the server says this session is finished and the player must re-mint
  /// rather than keep sending. Retrying a closed session never succeeds.
  final void Function() onSessionClosed;

  /// Called for a refusal the user has to be told about.
  final void Function(ApiErrorCode code) onFatal;

  final CoverageTracker coverage;

  /// The OTP and playbackInfo, exposed for the player widget. Deliberately read-only and
  /// never persisted: an OTP is single-session, short-lived, and every mint counts against
  /// the account's 40-per-hour ceiling.
  String get sessionOtp => _session.otp;
  String get sessionPlaybackInfo => _session.playbackInfo;

  Timer? _timer;
  bool _started = false;
  SessionOutcome outcome = SessionOutcome.open;

  /// Events that failed to send and are worth retrying. They keep their original event_id,
  /// so a replay the server already recorded is a harmless no-op rather than a double count.
  final List<PlaybackEvent> _pending = [];

  /// Suspicious events already reported, by reason, with when. Three within fifteen minutes
  /// blocks playback for the account **and notifies every admin**, so the same condition
  /// firing repeatedly must not be reported repeatedly.
  final Map<SuspiciousReason, DateTime> _lastSuspicious = {};

  /// Visible for testing.
  int sentCount = 0;

  /// The first `play` has not happened yet, so the next start is `play` rather than
  /// `resume`. The server uses both to move the session to `playing`, but the distinction
  /// is what makes an admin report readable.
  bool get _isFirstStart => !_started;

  Future<void> reportStart() async {
    final type = _isFirstStart ? PlaybackEventType.play : PlaybackEventType.resume;
    _started = true;
    coverage.start(coverage.positionSeconds);
    await _send(_build(type));
    _startHeartbeat();
  }

  Future<void> reportPause() async {
    coverage.stop();
    _stopHeartbeat();
    await _send(_build(PlaybackEventType.pause));
  }

  Future<void> reportEnded() async {
    coverage.stop();
    _stopHeartbeat();
    await _send(_build(PlaybackEventType.ended));
  }

  Future<void> reportPlayerError(String errorCode, {String? message}) async {
    coverage.stop();
    _stopHeartbeat();
    await _send(_build(PlaybackEventType.playerError,
        errorCode: errorCode, message: message));
  }

  /// The native guard fired. Playback has already been paused by the caller.
  ///
  /// Throttled per reason: a screen recording that stays on would otherwise fire on every
  /// callback, and three reports in fifteen minutes blocks the account and pages the admins.
  /// A false storm is worse than a missed duplicate, but a genuine new event is never
  /// swallowed.
  Future<void> reportSuspicious(
    SuspiciousReason reason, {
    Duration throttle = const Duration(minutes: 5),
    DateTime? now,
  }) async {
    final at = now ?? DateTime.now();
    final last = _lastSuspicious[reason];
    if (last != null && at.difference(last) < throttle) return;
    _lastSuspicious[reason] = at;
    coverage.stop();
    _stopHeartbeat();
    await _send(_build(PlaybackEventType.suspicious, reason: reason));
  }

  /// Position ticks from the player.
  void onPosition(int seconds, {int? durationSeconds}) {
    if (durationSeconds != null && durationSeconds > 0) {
      coverage.durationSeconds = durationSeconds;
    }
    coverage.progress(seconds);
  }

  void onSeek(int seconds) => coverage.seekTo(seconds);

  PlaybackEvent _build(
    PlaybackEventType type, {
    SuspiciousReason? reason,
    String? errorCode,
    String? message,
  }) =>
      PlaybackEvent(
        type: type,
        positionSeconds: coverage.positionSeconds,
        durationSeconds: coverage.durationSeconds,
        watchedSeconds: coverage.watchedSeconds,
        coveredSeconds: coverage.coveredSeconds,
        reason: reason,
        errorCode: errorCode,
        message: message,
      );

  void _startHeartbeat() {
    _timer?.cancel();
    _timer = Timer.periodic(_heartbeatInterval, (_) {
      _send(_build(PlaybackEventType.heartbeat));
    });
  }

  void _stopHeartbeat() {
    _timer?.cancel();
    _timer = null;
  }

  Future<void> _send(PlaybackEvent event) async {
    // The server rejects any event whose duration is not greater than zero, and a player
    // reports 0 until its first frame is decoded. Sending anyway would burn the event and
    // teach us nothing.
    if (!event.isSendable) return;
    if (outcome != SessionOutcome.open) return;

    // Anything queued from an earlier failure goes first, so the server sees the session in
    // the order it happened.
    final batch = [..._pending, event];
    _pending.clear();

    for (final e in batch) {
      try {
        await _repo.sendEvent(_session.sessionId, e);
        sentCount++;
      } on ApiException catch (err) {
        switch (err.code) {
          case ApiErrorCode.sessionClosed:
          case ApiErrorCode.sessionNotFound:
            // Terminal. Retrying cannot succeed; the player has to stop and re-mint.
            outcome = SessionOutcome.closed;
            _stopHeartbeat();
            onSessionClosed();
            return;

          case ApiErrorCode.deviceMismatch:
          case ApiErrorCode.deviceNotRegistered:
            outcome = SessionOutcome.deviceLost;
            _stopHeartbeat();
            onFatal(err.code);
            return;

          case ApiErrorCode.eventIdConflict:
            // This id already belongs to another session. Never retry it; a fresh event
            // will be built next tick.
            break;

          default:
            if (err.code.indicatesClientBug) {
              // A malformed payload will fail identically forever. Queueing it would block
              // every later event behind it, so it is dropped and asserted in debug.
              assert(false, 'malformed playback event rejected: ${err.code.wire}');
              break;
            }
            // Network or server trouble. Keep it for the next beat.
            _pending.add(e);
        }
      }
    }
  }

  void dispose() {
    _stopHeartbeat();
    coverage.stop();
  }
}
