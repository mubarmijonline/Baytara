// ignore_for_file: prefer_initializing_formals
// The learning endpoints.
import 'package:dio/dio.dart';

import '../../../core/network/dio_client.dart';
import 'learning_dto.dart';

class LearningRepository {
  LearningRepository({required ApiClient client}) : _client = client;
  final ApiClient _client;
  Dio get _dio => _client.raw;

  Future<List<Enrollment>> enrollments() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/enrollments');
      return [
        for (final e in (res.data?['enrollments'] as List? ?? const []))
          Enrollment.fromJson(e as Map<String, dynamic>),
      ];
    } catch (e) {
      throw asApiException(e);
    }
  }

  /// Joins a course.
  ///
  /// Three outcomes, and only one of them is an error:
  ///   - a paid course answers `402 payment_required`, which is the checkout flow, not a
  ///     failure to report;
  ///   - a free course answers 200 with `{enrollment: null, free: true}` and records
  ///     nothing, because a course with no fee is watched rather than joined;
  ///   - a tier refusal answers 403 with the reason.
  Future<EnrollResult> enroll(int courseId) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/enrollments',
        data: {'course_id': courseId},
      );
      return EnrollResult.fromJson(res.data ?? const {});
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<LearningSummary> summary() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/learning-summary');
      return LearningSummary.fromJson(res.data ?? const {});
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<CourseProgress> progress(String courseSlug) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/progress',
        queryParameters: {'course': courseSlug},
      );
      return CourseProgress.fromJson(res.data ?? const {});
    } catch (e) {
      throw asApiException(e);
    }
  }

  /// Records progress for one lesson. Returns the recomputed course progress, and the
  /// certificate when finishing this lesson earned one.
  ///
  /// `watched_seconds` is a high-water mark server-side (it takes the max), so sending a
  /// smaller figure after a rewatch cannot lose progress.
  Future<({ProgressSummary progress, Certificate? certificate})> recordProgress({
    required int lessonId,
    int? courseId,
    int? watchedSeconds,
    bool completed = false,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>('/progress', data: {
        'lesson_id': lessonId,
        'course_id': ?courseId,
        'watched_seconds': ?watchedSeconds,
        if (completed) 'completed': true,
      });
      final body = res.data ?? const {};
      final cert = body['certificate'];
      return (
        progress: ProgressSummary.fromJson(
            (body['progress'] as Map<String, dynamic>?) ?? const {}),
        // Issued exactly once; the server helper is idempotent, so a re-completion
        // returns null rather than a second certificate.
        certificate:
            cert == null ? null : Certificate.fromJson(cert as Map<String, dynamic>),
      );
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<List<Certificate>> certificates() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/certificates');
      return [
        for (final c in (res.data?['certificates'] as List? ?? const []))
          Certificate.fromJson(c as Map<String, dynamic>),
      ];
    } catch (e) {
      throw asApiException(e);
    }
  }

  /// Public verification. No token required, which is the point: anyone holding the serial
  /// can confirm the certificate is real.
  Future<Certificate> verifyCertificate(String serial) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/certificates/$serial');
      return Certificate.fromJson(res.data!['certificate'] as Map<String, dynamic>);
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<List<WatchedVideo>> watchHistory() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/video/my-progress');
      return [
        // The server returns {videos: [...]}, capped at the 10 most recent.
        for (final v in (res.data?['videos'] as List? ?? const []))
          WatchedVideo.fromJson(v as Map<String, dynamic>),
      ];
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<List<Map<String, dynamic>>> activity({int limit = 20}) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/activity',
        queryParameters: {'limit': limit},
      );
      return [
        for (final a in (res.data?['activity'] as List? ?? const []))
          (a as Map).cast<String, dynamic>(),
      ];
    } catch (e) {
      throw asApiException(e);
    }
  }
}
