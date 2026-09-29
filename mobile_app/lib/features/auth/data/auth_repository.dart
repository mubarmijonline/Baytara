// ignore_for_file: prefer_initializing_formals
// Everything the app does against /auth.
//
// Two rules hold across the whole file:
//   - `device_id` goes in the JSON *body* on register/login/google/logout, and in the
//     X-Baytara-Device-ID header everywhere else. The server cross-checks the two, and the
//     header is added for all requests by the Dio context interceptor.
//   - No method returns a Dio type. Failures come back as ApiException so the UI never
//     imports the HTTP client.
import 'package:dio/dio.dart';

import '../../../core/network/api_error.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/storage/device_id.dart';
import '../../../core/storage/secure_store.dart';
import '../domain/session.dart';
import 'auth_dto.dart';

class AuthRepository {
  AuthRepository({
    required ApiClient client,
    required SecureStore store,
    required DeviceIdProvider deviceId,
  })  : _client = client,
        _store = store,
        _deviceId = deviceId;

  final ApiClient _client;
  final SecureStore _store;
  final DeviceIdProvider _deviceId;

  Dio get _dio => _client.raw;

  Future<AuthResult> register({
    required String name,
    required String email,
    required String phone,
    required String password,
  }) =>
      _authCall('/auth/register', {
        'name': name,
        'email': email,
        'phone': phone,
        'password': password,
      });

  Future<AuthResult> login({required String email, required String password}) =>
      _authCall('/auth/login', {'email': email, 'password': password});

  /// [credential] is the Google **ID token**, not an access token.
  Future<AuthResult> google(String credential) =>
      _authCall('/auth/google', {'credential': credential});

  /// Empty string means Google sign-in is switched off server-side and the button must be
  /// hidden rather than shown and failing.
  Future<String> googleClientId() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/auth/google-config');
      return res.data?['client_id'] as String? ?? '';
    } catch (_) {
      // A missing config is not worth blocking sign-in over; hide the button.
      return '';
    }
  }

  Future<AuthUser> me() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/auth/me');
      return authUserFromJson(res.data!['user'] as Map<String, dynamic>);
    } catch (e) {
      throw asApiException(e);
    }
  }

  /// PATCH /auth/profile with only the phone. Validation comes back as
  /// `{messages: {phone: [phone_required|phone_invalid]}}`.
  Future<AuthUser> setPhone(String phone) async {
    try {
      final res = await _dio.patch<Map<String, dynamic>>(
        '/auth/profile',
        data: {'phone': phone},
      );
      return authUserFromJson(res.data!['user'] as Map<String, dynamic>);
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<DeviceList> devices() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/auth/devices');
      return DeviceList.fromJson(res.data!);
    } catch (e) {
      throw asApiException(e);
    }
  }

  /// Frees a device slot, and returns what the account has left.
  ///
  /// The response carries the new allowance, so the screen does not have to re-read the
  /// list to find out whether the user has just spent their one swap. A refusal arrives as
  /// `device_swap_limit_reached`, which is not a failure to report and forget: it is the
  /// point at which the emergency request becomes the only way forward.
  Future<SwapAllowance> removeDevice(int id) async {
    try {
      final res = await _dio.delete<Map<String, dynamic>>('/auth/devices/$id');
      return SwapAllowance.fromJson(res.data ?? const {});
    } catch (e) {
      throw asApiException(e);
    }
  }

  /// Asks an admin to free a slot once the self-service swap is spent.
  ///
  /// The server answers 200 with the existing request rather than creating a second one, so
  /// a double tap cannot queue two asks, and 409 `swap_still_available` when the user could
  /// simply remove a device themselves.
  Future<DeviceSwapRequest> requestDeviceSwap({String? reason}) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/auth/devices/swap-requests',
        data: {'reason': reason ?? ''},
      );
      return DeviceSwapRequest.fromJson(
          res.data!['request'] as Map<String, dynamic>);
    } catch (e) {
      throw asApiException(e);
    }
  }

  /// Frees this device's slot server-side, then clears the tokens.
  ///
  /// The server call is best-effort: if it fails the user still expects to be signed out
  /// locally, and leaving them signed in because the network dropped would be worse than
  /// leaving a stale device row behind.
  Future<void> logout() async {
    try {
      await _dio.post<dynamic>(
        '/auth/logout',
        data: {'device_id': await _deviceId.get()},
      );
    } catch (_) {
      // best effort
    }
    await _store.clearTokens();
  }

  /// The shared shape of register / login / google: post with the device id in the body,
  /// then persist both tokens before returning.
  Future<AuthResult> _authCall(String path, Map<String, dynamic> body) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        path,
        data: {...body, 'device_id': await _deviceId.get()},
      );
      final result = AuthResult.fromJson(res.data!);
      // Store before returning: a caller that navigates on the returned value must not be
      // able to reach an authed screen while the tokens are still unwritten.
      await _store.setAccessToken(result.accessToken);
      await _store.setRefreshToken(result.refreshToken);
      return result;
    } catch (e) {
      throw asApiException(e);
    }
  }
}

/// Thrown when sign-in is refused because the account is already on its allowance of
/// devices. Carries the list so the screen can offer to remove one without a second call.
class DeviceLimitException implements Exception {
  const DeviceLimitException(this.devices);
  final DeviceList devices;
}

/// Turns the generic device-limit failure into the typed one above.
DeviceLimitException? asDeviceLimit(ApiException e) {
  if (e.code != ApiErrorCode.deviceLimitReached) return null;
  final data = e.data;
  if (data == null) return null;
  return DeviceLimitException(DeviceList.fromJson(data));
}
