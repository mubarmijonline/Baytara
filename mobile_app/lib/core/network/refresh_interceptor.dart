// Token refresh, collapsed into a single in-flight call.
//
// The access token lives 15 minutes, so a screen that fires several requests at once will
// routinely see several 401s land together. Each one must NOT start its own refresh: the
// responses race, the last writer wins, and the tokens the other calls already retried with
// are stale. The web app shipped exactly this bug -- the fix there is the `refreshing`
// variable in frontend/web/src/lib/api.js:71-87, and this is the same fix in Dart.
//
// Rules, in order:
//   1. one 401 -> refresh once, replay the original request once
//   2. concurrent 401s -> exactly one refresh between them, then each replays
//   3. the refresh itself fails -> clear both tokens, emit a sign-out, do not retry
//   4. the refresh returns 403 device_not_registered -> the device was removed from another
//      session. Also a sign-out, but the user is owed a specific explanation.
//
// Rule 2 needs two mechanisms, not one, and the reason is worth writing down because the
// obvious single-flight future alone does NOT hold here:
//
//   - QueuedInterceptor serialises onError, so five 401s are handled one after another
//     rather than at once. By the time the second is processed the first refresh has
//     already finished and cleared the shared future, so a future alone yields five
//     refreshes -- which is the exact bug this class exists to prevent.
//   - So the real test is "has the token changed since this request was sent?". If it has,
//     somebody else already refreshed and this request only needs replaying.
//
// The shared future still earns its place: it covers genuinely overlapping callers, which
// is what happens if this is ever moved off QueuedInterceptor.
import 'dart:async';

import 'package:dio/dio.dart';

import '../storage/secure_store.dart';
import 'api_error.dart';

typedef SignOutCallback = void Function(ApiErrorCode reason);

class RefreshInterceptor extends QueuedInterceptor {
  RefreshInterceptor({
    required SecureStore store,
    required Dio refreshClient,
    required SignOutCallback onSignOut,
  })  : _store = store,
        _refreshClient = refreshClient,
        _onSignOut = onSignOut;

  // ignore_for_file: prefer_initializing_formals

  final SecureStore _store;

  /// A separate Dio with no auth/refresh interceptors. Refreshing through the main client
  /// would recurse: the refresh call itself 401s, which triggers a refresh, and so on.
  final Dio _refreshClient;
  final SignOutCallback _onSignOut;

  Future<String?>? _inFlight;

  /// Visible for testing: how many times a refresh was actually started. The single-flight
  /// test asserts this is 1 after five concurrent 401s.
  int refreshCount = 0;

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode != 401 || _isRefreshCall(err.requestOptions)) {
      return handler.next(err);
    }
    // Replay only once. `_retried` is set below, so a second 401 on the same request means
    // the new token is not the problem and the user has to sign in.
    if (err.requestOptions.extra['__retried'] == true) {
      return handler.next(err);
    }

    // Did somebody already refresh while this request was in flight? If the stored token
    // is no longer the one this request carried, the answer is yes and there is nothing to
    // refresh -- just replay with the current token.
    final sentWith = _bearerOf(err.requestOptions.headers['Authorization']);
    final current = await _store.accessToken;

    final String? token;
    // Only a request that actually carried a token can tell us anything by comparison.
    // With no Authorization header there is nothing to compare, so refresh normally.
    if (sentWith != null && current != null && current.isNotEmpty && current != sentWith) {
      token = current;
    } else {
      token = await _refresh();
    }
    if (token == null) return handler.next(err);

    final options = err.requestOptions
      ..extra['__retried'] = true
      ..headers['Authorization'] = 'Bearer $token';

    try {
      final response = await _refreshClient.fetch<dynamic>(options);
      return handler.resolve(response);
    } on DioException catch (e) {
      return handler.next(e);
    }
  }

  /// Returns the new access token, or null when the caller should give up.
  Future<String?> _refresh() {
    return _inFlight ??= _performRefresh().whenComplete(() => _inFlight = null);
  }

  Future<String?> _performRefresh() async {
    refreshCount++;
    final refreshToken = await _store.refreshToken;
    if (refreshToken == null || refreshToken.isEmpty) {
      await _signOut(ApiErrorCode.authenticationRequired);
      return null;
    }

    try {
      final response = await _refreshClient.post<Map<String, dynamic>>(
        '/auth/refresh',
        options: Options(
          headers: {'Authorization': 'Bearer $refreshToken'},
          extra: {_refreshMarker: true},
        ),
      );

      final body = response.data ?? const {};
      final access = body['access_token'] as String?;
      if (access == null || access.isEmpty) {
        await _signOut(ApiErrorCode.authenticationRequired);
        return null;
      }
      await _store.setAccessToken(access);

      // The contract doc says the refresh token is never rotated, but the web client stores
      // one when the response carries it (frontend/web/src/lib/api.js:83). Honouring it if
      // present costs nothing and survives the server changing its mind.
      final rotated = body['refresh_token'] as String?;
      if (rotated != null && rotated.isNotEmpty) {
        await _store.setRefreshToken(rotated);
      }
      return access;
    } on DioException catch (e) {
      final code = ApiErrorCode.fromWire(
        (e.response?.data is Map ? e.response!.data['error'] : null) as String?,
      );
      // 403 device_not_registered: removed from another session. Distinct copy, same outcome.
      await _signOut(
        code == ApiErrorCode.deviceNotRegistered
            ? ApiErrorCode.deviceNotRegistered
            : ApiErrorCode.authenticationRequired,
      );
      return null;
    }
  }

  Future<void> _signOut(ApiErrorCode reason) async {
    await _store.clearTokens();
    _onSignOut(reason);
  }

  static String? _bearerOf(Object? header) {
    final value = header?.toString();
    if (value == null || !value.startsWith('Bearer ')) return null;
    return value.substring(7);
  }

  static const _refreshMarker = '__isRefreshCall';
  bool _isRefreshCall(RequestOptions options) =>
      options.extra[_refreshMarker] == true || options.path.endsWith('/auth/refresh');
}
