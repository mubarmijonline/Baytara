// Encrypted key/value store for the three secrets the app holds: the access token, the
// refresh token, and the device id.
//
// Nothing else belongs here. Catalogue caching goes to ordinary storage; per the contract
// doc §9, OTPs and playbackInfo are never persisted anywhere at all.
import 'dart:convert';

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

  /// The last known profile, as JSON. Not a security token, but it lives here so it is
  /// cleared with the session rather than outliving a sign-out in plain preferences.
  static const _cachedUser = 'baytara_cached_user';

  /// Where each book summary was last left off, as `{"<slug>": <page>}`. Not a secret
  /// either, and it lives here for the same reason the onboarding flag does: one storage
  /// mechanism. Per install rather than per account, like the website's, because a page
  /// number is not worth a round trip on every page turn and the backend has no endpoint
  /// for it.
  static const _bookPagesKey = 'baytara_book_pages';

  /// Whether the first-run tour has been seen. Not a secret, but it lives here so the app
  /// needs only one storage mechanism, and it deliberately survives sign-out: someone who
  /// signs out has still seen the tour, and showing it again would be a bug, not a welcome.
  static const _onboardingSeen = 'baytara_onboarding_seen';

  Future<String?> get accessToken => _storage.read(key: _accessToken);
  Future<String?> get refreshToken => _storage.read(key: _refreshToken);
  Future<String?> get deviceId => _storage.read(key: _deviceId);

  /// Lets a cold start paint the signed-in UI immediately instead of waiting on a network
  /// round-trip to /auth/me. The server is still asked, in the background, and its answer
  /// replaces this.
  Future<bool> get onboardingSeen async =>
      (await _storage.read(key: _onboardingSeen)) == '1';
  Future<void> markOnboardingSeen() =>
      _storage.write(key: _onboardingSeen, value: '1');

  /// The saved page for [slug], or null when this reader has not opened it before.
  ///
  /// Never throws: a corrupt or half-written value costs the reader their place, which is
  /// a small loss, and must not cost them the book.
  Future<int?> bookPage(String slug) async {
    final page = (await _bookPages())[slug];
    return (page is int && page > 0) ? page : null;
  }

  Future<void> setBookPage(String slug, int page) async {
    final pages = await _bookPages();
    pages[slug] = page;
    await _storage.write(key: _bookPagesKey, value: jsonEncode(pages));
  }

  Future<Map<String, dynamic>> _bookPages() async {
    try {
      final raw = await _storage.read(key: _bookPagesKey);
      if (raw == null || raw.isEmpty) return {};
      final decoded = jsonDecode(raw);
      return decoded is Map<String, dynamic> ? decoded : {};
    } on FormatException {
      return {};
    }
  }

  Future<String?> get cachedUser => _storage.read(key: _cachedUser);
  Future<void> setCachedUser(String? json) => _write(_cachedUser, json);

  Future<void> setAccessToken(String? value) => _write(_accessToken, value);
  Future<void> setRefreshToken(String? value) => _write(_refreshToken, value);
  Future<void> setDeviceId(String value) => _storage.write(key: _deviceId, value: value);

  /// Sign-out. Deliberately leaves the device id in place: it identifies the install, not
  /// the session, and regenerating it would burn one of the user's two device slots the
  /// next time they sign in.
  Future<void> clearTokens() async {
    await _storage.delete(key: _accessToken);
    await _storage.delete(key: _refreshToken);
    // The cached profile goes with the session; leaving it would let the next launch paint
    // a signed-in header for an account that is signed out.
    await _storage.delete(key: _cachedUser);
  }

  Future<void> _write(String key, String? value) =>
      value == null ? _storage.delete(key: key) : _storage.write(key: key, value: value);
}
