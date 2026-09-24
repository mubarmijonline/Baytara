// ignore_for_file: prefer_initializing_formals
// Library access: the shelf, one book, and the summary itself.
//
// The first two are public GETs. The third is not: `GET /books/<slug>/file.pdf` is
// `@jwt_required`, returns `application/pdf` rather than JSON, and is deliberately not a
// URL that can be handed around. That is why the bytes are fetched here through the same
// Dio instance every other call uses -- it is what attaches the bearer token, the device
// id and the app User-Agent -- and handed to the reader in memory rather than saved.
import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../../core/network/api_error.dart';
import '../../../core/network/dio_client.dart';
import 'library_dto.dart';

class LibraryRepository {
  LibraryRepository({required ApiClient client}) : _client = client;

  final ApiClient _client;
  Dio get _dio => _client.raw;

  Future<List<Book>> books() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/books');
      return [
        for (final b in (res.data?['books'] as List? ?? const []))
          Book.fromJson(b as Map<String, dynamic>),
      ];
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<Book> book(String slug) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/books/$slug');
      return Book.fromJson(res.data!['book'] as Map<String, dynamic>);
    } catch (e) {
      throw asApiException(e);
    }
  }

  /// The summary's bytes, for a signed-in reader.
  ///
  /// Two details that are easy to get wrong and silent when wrong:
  ///
  ///  - `Accept: application/pdf`. The client sets `Accept: application/json` globally, and
  ///    while Flask's `send_from_directory` ignores it today, asking for JSON and parsing
  ///    a PDF is the kind of mismatch that breaks the day a proxy starts honouring it.
  ///  - the error body. With `ResponseType.bytes` a refusal arrives as the *bytes* of its
  ///    JSON, so the client's error interceptor cannot read `{"error": ...}` out of it and
  ///    every failure would read as `unknown`. The status code is mapped here instead, so
  ///    a signed-out reader is told to sign in and a missing file is told it is missing.
  Future<Uint8List> summaryPdf(String slug) async {
    try {
      final res = await _dio.get<List<int>>(
        '/books/$slug/file.pdf',
        options: Options(
          responseType: ResponseType.bytes,
          headers: {'Accept': 'application/pdf'},
        ),
      );
      return Uint8List.fromList(res.data ?? const []);
    } catch (e) {
      final failure = asApiException(e);
      if (failure.code != ApiErrorCode.unknown) throw failure;
      throw ApiException(
        code: switch (failure.statusCode) {
          401 || 422 => ApiErrorCode.authenticationRequired,
          404 => ApiErrorCode.notFound,
          final int s when s >= 500 => ApiErrorCode.server,
          _ => ApiErrorCode.unknown,
        },
        statusCode: failure.statusCode,
      );
    }
  }
}
