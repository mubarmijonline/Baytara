// ignore_for_file: prefer_initializing_formals
// The one HTTP client. Every call the app makes goes through here.
//
// Interceptor order is deliberate and load-bearing:
//   1. context  -- device id, language, User-Agent, auth header
//   2. refresh  -- 401 handling, single-flight (see refresh_interceptor.dart)
//   3. error    -- DioException -> ApiException, so no feature ever sees a raw Dio type
//   4. log      -- debug only
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../storage/device_id.dart';
import '../storage/secure_store.dart';
import 'api_error.dart';
import 'refresh_interceptor.dart';

/// The marker the backend looks for before it will mint an OTP for a capture-protected
/// lesson (`APP_UA_MARKER` in backend/app/utils.py).
///
/// This is not cosmetic and it is not a nice-to-have. Without it, POST /video/playback
/// refuses every protected lesson with one of the four capability-gate codes. The Capacitor
/// shell already sends exactly this string (mobile/capacitor.config.json) -- it must match,
/// and it must also be set on any WebView or custom tab the app opens.
const String kAppUserAgent = 'BaytaraApp/1';

/// The API the app talks to.
///
/// Overridable at build time so a development run can point somewhere else:
///
///   flutter run -d chrome --dart-define=BAYTARA_API=http://localhost:8091/api/v1
///
/// This matters most on web, where the browser enforces CORS: the live API only allows
/// `https://baytara.app` as an origin, so a page served from localhost is refused. Native
/// builds are unaffected, since CORS is a browser rule.
const String kApiBaseUrl = String.fromEnvironment(
  'BAYTARA_API',
  defaultValue: 'https://baytara.app/api/v1',
);

class ApiClient {
  ApiClient({
    required SecureStore store,
    required DeviceIdProvider deviceId,
    required String Function() currentLanguage,
    required SignOutCallback onSignOut,
    String baseUrl = kApiBaseUrl,
    Dio? dio,
    bool verboseLogging = false,
  })  : _store = store,
        _deviceId = deviceId,
        _currentLanguage = currentLanguage {
    _dio = dio ?? Dio();
    _dio.options
      ..baseUrl = baseUrl
      ..connectTimeout = const Duration(seconds: 20)
      // Generous: document reads take tens of seconds server-side (contract doc §7.3).
      ..receiveTimeout = const Duration(seconds: 60)
      ..headers['Accept'] = 'application/json';

    // A bare client for refresh calls and replays, carrying the same context headers but
    // none of the 401 handling -- otherwise a failing refresh recurses.
    _bare = Dio(_dio.options.copyWith())
      ..interceptors.add(InterceptorsWrapper(onRequest: _attachContext));

    _dio.interceptors.addAll([
      InterceptorsWrapper(onRequest: _attachContext),
      refresh = RefreshInterceptor(
        store: _store,
        refreshClient: _bare,
        onSignOut: onSignOut,
      ),
      InterceptorsWrapper(onError: _toApiException),
      // Opt-in rather than automatic in debug: always-on logging drowns the signal in
      // test output. main() turns it on for debug builds.
      if (verboseLogging && kDebugMode)
        LogInterceptor(requestBody: false, responseBody: false, requestHeader: false),
    ]);
  }

  final SecureStore _store;
  final DeviceIdProvider _deviceId;
  final String Function() _currentLanguage;

  late final Dio _dio;
  late final Dio _bare;
  late final RefreshInterceptor refresh;

  Dio get raw => _dio;

  Future<void> _attachContext(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final lang = _currentLanguage();
    options.headers
      ..['X-Baytara-Device-ID'] = await _deviceId.get()
      ..['Accept-Language'] = lang
      ..['User-Agent'] = kAppUserAgent;

    // Public GETs localise off ?lang= as well as the header; the backend checks the query
    // string first (req_lang in backend/app/utils.py). Sending both costs nothing.
    if (options.method == 'GET') {
      options.queryParameters = {'lang': lang, ...options.queryParameters};
    }

    // Only fill in the access token when the caller has not set an Authorization header
    // itself. POST /auth/refresh deliberately sends the REFRESH token, and overwriting it
    // here sent the expired access token to an endpoint that requires a refresh one -- so
    // every refresh failed, and the user was signed out 15 minutes after signing in or on
    // the next cold start. Silent, because a failed refresh looks exactly like a normal
    // expired session.
    if (options.headers['Authorization'] == null) {
      final token = await _store.accessToken;
      if (token != null && token.isNotEmpty) {
        options.headers['Authorization'] = 'Bearer $token';
      }
    }
    handler.next(options);
  }

  void _toApiException(DioException err, ErrorInterceptorHandler handler) {
    final status = err.response?.statusCode;
    final body = err.response?.data;
    final map = body is Map<String, dynamic> ? body : <String, dynamic>{};

    final ApiErrorCode code;
    if (err.type == DioExceptionType.connectionError ||
        err.type == DioExceptionType.connectionTimeout ||
        err.type == DioExceptionType.receiveTimeout ||
        err.type == DioExceptionType.sendTimeout) {
      code = ApiErrorCode.network;
    } else if (map['error'] != null) {
      code = ApiErrorCode.fromWire(map['error'] as String?);
    } else if (map['messages'] != null) {
      code = ApiErrorCode.validation;
    } else if (status != null && status >= 500) {
      code = ApiErrorCode.server;
    } else {
      code = ApiErrorCode.unknown;
    }

    // Loud in debug: these two classes are always our bug, never the user's situation.
    assert(() {
      if (code.indicatesMissingAppUserAgent) {
        debugPrint(
          'BUG: server returned ${code.wire} -- the $kAppUserAgent marker is missing from '
          '${err.requestOptions.uri}. Protected playback cannot work until this is fixed.',
        );
      }
      if (code.indicatesClientBug) {
        debugPrint('BUG: malformed playback event rejected as ${code.wire}.');
      }
      return true;
    }());

    handler.reject(
      DioException(
        requestOptions: err.requestOptions,
        response: err.response,
        type: err.type,
        error: ApiException(
          code: code,
          statusCode: status,
          data: map,
          message: err.message,
        ),
      ),
    );
  }
}

/// Unwraps the ApiException the error interceptor attached. Repositories call this so no
/// feature layer ever imports Dio.
ApiException asApiException(Object error) {
  if (error is ApiException) return error;
  if (error is DioException && error.error is ApiException) {
    return error.error as ApiException;
  }
  return const ApiException(code: ApiErrorCode.unknown, statusCode: null);
}
