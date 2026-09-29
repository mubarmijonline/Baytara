// ignore_for_file: prefer_initializing_formals
// The two exam endpoints.
import 'package:dio/dio.dart';

import '../../../core/network/dio_client.dart';
import 'exam_dto.dart';

class ExamRepository {
  ExamRepository({required ApiClient client}) : _client = client;
  final ApiClient _client;
  Dio get _dio => _client.raw;

  Future<Exam> exam(String slug) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/courses/$slug/exam');
      return Exam.fromJson(res.data?['exam'] as Map<String, dynamic>? ?? const {});
    } catch (e) {
      throw asApiException(e);
    }
  }

  /// Submits one sitting.
  ///
  /// [answers] maps question id to the chosen option id. [paperToken] is handed back
  /// exactly as it arrived: it carries which questions were drawn and when they were
  /// issued, which is how the server enforces a time limit it cannot trust the app to
  /// keep.
  Future<ExamResult> submit(
    String slug, {
    required Map<int, int> answers,
    String? paperToken,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/courses/$slug/exam/attempts',
        data: {
          'answers': {for (final e in answers.entries) '${e.key}': e.value},
          'paper_token': ?paperToken,
        },
      );
      return ExamResult.fromJson(res.data ?? const {});
    } catch (e) {
      throw asApiException(e);
    }
  }
}
