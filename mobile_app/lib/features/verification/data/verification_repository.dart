// ignore_for_file: prefer_initializing_formals
// The verification endpoints.
//
// Two things shape this file:
//
//  - **Reading a document takes 10 to 40 seconds.** Every call here exposes upload progress,
//    and the timeouts are widened accordingly. A default 60s receive timeout would abort a
//    slow read and leave the user thinking it failed when the server was still working.
//  - **202 is not an error.** Dio treats any non-2xx as a throw, but 202 is a 2xx, so it
//    arrives as a normal response and must be recognised rather than assumed to be success.
import 'package:dio/dio.dart';
import 'package:http_parser/http_parser.dart';

import '../../../core/network/dio_client.dart';
import 'verification_dto.dart';

/// A document read can take tens of seconds server-side.
const Duration _readTimeout = Duration(seconds: 120);

class VerificationRepository {
  VerificationRepository({required ApiClient client}) : _client = client;
  final ApiClient _client;
  Dio get _dio => _client.raw;

  Future<VerificationStatus> status() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/baytarian/me');
      return VerificationStatus.fromJson(res.data ?? const {});
    } catch (e) {
      throw asApiException(e);
    }
  }

  /// Reads the syndicate card **without committing anything**, so the user can see whether
  /// it was legible before it becomes a request they cannot retry.
  Future<Map<String, dynamic>> previewCard({
    required String frontPath,
    required String backPath,
    void Function(int sent, int total)? onProgress,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/baytarian/card/preview',
        data: await _sides(frontPath, backPath),
        options: Options(receiveTimeout: _readTimeout, sendTimeout: _readTimeout),
        onSendProgress: onProgress,
      );
      return (res.data?['report'] as Map?)?.cast<String, dynamic>() ?? const {};
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<VerificationResult> submitCard({
    required String frontPath,
    required String backPath,
    void Function(int sent, int total)? onProgress,
  }) =>
      _submit(
        path: '/baytarian/card',
        data: _sides(frontPath, backPath),
        onProgress: onProgress,
      );

  /// [route] is `national_id` or `other`.
  Future<VerificationResult> submitDocument({
    required VerificationRoute route,
    required String frontPath,
    String? backPath,
    void Function(int sent, int total)? onProgress,
  }) async {
    final form = FormData.fromMap({
      'route': route.wire,
      'front': await _file(frontPath),
      if (backPath != null) 'back': await _file(backPath),
    });
    return _submit(path: '/baytarian/document', data: Future.value(form),
        onProgress: onProgress);
  }

  Future<VerificationResult> _submit({
    required String path,
    required Future<FormData> data,
    void Function(int sent, int total)? onProgress,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        path,
        data: await data,
        options: Options(
          receiveTimeout: _readTimeout,
          sendTimeout: _readTimeout,
          // 202 must reach us as a response, not an exception.
          validateStatus: (s) => s != null && s >= 200 && s < 300,
        ),
        onSendProgress: onProgress,
      );
      return _readResult(res.statusCode, res.data ?? const {});
    } on DioException catch (e) {
      final body = e.response?.data;
      final map = body is Map ? body.cast<String, dynamic>() : const <String, dynamic>{};
      // 422 is a real answer with a report attached, not a transport failure.
      if (e.response?.statusCode == 422) {
        return VerificationResult(
          outcome: VerificationOutcome.couldNotVerify,
          problem: map['error'] as String?,
          report: (map['report'] as Map?)?.cast<String, dynamic>() ??
              (map['verdict'] as Map?)?.cast<String, dynamic>(),
        );
      }
      throw asApiException(e);
    } catch (e) {
      throw asApiException(e);
    }
  }

  VerificationResult _readResult(int? status, Map<String, dynamic> body) {
    final request = body['request'] is Map
        ? VerificationRequest.fromJson((body['request'] as Map).cast<String, dynamic>())
        : null;

    // 202 with `pending: true`. Distinct from success: a human has to look, and the user
    // must be told not to send it again.
    if (status == 202 || body['pending'] == true) {
      return VerificationResult(
        outcome: VerificationOutcome.sentForReview,
        request: request,
      );
    }

    // Both grants confer the same access; only the label differs.
    final isStudent = body['is_vet_student'] as bool? ?? false;
    return VerificationResult(
      outcome: isStudent
          ? VerificationOutcome.verifiedStudent
          : VerificationOutcome.verifiedVeterinarian,
      request: request,
    );
  }

  Future<FormData> _sides(String frontPath, String backPath) async => FormData.fromMap({
        'front': await _file(frontPath),
        'back': await _file(backPath),
      });

  Future<MultipartFile> _file(String path) => MultipartFile.fromFile(
        path,
        contentType: MediaType('image', _extensionOf(path)),
      );

  /// The server accepts jpeg, png and webp for card sides. The extension decides the
  /// declared type; anything unexpected is sent as jpeg, which is what a phone camera
  /// produces.
  static String _extensionOf(String path) {
    final lower = path.toLowerCase();
    if (lower.endsWith('.png')) return 'png';
    if (lower.endsWith('.webp')) return 'webp';
    return 'jpeg';
  }
}
