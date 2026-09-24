// A Dio adapter that answers from fixtures instead of the network. NOT shipped.
//
// Fitted at the adapter layer rather than by faking repositories, so every interceptor the
// real app runs -- context headers, the refresh queue, the error mapping -- still runs. The
// screens under the camera are therefore the real screens, not a parallel set.
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

import 'demo_fixtures.dart';

class DemoAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    // A little latency so shimmer and loading states are real rather than skipped.
    await Future<void>.delayed(const Duration(milliseconds: 120));

    final body = demoBody(options.method, options.uri.path);
    if (body == null) {
      return ResponseBody.fromString(
        jsonEncode({'error': 'demo_fixture_missing', 'path': options.uri.path}),
        404,
        headers: _jsonHeaders,
      );
    }
    return ResponseBody.fromString(jsonEncode(body), 200, headers: _jsonHeaders);
  }

  @override
  void close({bool force = false}) {}

  static const _jsonHeaders = {
    Headers.contentTypeHeader: ['application/json; charset=utf-8'],
  };
}
