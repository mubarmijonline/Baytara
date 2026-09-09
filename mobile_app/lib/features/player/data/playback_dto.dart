// The playback contract: what POST /video/playback returns, and what the event endpoint
// will accept.
//
// The event payload rules below are enforced strictly server-side
// (backend/app/services/video_monitoring.py). Getting any of them wrong means the event is
// rejected, the heartbeat stops landing, and after two minutes another device can claim the
// stream. So they are encoded here rather than left to each call site.
import 'package:uuid/uuid.dart';

import '../../../core/network/media_url.dart';

/// Which delivery path the server picked for this lesson.
///
/// Set on the lesson row (`Lesson.source` in backend/app/models/catalog.py), not chosen by
/// the client, and the two answers have nothing in common past the session id: VdoCipher
/// returns an OTP for its own player, self-hosted returns a URL to our encrypted HLS.
enum PlaybackKind {
  vdocipher,
  local;

  /// The VdoCipher response carries no `kind` key at all -- it predates the second path --
  /// so an absent value means VdoCipher rather than "unknown".
  static PlaybackKind fromWire(String? wire) =>
      wire == 'local' ? PlaybackKind.local : PlaybackKind.vdocipher;
}

/// A minted playback session. Everything here is short-lived and none of it is persisted:
/// the OTP is single-session, the HLS token expires, and the server counts every mint
/// against 40 per hour.
///
/// The two named constructors exist so a session cannot be *built* holding the wrong half
/// of the contract -- there is no way to make a local session carrying an OTP, or a DRM one
/// carrying a playlist URL. The fields themselves stay nullable, so reading the wrong half
/// still compiles; [kind] is what a caller switches on, and player_screen does.
class PlaybackSession {
  const PlaybackSession._({
    required this.kind,
    required this.sessionId,
    required this.resumePositionSeconds,
    this.otp,
    this.playbackInfo,
    this.url,
    this.watermark,
    this.audioMark,
  });

  /// DRM delivery: the provider's player is handed an OTP and playbackInfo, and the
  /// provider bakes the viewer watermark into the stream itself.
  const PlaybackSession.vdocipher({
    required String otp,
    required String playbackInfo,
    required String sessionId,
    required int resumePositionSeconds,
    int? audioMark,
  }) : this._(
          kind: PlaybackKind.vdocipher,
          otp: otp,
          playbackInfo: playbackInfo,
          sessionId: sessionId,
          resumePositionSeconds: resumePositionSeconds,
          audioMark: audioMark,
        );

  /// Self-hosted delivery: AES-128 encrypted HLS from our own server, every playlist,
  /// segment and key URI carrying the signed token in [url]'s query.
  ///
  /// There is no provider to bake in a watermark here, so [watermark] arrives as text and
  /// **this app is what draws it**. Dropping it would ship the self-hosted path with
  /// strictly weaker attribution than the DRM one.
  const PlaybackSession.local({
    required String url,
    required String sessionId,
    required int resumePositionSeconds,
    String? watermark,
    int? audioMark,
  }) : this._(
          kind: PlaybackKind.local,
          url: url,
          watermark: watermark,
          sessionId: sessionId,
          resumePositionSeconds: resumePositionSeconds,
          audioMark: audioMark,
        );

  /// Parses either shape.
  ///
  /// This used to read `j['otp'] as String` unconditionally. Against a self-hosted lesson
  /// that is a TypeError, not an ApiException, so it escaped the player's `on ApiException`
  /// catch and took the screen down: every locally hosted video was unplayable in the app
  /// from the moment the second delivery path shipped.
  factory PlaybackSession.fromJson(Map<String, dynamic> j) {
    final sessionId = j['session_id'] as String;
    final resume = (j['resume_position_seconds'] as num?)?.toInt() ?? 0;
    // The account id, encoded into the inaudible audio watermark so a screen recording
    // still names the account it came from. Sent on both paths.
    final audioMark = (j['audio_mark'] as num?)?.toInt();

    if (PlaybackKind.fromWire(j['kind'] as String?) == PlaybackKind.local) {
      return PlaybackSession.local(
        // The server sends this relative ("/api/v1/video/hls/12/master.m3u8?t=..."), and a
        // player cannot open a relative path any more than NetworkImage can.
        url: resolveMediaUrl(j['url'] as String?)!,
        watermark: (j['watermark'] as String?)?.trim(),
        sessionId: sessionId,
        resumePositionSeconds: resume,
        audioMark: audioMark,
      );
    }
    return PlaybackSession.vdocipher(
      otp: j['otp'] as String,
      playbackInfo: j['playbackInfo'] as String,
      sessionId: sessionId,
      resumePositionSeconds: resume,
      audioMark: audioMark,
    );
  }

  final PlaybackKind kind;

  /// VdoCipher only.
  final String? otp;
  final String? playbackInfo;

  /// Self-hosted only: the absolute master playlist URL, token already in the query.
  final String? url;

  /// Self-hosted only: the viewer text this app must draw over the picture.
  final String? watermark;

  /// The server's public session id, used in the events URL. The only field the two paths
  /// share, and the reason all the telemetry below is delivery-agnostic.
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
