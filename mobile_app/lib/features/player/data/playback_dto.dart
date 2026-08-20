// The playback contract: what POST /video/playback returns, and what the event endpoint
// will accept.
//
// The event payload rules below are enforced strictly server-side
// (backend/app/services/video_monitoring.py). Getting any of them wrong means the event is
// rejected, the heartbeat stops landing, and after two minutes another device can claim the
// stream. So they are encoded here rather than left to each call site.
import 'package:uuid/uuid.dart';

/// A minted playback session. Everything here is short-lived and none of it is persisted:
/// the OTP is single-session and the server counts every mint against 40 per hour.
class PlaybackSession {
  const PlaybackSession({
    required this.otp,
    required this.playbackInfo,
    required this.sessionId,
    required this.resumePositionSeconds,
    required this.audioMark,
  });

  factory PlaybackSession.fromJson(Map<String, dynamic> j) => PlaybackSession(
        otp: j['otp'] as String,
        playbackInfo: j['playbackInfo'] as String,
        sessionId: j['session_id'] as String,
        resumePositionSeconds: (j['resume_position_seconds'] as num?)?.toInt() ?? 0,
        // The account id, encoded into the inaudible audio watermark so a screen recording
        // still names the account it came from.
        audioMark: (j['audio_mark'] as num?)?.toInt(),
      );

  final String otp;
  final String playbackInfo;

  /// The server's public session id, used in the events URL.
  final String sessionId;

  /// Seek here before the first frame when greater than zero.
  final int resumePositionSeconds;
  final int? audioMark;
}

/// The event types the server accepts. Anything else is `invalid_event_type`.
enum PlaybackEventType {
  play,
  pause,
  resume,
  heartbeat,
  ended,
  playerError('player_error'),
  suspicious;

  const PlaybackEventType([this._wire]);
  final String? _wire;
  String get wire => _wire ?? name;
}

/// Why the native guard fired. Sent as `metadata.reason`.
///
/// The server allows exactly three metadata keys (`error_code`, `message`, `reason`) and
/// rejects the whole event with `invalid_event_metadata` for any other key, or for a value
/// over 200 characters.
enum SuspiciousReason {
  screenRecording('screen_recording'),
  screenshot('screenshot'),
  mirroring('mirroring'),
  background('background');

  const SuspiciousReason(this.wire);
  final String wire;
}

class PlaybackEvent {
  PlaybackEvent({
    required this.type,
    required this.positionSeconds,
    required this.durationSeconds,
    required this.watchedSeconds,
    required this.coveredSeconds,
    this.reason,
    this.errorCode,
    this.message,
    String? eventId,
  }) : eventId = eventId ?? const Uuid().v4();

  /// A v4 UUID, unique per event. The server dedupes on it: replaying the same id against
  /// the same session is a no-op, which is what makes retrying a failed send safe. Reusing
  /// an id across two sessions is `event_id_conflict`, so it is generated per event and
  /// never recycled.
  final String eventId;

  final PlaybackEventType type;
  final int positionSeconds;

  /// Must be greater than zero or the server rejects the event with
  /// `invalid_event_measurement`. Nothing may be sent before the player reports a duration.
  final int durationSeconds;

  final int watchedSeconds;
  final int coveredSeconds;
  final SuspiciousReason? reason;
  final String? errorCode;
  final String? message;

  /// Every seconds field is clamped to the server's accepted range so a bad reading from
  /// the player cannot poison a whole session's telemetry.
  static int _clamp(int v) => v < 0 ? 0 : (v > 86400 ? 86400 : v);

  Map<String, dynamic> toJson() => {
        'event_id': eventId,
        'type': type.wire,
        'position_seconds': _clamp(positionSeconds),
        'duration_seconds': _clamp(durationSeconds),
        'watched_seconds': _clamp(watchedSeconds),
        'covered_seconds': _clamp(coveredSeconds),
        if (reason != null || errorCode != null || message != null)
          'metadata': {
            if (reason != null) 'reason': reason!.wire,
            if (errorCode != null) 'error_code': _trim(errorCode!),
            if (message != null) 'message': _trim(message!),
          },
      };

  /// The server refuses a metadata value over 200 characters. A player error message can
  /// easily be longer, and losing the whole event to that would be worse than losing the
  /// tail of the string.
  static String _trim(String v) => v.length <= 200 ? v : v.substring(0, 200);

  /// True when this event may be sent at all. The duration rule is the one that bites:
  /// a player reports 0 until its first frame is decoded.
  bool get isSendable => durationSeconds > 0;
}
