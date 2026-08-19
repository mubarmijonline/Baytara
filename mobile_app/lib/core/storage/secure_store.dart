// Encrypted key/value store for the three secrets the app holds: the access token, the
// refresh token, and the device id.
//
// Nothing else belongs here. Catalogue caching goes to ordinary storage; per the contract
// doc §9, OTPs and playbackInfo are never persisted anywhere at all.
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStore {
  SecureStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              // Android values are encrypted with the plugin's own ciphers by default, so
              // there is nothing to opt into here. `first_unlock` on iOS keeps the tokens
              // readable after a reboot without the device having to be unlocked again --
              // the background token refresh needs them before the user touches anything.
              aOptions: AndroidOptions(),
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  final FlutterSecureStorage _storage;

  static const _accessToken = 'baytara_access_token';
  static const _refreshToken = 'baytara_refresh_token';
  static const _deviceId = 'baytara_device_id';

  Future<String?> get accessToken => _storage.read(key: _accessToken);
  Future<String?> get refreshToken => _storage.read(key: _refreshToken);
  Future<String?> get deviceId => _storage.read(key: _deviceId);

  Future<void> setAccessToken(String? value) => _write(_accessToken, value);
  Future<void> setRefreshToken(String? value) => _write(_refreshToken, value);
  Future<void> setDeviceId(String value) => _storage.write(key: _deviceId, value: value);

  /// Sign-out. Deliberately leaves the device id in place: it identifies the install, not
  /// the session, and regenerating it would burn one of the user's two device slots the
  /// next time they sign in.
  Future<void> clearTokens() async {
    await _storage.delete(key: _accessToken);
    await _storage.delete(key: _refreshToken);
  }

  Future<void> _write(String key, String? value) =>
      value == null ? _storage.delete(key: key) : _storage.write(key: key, value: value);
}
