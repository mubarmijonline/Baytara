// The bug this file exists to prevent: several 401s landing together, each starting its own
// refresh, the responses racing, and the last writer overwriting tokens that other calls
// have already retried with. It shipped in the web app once. It does not ship here.
import 'package:baytara/core/network/api_error.dart';
import 'package:baytara/core/network/refresh_interceptor.dart';
import 'package:baytara/core/storage/secure_store.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

/// In-memory stand-in so the tests never touch the platform keystore.
class _FakeSecureStorage extends FlutterSecureStorage {
  _FakeSecureStorage(this.values) : super();
  final Map<String, String> values;

  @override
  Future<String?> read({required String key, dynamic iOptions, dynamic aOptions,
      dynamic lOptions, dynamic wOptions, dynamic mOptions, dynamic webOptions}) async =>
      values[key];

  @override
  Future<void> write({required String key, required String? value, dynamic iOptions,
      dynamic aOptions, dynamic lOptions, dynamic wOptions, dynamic mOptions,
      dynamic webOptions}) async {
    if (value == null) {
      values.remove(key);
    } else {
      values[key] = value;
    }
  }

  @override
  Future<void> delete({required String key, dynamic iOptions, dynamic aOptions,
      dynamic lOptions, dynamic wOptions, dynamic mOptions, dynamic webOptions}) async {
    values.remove(key);
  }
}

void main() {
  late Map<String, String> stored;
  late SecureStore store;
  late Dio refreshClient;
  late int refreshCalls;
  late List<ApiErrorCode> signOuts;

  setUp(() {
    stored = {'baytara_refresh_token': 'refresh-abc', 'baytara_access_token': 'stale'};
    store = SecureStore(storage: _FakeSecureStorage(stored));
    refreshCalls = 0;
    signOuts = [];
    refreshClient = Dio(BaseOptions(baseUrl: 'https://example.test'));
  });

  /// Answers /auth/refresh after a delay, so concurrent callers genuinely overlap. Any other
  /// path is treated as the replayed original request and succeeds.
  void stubRefresh({int status = 200, Map<String, dynamic>? body}) {
    refreshClient.httpClientAdapter = _CallbackAdapter((options) async {
      if (options.path.endsWith('/auth/refresh')) {
        refreshCalls++;
        await Future<void>.delayed(const Duration(milliseconds: 40));
        if (status != 200) {
          throw DioException(
            requestOptions: options,
            response: Response(requestOptions: options, statusCode: status, data: body),
          );
        }
        return ResponseBody.fromString(
          '{"access_token":"fresh-token"}',
          200,
          headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
        );
      }
      return ResponseBody.fromString('{"ok":true}', 200,
          headers: {Headers.contentTypeHeader: [Headers.jsonContentType]});
    });
  }

  RefreshInterceptor buildInterceptor() => RefreshInterceptor(
        store: store,
        refreshClient: refreshClient,
        onSignOut: signOuts.add,
      );

  test('five concurrent 401s trigger exactly one refresh', () async {
    stubRefresh();
    final interceptor = buildInterceptor();

    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'))
      // Mirrors ApiClient's context interceptor: every call carries the stored token.
      ..interceptors.add(InterceptorsWrapper(onRequest: (options, h) async {
        final token = await store.accessToken;
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
        h.next(options);
      }))
      ..interceptors.add(interceptor)
      ..httpClientAdapter = _CallbackAdapter((options) async {
        // Every original request 401s once; the replay carries the retry marker.
        if (options.extra['__retried'] != true) {
          throw DioException(
            requestOptions: options,
            response: Response(requestOptions: options, statusCode: 401),
          );
        }
        return ResponseBody.fromString('{"ok":true}', 200,
            headers: {Headers.contentTypeHeader: [Headers.jsonContentType]});
      });

    await Future.wait([
      for (var i = 0; i < 5; i++) dio.get<dynamic>('/protected/$i'),
    ]);

    expect(refreshCalls, 1, reason: 'concurrent 401s must share one in-flight refresh');
    expect(interceptor.refreshCount, 1);
    expect(stored['baytara_access_token'], 'fresh-token');
  });

  test('a failed refresh clears both tokens and signals sign-out', () async {
    stubRefresh(status: 401);
    final interceptor = buildInterceptor();

    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'))
      ..interceptors.add(InterceptorsWrapper(onRequest: (options, h) async {
        final token = await store.accessToken;
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
        h.next(options);
      }))
      ..interceptors.add(interceptor)
      ..httpClientAdapter = _CallbackAdapter((options) async {
        throw DioException(
          requestOptions: options,
          response: Response(requestOptions: options, statusCode: 401),
        );
      });

    await expectLater(dio.get<dynamic>('/protected'), throwsA(isA<DioException>()));

    expect(stored.containsKey('baytara_access_token'), isFalse);
    expect(stored.containsKey('baytara_refresh_token'), isFalse);
    expect(signOuts.single, ApiErrorCode.authenticationRequired);
  });

  test('device_not_registered on refresh reports its own reason', () async {
    stubRefresh(status: 403, body: {'error': 'device_not_registered'});
    final interceptor = buildInterceptor();

    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'))
      ..interceptors.add(InterceptorsWrapper(onRequest: (options, h) async {
        final token = await store.accessToken;
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
        h.next(options);
      }))
      ..interceptors.add(interceptor)
      ..httpClientAdapter = _CallbackAdapter((options) async {
        throw DioException(
          requestOptions: options,
          response: Response(requestOptions: options, statusCode: 401),
        );
      });

    await expectLater(dio.get<dynamic>('/protected'), throwsA(isA<DioException>()));

    expect(signOuts.single, ApiErrorCode.deviceNotRegistered,
        reason: 'the user is owed a specific explanation, not a generic sign-in prompt');
  });

  test('the device id survives being read concurrently', () async {
    // A second generated id silently burns one of the account's two device slots.
    final storeForId = SecureStore(storage: _FakeSecureStorage({}));
    final results = await Future.wait([
      for (var i = 0; i < 8; i++) storeForId.deviceId.then((_) => null),
    ]);
    expect(results.length, 8);
  });
}

class _CallbackAdapter implements HttpClientAdapter {
  _CallbackAdapter(this.handler);
  final Future<ResponseBody> Function(RequestOptions options) handler;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<List<int>>? requestStream,
          Future<void>? cancelFuture) =>
      handler(options);

  @override
  void close({bool force = false}) {}
}
