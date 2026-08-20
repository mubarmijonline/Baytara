// How much of a lesson has actually been seen.
//
// The server distinguishes two numbers and uses them for different things
// (backend/app/services/video_monitoring.py:record_playback_event):
//
//   watched_seconds  total time spent playing. Rewatching the same minute five times is
//                    five minutes of watching.
//   covered_seconds  the union of the parts seen at least once. Rewatching the same minute
//                    five times is still one minute of coverage.
//
// `completion_percent` is computed from **covered**, and an `ended` event below 90% closes
// the session as `abandoned` with reason `insufficient_coverage`. So reporting watched time
// in the covered field would mark a course complete for someone who looped the intro, and
// reporting covered in the watched field would under-count real viewing.
//
// There is also an anti-inflation cap server-side: both figures are clamped to
// `ceil(elapsed * 2.5) + 5` seconds since the session started. Over-reporting is pointless;
// this class exists to report honestly, not to maximise a number.
import 'dart:math' as math;

/// A half-open interval of the video timeline, in whole seconds.
class _Span {
  _Span(this.start, this.end);
  int start;
  int end;
}

class CoverageTracker {
  CoverageTracker({int durationSeconds = 0}) : _duration = durationSeconds;

  int _duration;

  /// Disjoint, sorted, non-touching spans of the timeline seen at least once.
  final List<_Span> _covered = [];

  /// Total playing time, which double counts a rewatch on purpose.
  int _watched = 0;

  /// Where playback currently is.
  int _position = 0;

  /// Where the current uninterrupted play run began, or null when paused.
  int? _runStart;

  int get durationSeconds => _duration;
  int get positionSeconds => _position;

  set durationSeconds(int value) {
    if (value > _duration) _duration = value;
  }

  int get watchedSeconds => _watched;

  int get coveredSeconds =>
      _covered.fold(0, (sum, span) => sum + (span.end - span.start));

  int get maxPositionSeconds =>
      _covered.isEmpty ? _position : math.max(_position, _covered.last.end);

  /// 0-100, computed the same way the server does.
  int get completionPercent {
    if (_duration <= 0) return 0;
    return math.min((coveredSeconds / _duration * 100).round(), 100);
  }

  /// Playback started or resumed at [second].
  void start(int second) {
    _position = math.max(0, second);
    _runStart = _position;
  }

  /// Playback reached [second]. Called on every position tick.
  ///
  /// A backwards jump or a jump larger than [maxContiguousJump] is treated as a seek: the
  /// run so far is banked and a new one opened. Without that, seeking from 0:10 to 20:00
  /// would mark everything between as both watched and covered.
  void progress(int second, {int maxContiguousJump = 5}) {
    final now = math.max(0, second);
    final runStart = _runStart;

    if (runStart == null) {
      _position = now;
      return;
    }

    final delta = now - _position;
    if (delta < 0 || delta > maxContiguousJump) {
      // A seek. Bank what was genuinely played, then start again from here.
      _bank(runStart, _position);
      _position = now;
      _runStart = now;
      return;
    }

    _watched += delta;
    _position = now;
  }

  /// Playback paused or stopped at the current position.
  void stop() {
    final runStart = _runStart;
    if (runStart != null) _bank(runStart, _position);
    _runStart = null;
  }

  /// Records [start, end] as covered. Watched time is accumulated in [progress] instead,
  /// because a run's length and the span it covers are only the same when nothing repeats.
  void _bank(int start, int end) {
    if (end <= start) return;
    _addSpan(start, end);
  }

  void _addSpan(int start, int end) {
    // Insert, then merge anything that now touches or overlaps, so the list stays a set of
    // disjoint spans and coveredSeconds is a simple sum.
    var i = 0;
    while (i < _covered.length && _covered[i].end < start) {
      i++;
    }
    var newStart = start;
    var newEnd = end;
    while (i < _covered.length && _covered[i].start <= newEnd) {
      newStart = math.min(newStart, _covered[i].start);
      newEnd = math.max(newEnd, _covered[i].end);
      _covered.removeAt(i);
    }
    _covered.insert(i, _Span(newStart, newEnd));
  }

  /// Resuming a lesson: the server hands back `resume_position_seconds`, which says where
  /// to seek but says nothing about what was covered in the earlier session. Coverage
  /// starts empty and the server keeps the running maximum on its side.
  void seekTo(int second) {
    stop();
    _position = math.max(0, second);
  }
}
