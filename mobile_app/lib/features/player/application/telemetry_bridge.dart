// What turns a player's state into the session events the server is waiting for.
//
// This existed nowhere until now. PlaybackSessionController was written, tested and then
// never called: player_screen wired only onError, so `play`, `pause`, `ended` and every
// position tick were dropped on the floor. The consequences were all silent --
//
//   * reportStart is what starts the 15s heartbeat, so no heartbeat ever ran and the
//     server's sweep marked every session abandoned after 60 seconds of real watching;
//   * coverage stayed at zero, so no lesson ever recorded progress, resume_position_seconds
//     never advanced and no course could complete from the app;
//   * "one stream at a time" saw sessions that looked dead, so it stopped guarding anything.
//
// Both players are ValueNotifiers carrying position, duration, isPlaying and an ended flag,
// so the same rules drive DRM and self-hosted playback. Keeping it here rather than in each
// widget is also what makes it testable: there is no hardware in this repo to run either
// player on.
import '../data/playback_dto.dart';
import 'playback_session_controller.dart';

/// The slice of player state the telemetry rules need. Both `VdoPlayerValue` and
/// `VideoPlayerValue` are adapted into this at the call site.
class PlayerSnapshot {
  const PlayerSnapshot({
    required this.position,
    required this.duration,
    required this.isPlaying,
    this.isEnded = false,
  });

  final Duration position;
  final Duration duration;
  final bool isPlaying;
  final bool isEnded;

  int get positionSeconds => position.inSeconds;
  int get durationSeconds => duration.inSeconds;
}

class PlaybackTelemetryBridge {
  PlaybackTelemetryBridge(this._session);

  final PlaybackSessionController _session;

  bool _playing = false;
  bool _ended = false;

  /// Whether a `play` has landed. Until it has, a pause is nothing to report: pausing
  /// something that never started reads as a stray event in an admin's session view.
  bool _startReported = false;

  /// Feed every value change from the player here. Idempotent: a notifier that fires
  /// repeatedly with the same state produces one event, not one per callback.
  void onSnapshot(PlayerSnapshot s) {
    // The server rejects any event whose duration is not greater than zero, and both
    // players report zero until the first frame is decoded. Reporting `play` in that window
    // would burn the one event that moves the session out of `pending`, so nothing is sent
    // until the duration is real -- including the start, which is deferred rather than lost.
    if (s.durationSeconds <= 0) return;

    _session.onPosition(s.positionSeconds, durationSeconds: s.durationSeconds);

    if (s.isEnded && !_ended) {
      _ended = true;
      _playing = false;
      _session.reportEnded();
      return;
    }

    // A player that loops or is seeked back off the end is playing again, and the second
    // watch has to be reported or its coverage is lost.
    if (!s.isEnded) _ended = false;

    if (s.isPlaying && !_playing) {
      _playing = true;
      _startReported = true;
      _session.reportStart();
      return;
    }

    if (!s.isPlaying && _playing) {
      _playing = false;
      if (_startReported) _session.reportPause();
    }
  }

  /// Leaving the screen mid-lesson. Closes the run so the covered span is banked and the
  /// heartbeat stops, rather than letting the session time out as abandoned.
  void onLeave() {
    if (!_playing || !_startReported) return;
    _playing = false;
    _session.reportPause();
  }

  /// The native capture guard fired and playback was pulled down. The pause is what stops
  /// the heartbeat; the suspicious event is reported separately and is throttled.
  void onBlocked(SuspiciousReason reason) {
    _playing = false;
    _session.reportSuspicious(reason);
  }
}
