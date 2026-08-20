// Wire shapes for the learning endpoints (backend/app/api/v1/learning.py and
// /video/my-progress).
//
// The single most important thing encoded here: **a free course produces no enrolment at
// all.** POST /enrollments answers `{enrollment: null, free: true}` and records nothing, so
// a free course has no progress, no certificate and no row in "my courses". It is open
// content that is simply watched. Treating the null as a failure would show an error for
// the successful case.
import '../../catalogue/data/catalogue_dto.dart';

/// Nested JSON objects, without assuming the decoder handed back a typed map.
/// `jsonDecode` gives `Map<String, dynamic>`, but a hard cast breaks on anything else
/// (a literal in a test, a differently configured decoder) for no benefit.
Map<String, dynamic>? _obj(Object? value) =>
    value is Map ? value.cast<String, dynamic>() : null;

class ProgressSummary {
  const ProgressSummary({
    this.percent = 0,
    this.completedLessons = 0,
    this.totalLessons = 0,
    this.watchedSeconds = 0,
  });

  factory ProgressSummary.fromJson(Map<String, dynamic> j) => ProgressSummary(
        percent: (j['percent'] as num?)?.toInt() ?? 0,
        completedLessons: (j['completed_lessons'] as num?)?.toInt() ?? 0,
        totalLessons: (j['total_lessons'] as num?)?.toInt() ?? 0,
        watchedSeconds: (j['watched_seconds'] as num?)?.toInt() ?? 0,
      );

  final int percent;
  final int completedLessons;
  final int totalLessons;
  final int watchedSeconds;

  bool get isComplete => totalLessons > 0 && percent >= 100;
}

class Enrollment {
  const Enrollment({
    required this.id,
    required this.course,
    required this.status,
    required this.isExpired,
    required this.progress,
    this.expiresAt,
    this.source,
  });

  factory Enrollment.fromJson(Map<String, dynamic> j) => Enrollment(
        id: (j['id'] as num).toInt(),
        course: _obj(j['course']) == null ? null : Course.fromJson(_obj(j['course'])!),
        status: j['status'] as String? ?? 'active',
        isExpired: j['is_expired'] as bool? ?? false,
        expiresAt: DateTime.tryParse(j['expires_at'] as String? ?? ''),
        source: j['source'] as String?,
        progress: ProgressSummary.fromJson(_obj(j['progress']) ?? const {}),
      );

  final int id;
  final Course? course;
  final String status;

  /// Access has lapsed. The user is a past customer, so the route back is **renewal** at
  /// `renewal_percent()` of the price, not a full-price purchase.
  final bool isExpired;

  /// Null means lifetime access, not "expired with no date".
  final DateTime? expiresAt;
  final String? source;
  final ProgressSummary progress;

  bool get isLifetime => expiresAt == null;
}

/// The outcome of POST /enrollments.
class EnrollResult {
  const EnrollResult({this.enrollment, required this.isFreeContent});

  factory EnrollResult.fromJson(Map<String, dynamic> j) {
    final row = j['enrollment'];
    return EnrollResult(
      enrollment: _obj(row) == null ? null : Enrollment.fromJson(_obj(row)!),
      // Success, not failure: the course is free, nothing was recorded, and the user can
      // simply watch it.
      isFreeContent: j['free'] as bool? ?? false,
    );
  }

  final Enrollment? enrollment;
  final bool isFreeContent;
}

/// Where the learner left off, from /learning-summary.
class ResumePoint {
  const ResumePoint({
    required this.courseId,
    required this.courseSlug,
    required this.courseTitle,
    required this.lessonId,
    required this.lessonTitle,
    required this.lessonIndex,
    required this.totalLessons,
    required this.remainingLessons,
    required this.percent,
    this.poster,
  });

  static ResumePoint? fromJson(Map<String, dynamic>? j) {
    if (j == null) return null;
    final course = _obj(j['course']);
    final lesson = _obj(j['lesson']);
    if (course == null || lesson == null) return null;
    return ResumePoint(
      courseId: (course['id'] as num).toInt(),
      courseSlug: course['slug'] as String? ?? '',
      courseTitle: course['title'] as String? ?? '',
      lessonId: (lesson['id'] as num).toInt(),
      lessonTitle: lesson['title'] as String? ?? '',
      poster: lesson['poster'] as String?,
      lessonIndex: (j['lesson_index'] as num?)?.toInt() ?? 1,
      totalLessons: (j['total_lessons'] as num?)?.toInt() ?? 0,
      remainingLessons: (j['remaining_lessons'] as num?)?.toInt() ?? 0,
      percent: (j['percent'] as num?)?.toInt() ?? 0,
    );
  }

  final int courseId;
  final String courseSlug;
  final String courseTitle;
  final int lessonId;
  final String lessonTitle;
  final String? poster;
  final int lessonIndex;
  final int totalLessons;
  final int remainingLessons;
  final int percent;
}

class LearningSummary {
  const LearningSummary({
    this.coursesEnrolled = 0,
    this.watchedHours = 0,
    this.streakDays = 0,
    this.resume,
  });

  factory LearningSummary.fromJson(Map<String, dynamic> j) => LearningSummary(
        coursesEnrolled: (j['courses_enrolled'] as num?)?.toInt() ?? 0,
        // Whole hours only; the server floors it.
        watchedHours: (j['watched_hours'] as num?)?.toInt() ?? 0,
        // A streak day means a video was *started* that day; browsing does not count.
        // Yesterday still counts, so the streak does not read as broken before the user
        // has watched anything today.
        streakDays: (j['streak_days'] as num?)?.toInt() ?? 0,
        resume: ResumePoint.fromJson(_obj(j['resume'])),
      );

  final int coursesEnrolled;
  final int watchedHours;
  final int streakDays;
  final ResumePoint? resume;
}

/// Per-lesson progress within one course, from `GET /progress?course=<slug>`.
class CourseProgress {
  const CourseProgress({
    required this.enrolled,
    this.expired = false,
    this.percent = 0,
    this.completed = 0,
    this.total = 0,
    this.expiresAt,
    this.lessons = const {},
  });

  factory CourseProgress.fromJson(Map<String, dynamic> j) => CourseProgress(
        // False for a free course too: there is no enrolment to find, and that is not an
        // error. The player still works.
        enrolled: j['enrolled'] as bool? ?? false,
        expired: j['expired'] as bool? ?? false,
        percent: (j['percent'] as num?)?.toInt() ?? 0,
        completed: (j['completed'] as num?)?.toInt() ?? 0,
        total: (j['total'] as num?)?.toInt() ?? 0,
        expiresAt: DateTime.tryParse(j['expires_at'] as String? ?? ''),
        lessons: {
          for (final e in ((j['lessons'] as Map?) ?? const {}).entries)
            int.parse(e.key.toString()):
                LessonProgress.fromJson(_obj(e.value) ?? const {}),
        },
      );

  final bool enrolled;
  final bool expired;
  final int percent;
  final int completed;
  final int total;
  final DateTime? expiresAt;
  final Map<int, LessonProgress> lessons;

  bool isLessonComplete(int lessonId) => lessons[lessonId]?.completed ?? false;
}

class LessonProgress {
  const LessonProgress({required this.completed, required this.watchedSeconds});

  factory LessonProgress.fromJson(Map<String, dynamic> j) => LessonProgress(
        completed: j['completed'] as bool? ?? false,
        watchedSeconds: (j['watched_seconds'] as num?)?.toInt() ?? 0,
      );

  final bool completed;
  final int watchedSeconds;
}

class Certificate {
  const Certificate({
    required this.serial,
    required this.learnerName,
    required this.courseTitle,
    this.courseSlug,
    this.issuedAt,
  });

  factory Certificate.fromJson(Map<String, dynamic> j) {
    final course = _obj(j['course']);
    return Certificate(
      // The public handle. /certificates/<serial> verifies it without exposing a user id.
      serial: j['serial'] as String? ?? '',
      learnerName: j['learner_name'] as String? ?? '',
      courseTitle: course?['title'] as String? ?? '',
      courseSlug: course?['slug'] as String?,
      issuedAt: DateTime.tryParse(j['issued_at'] as String? ?? ''),
    );
  }

  final String serial;
  final String learnerName;
  final String courseTitle;
  final String? courseSlug;
  final DateTime? issuedAt;

  String get verifyUrl => 'https://baytara.app/certificates/$serial';
}

/// One row of /video/my-progress: the last watched videos with resume positions.
class WatchedVideo {
  const WatchedVideo({
    required this.id,
    required this.title,
    required this.completionPercent,
    required this.watchedSeconds,
    required this.durationSeconds,
    this.status,
    this.lastEventAt,
    this.completedAt,
  });

  factory WatchedVideo.fromJson(Map<String, dynamic> j) => WatchedVideo(
        id: (j['id'] as num).toInt(),
        title: j['title'] as String? ?? '',
        completionPercent: (j['completion_percent'] as num?)?.toInt() ?? 0,
        watchedSeconds: (j['watched_seconds'] as num?)?.toInt() ?? 0,
        durationSeconds: (j['duration_seconds'] as num?)?.toInt() ?? 0,
        status: j['status'] as String?,
        lastEventAt: DateTime.tryParse(j['last_event_at'] as String? ?? ''),
        completedAt: DateTime.tryParse(j['completed_at'] as String? ?? ''),
      );

  final int id;
  final String title;
  final int completionPercent;
  final int watchedSeconds;
  final int durationSeconds;
  final String? status;
  final DateTime? lastEventAt;
  final DateTime? completedAt;

  bool get isFinished => completedAt != null || completionPercent >= 90;
}
