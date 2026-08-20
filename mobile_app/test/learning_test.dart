// Learning parsing. The rule most likely to be got wrong is at the top: a free course
// produces no enrolment at all, and reading that null as a failure would show an error for
// the successful case.
import 'package:baytara/features/learning/data/learning_dto.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('enrolling', () {
    test('a free course succeeds with no enrolment row', () {
      // backend/app/api/v1/learning.py: "A course with no fee is not joined at all."
      final r = EnrollResult.fromJson({'enrollment': null, 'free': true});
      expect(r.isFreeContent, isTrue);
      expect(r.enrollment, isNull,
          reason: 'null here is success, not failure: free courses are watched, not joined');
    });

    test('a paid course returns the enrolment', () {
      final r = EnrollResult.fromJson({
        'enrollment': {
          'id': 5,
          'status': 'active',
          'is_expired': false,
          'expires_at': '2026-12-01T00:00:00+00:00',
          'progress': {'percent': 40, 'completed_lessons': 4, 'total_lessons': 10},
          'course': {'id': 1, 'title': 't', 'slug': 's', 'description': ''},
        },
      });
      expect(r.isFreeContent, isFalse);
      expect(r.enrollment!.id, 5);
      expect(r.enrollment!.progress.completedLessons, 4);
    });
  });

  group('enrolment', () {
    test('a null expiry means lifetime, not expired', () {
      final e = Enrollment.fromJson({
        'id': 1, 'status': 'active', 'is_expired': false,
        'expires_at': null, 'progress': {},
      });
      expect(e.isLifetime, isTrue);
      expect(e.isExpired, isFalse);
    });

    test('an expired enrolment is still an enrolment', () {
      // The user is a past customer, so the route back is renewal, not a fresh purchase.
      final e = Enrollment.fromJson({
        'id': 1, 'status': 'active', 'is_expired': true,
        'expires_at': '2026-01-01T00:00:00+00:00', 'progress': {},
      });
      expect(e.isExpired, isTrue);
      expect(e.isLifetime, isFalse);
    });
  });

  group('learning summary', () {
    test('reads the three tiles and the resume point', () {
      final s = LearningSummary.fromJson({
        'courses_enrolled': 3,
        'watched_hours': 12,
        'streak_days': 4,
        'resume': {
          'course': {'id': 7, 'slug': 'anatomy', 'title': 'تشريح'},
          'lesson': {'id': 22, 'title': 'الدرس الثاني', 'poster': null},
          'lesson_index': 2,
          'total_lessons': 10,
          'remaining_lessons': 8,
          'percent': 20,
        },
      });
      expect(s.coursesEnrolled, 3);
      expect(s.watchedHours, 12);
      expect(s.streakDays, 4);
      expect(s.resume!.lessonId, 22);
      expect(s.resume!.courseSlug, 'anatomy');
      expect(s.resume!.remainingLessons, 8);
    });

    test('nothing to resume is null, not an empty object', () {
      final s = LearningSummary.fromJson({
        'courses_enrolled': 0, 'watched_hours': 0, 'streak_days': 0, 'resume': null,
      });
      expect(s.resume, isNull);
    });

    test('a resume block missing its course or lesson is discarded', () {
      expect(ResumePoint.fromJson({'course': null, 'lesson': null}), isNull);
    });
  });

  group('course progress', () {
    test('lesson keys arrive as strings and become ints', () {
      final p = CourseProgress.fromJson({
        'enrolled': true,
        'expired': false,
        'percent': 50,
        'completed': 1,
        'total': 2,
        'lessons': {
          '11': {'completed': true, 'watched_seconds': 300},
          '12': {'completed': false, 'watched_seconds': 40},
        },
      });
      expect(p.isLessonComplete(11), isTrue);
      expect(p.isLessonComplete(12), isFalse);
      expect(p.lessons[12]!.watchedSeconds, 40);
    });

    test('not enrolled is a normal answer, not an error', () {
      // What a free course returns: there is no enrolment to find, and the player still
      // works.
      final p = CourseProgress.fromJson({'enrolled': false, 'lessons': {}, 'percent': 0});
      expect(p.enrolled, isFalse);
      expect(p.lessons, isEmpty);
      expect(p.isLessonComplete(1), isFalse);
    });
  });

  group('certificates', () {
    test('carries only the learner name and course, which is all the API exposes', () {
      final c = Certificate.fromJson({
        'serial': 'BYT-2026-0001',
        'issued_at': '2026-08-01T10:00:00+00:00',
        'learner_name': 'عمر أشرف',
        'course': {'id': 3, 'slug': 'anatomy', 'title': 'تشريح'},
      });
      expect(c.serial, 'BYT-2026-0001');
      expect(c.learnerName, 'عمر أشرف');
      expect(c.courseTitle, 'تشريح');
      expect(c.verifyUrl, 'https://baytara.app/certificates/BYT-2026-0001');
    });
  });

  group('watch history', () {
    test('a session past 90 percent counts as finished', () {
      final v = WatchedVideo.fromJson({
        'id': 4, 'title': 'v', 'completion_percent': 95,
        'watched_seconds': 500, 'duration_seconds': 520, 'status': 'completed',
      });
      expect(v.isFinished, isTrue);
    });

    test('an explicit completed_at counts even below 90', () {
      final v = WatchedVideo.fromJson({
        'id': 4, 'title': 'v', 'completion_percent': 40,
        'completed_at': '2026-08-01T10:00:00+00:00',
      });
      expect(v.isFinished, isTrue);
    });

    test('a half-watched video is not finished', () {
      final v = WatchedVideo.fromJson({
        'id': 4, 'title': 'v', 'completion_percent': 50,
      });
      expect(v.isFinished, isFalse);
    });
  });
}
