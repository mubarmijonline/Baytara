// ignore_for_file: prefer_initializing_formals
// The two playback endpoints.
//
// Both are device-bound: the X-Baytara-Device-ID header must match the device_id claim in
// the JWT or the server answers `device_mismatch`. The header is added by the Dio context
// interceptor, so nothing here has to remember it.
import 'package:dio/dio.dart';

import '../../../core/network/api_error.dart';
import '../../../core/network/dio_client.dart';
import 'playback_dto.dart';

class PlaybackRepository {
  PlaybackRepository({required ApiClient client}) : _client = client;
  final ApiClient _client;
  Dio get _dio => _client.raw;

  /// Mints an OTP for [lessonId].
  ///
  /// Every refusal is a typed [ApiException]; the caller maps the code to a screen. This
  /// must not be retried blindly: the server allows 40 mints an hour and answers
  /// `too_many_requests` beyond that, so a retry loop would lock the user out of playback
  /// for the rest of the hour.
  Future<PlaybackSession> mint({required int lessonId, int? courseId}) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/video/playback',
        data: {'lesson_id': lessonId, 'course_id': courseId},
      );
      return PlaybackSession.fromJson(res.data!);
    } catch (e) {
      throw asApiException(e);
    }
  }

  /// Reports one event. Returns the server's view of the session.
  ///
  /// Safe to retry with the same [PlaybackEvent]: the server dedupes on `event_id` and a
  /// replay against the same session is a no-op.
  Future<Map<String, dynamic>> sendEvent(String sessionId, PlaybackEvent event) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/video/playback-sessions/$sessionId/events',
        data: event.toJson(),
      );
      return (res.data?['session'] as Map<String, dynamic>?) ?? const {};
    } catch (e) {
      throw asApiException(e);
    }
  }
}
