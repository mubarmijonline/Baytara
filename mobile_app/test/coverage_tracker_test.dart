// watched vs covered. The server computes completion from *covered* and closes an `ended`
// session below 90% as abandoned, so conflating the two either marks a course complete for
// someone who looped the intro, or under-counts real viewing.
import 'package:baytara/features/player/application/coverage_tracker.dart';
import 'package:flutter_test/flutter_test.dart';

/// Plays second by second from [from] to [to], the way real position ticks arrive.
void play(CoverageTracker t, int from, int to) {
  t.start(from);
  for (var s = from + 1; s <= to; s++) {
    t.progress(s);
  }
  t.stop();
}

void main() {
  test('a straight run counts once in both figures', () {
    final t = CoverageTracker(durationSeconds: 600);
    play(t, 0, 60);
    expect(t.watchedSeconds, 60);
    expect(t.coveredSeconds, 60);
  });

  test('rewatching adds to watched but not to covered', () {
    final t = CoverageTracker(durationSeconds: 600);
    play(t, 0, 60);
    play(t, 0, 60);
    play(t, 0, 60);

    expect(t.watchedSeconds, 180, reason: 'three minutes were genuinely spent watching');
    expect(t.coveredSeconds, 60, reason: 'but only one minute of the lesson was seen');
  });

  test('overlapping runs merge into one span', () {
    final t = CoverageTracker(durationSeconds: 600);
    play(t, 0, 60);
    play(t, 30, 90);
    expect(t.coveredSeconds, 90);
    expect(t.watchedSeconds, 120);
  });

  test('adjacent runs merge, leaving no phantom gap', () {
    final t = CoverageTracker(durationSeconds: 600);
    play(t, 0, 60);
    play(t, 60, 120);
    expect(t.coveredSeconds, 120);
  });

  test('a gap between runs is not covered', () {
    final t = CoverageTracker(durationSeconds: 600);
    play(t, 0, 60);
    play(t, 300, 360);
    expect(t.coveredSeconds, 120, reason: 'the middle four minutes were never seen');
    expect(t.maxPositionSeconds, 360);
  });

  test('a filled-in gap merges the spans either side', () {
    final t = CoverageTracker(durationSeconds: 600);
    play(t, 0, 60);
    play(t, 120, 180);
    expect(t.coveredSeconds, 120);
    play(t, 60, 120);
    expect(t.coveredSeconds, 180, reason: 'the three runs are now one continuous span');
  });

  group('seeking', () {
    test('a forward jump does not credit the skipped part', () {
      final t = CoverageTracker(durationSeconds: 1800);
      t.start(0);
      for (var s = 1; s <= 10; s++) {
        t.progress(s);
      }
      // Scrub from 0:10 to 20:00.
      t.progress(1200);
      for (var s = 1201; s <= 1210; s++) {
        t.progress(s);
      }
      t.stop();

      expect(t.watchedSeconds, 20, reason: 'ten seconds either side of the scrub');
      expect(t.coveredSeconds, 20);
      expect(t.completionPercent, 1);
    });

    test('a backwards jump banks the run so far', () {
      final t = CoverageTracker(durationSeconds: 600);
      t.start(0);
      for (var s = 1; s <= 60; s++) {
        t.progress(s);
      }
      t.progress(0); // scrub back to the start
      for (var s = 1; s <= 30; s++) {
        t.progress(s);
      }
      t.stop();

      expect(t.coveredSeconds, 60, reason: 'the replayed half adds no new coverage');
      expect(t.watchedSeconds, 90);
    });

    test('a small forward gap is treated as a tick, not a seek', () {
      // Position callbacks are not perfectly regular; a two second gap is a slow frame,
      // not the user scrubbing.
      final t = CoverageTracker(durationSeconds: 600);
      t.start(0);
      t.progress(2);
      t.progress(4);
      t.stop();
      expect(t.coveredSeconds, 4);
      expect(t.watchedSeconds, 4);
    });
  });

  group('completion, as the server computes it', () {
    test('is driven by covered, not watched', () {
      final t = CoverageTracker(durationSeconds: 100);
      // Fifty seconds of content, watched four times over.
      play(t, 0, 50);
      play(t, 0, 50);
      play(t, 0, 50);
      play(t, 0, 50);

      expect(t.watchedSeconds, 200);
      expect(t.completionPercent, 50,
          reason: 'looping the first half must not complete the lesson');
    });

    test('reaches the 90% the server needs to mark a session completed', () {
      final t = CoverageTracker(durationSeconds: 100);
      play(t, 0, 91);
      expect(t.completionPercent, 91);
    });

    test('never exceeds 100 even if the reported duration was short', () {
      final t = CoverageTracker(durationSeconds: 50);
      play(t, 0, 80);
      expect(t.completionPercent, 100);
    });

    test('is zero while the duration is still unknown', () {
      // The server rejects any event whose duration_seconds is not > 0, so nothing should
      // be sent in this state anyway.
      final t = CoverageTracker();
      play(t, 0, 30);
      expect(t.completionPercent, 0);
      expect(t.durationSeconds, 0);
    });
  });

  test('duration only ever grows', () {
    final t = CoverageTracker(durationSeconds: 600);
    t.durationSeconds = 300;
    expect(t.durationSeconds, 600, reason: 'a late, smaller reading is not the truth');
    t.durationSeconds = 900;
    expect(t.durationSeconds, 900);
  });

  test('resuming seeks without inventing coverage for the earlier session', () {
    final t = CoverageTracker(durationSeconds: 600);
    t.seekTo(240);
    play(t, 240, 300);
    expect(t.coveredSeconds, 60,
        reason: 'the server keeps the running maximum; the client reports only this session');
    expect(t.positionSeconds, 300);
  });
}
