// Sign-in, sign-out, and the bootstrap that decides where the app opens.
//
// The controller owns SessionState. The router watches it, so anything that changes the
// session here moves the user automatically -- there is no navigation in this file.
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../../core/network/api_error.dart';
import '../../../core/providers.dart';
import '../../../core/storage/secure_store.dart';
import '../data/auth_dto.dart';
import '../data/auth_repository.dart';
import '../domain/session.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) => AuthRepository(
      client: ref.watch(apiClientProvider),
      store: ref.watch(secureStoreProvider),
      deviceId: ref.watch(deviceIdProvider),
    ));

/// Empty when Google sign-in is switched off server-side; the button is hidden.
final googleClientIdProvider = FutureProvider<String>(
  (ref) => ref.watch(authRepositoryProvider).googleClientId(),
);

class AuthController {
  AuthController(this._ref);
  final Ref _ref;

  AuthRepository get _repo => _ref.read(authRepositoryProvider);
  SessionController get _session => _ref.read(sessionProvider.notifier);

  /// Runs once at launch. Restores the session and asks the server to confirm it.
  ///
  /// The confirmation does not block the first paint. A cold start used to sit on the splash
  /// for a whole network round-trip before anything appeared; now the cached profile paints
  /// immediately and /auth/me corrects it a moment later. The cache holds only what the
  /// route guards and the greeting read, and a stale value self-corrects on the next frame.
  ///
  /// Any failure lands on signed-out rather than an error screen: an expired refresh token
  /// is the ordinary case after thirty days, not an incident.
  Future<void> bootstrap() async {
    final store = _ref.read(secureStoreProvider);
    final token = await store.accessToken;
    final refresh = await store.refreshToken;

    if ((token == null || token.isEmpty) && (refresh == null || refresh.isEmpty)) {
      _session.restoredEmpty();
      return;
    }

    final cached = await _cachedUser(store);
    if (cached != null) _session.signedIn(cached);

    try {
      final user = await _repo.me();
      _session.signedIn(user);
      await _cache(store, user);
    } on ApiException {
      // Only demote to signed-out if the server actually rejected us. The interceptor has
      // already cleared the tokens by this point.
      _session.signedOut();
    }
  }

  Future<AuthUser?> _cachedUser(SecureStore store) async {
    final raw = await store.cachedUser;
    if (raw == null || raw.isEmpty) return null;
    try {
      return authUserFromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      // A cache written by an older build is not worth failing a launch over.
      return null;
    }
  }

  Future<void> _cache(SecureStore store, AuthUser user) =>
      store.setCachedUser(jsonEncode(authUserToJson(user)));

  Future<void> register({
    required String name,
    required String email,
    required String phone,
    required String password,
  }) async {
    final result = await _repo.register(
      name: name,
      email: email,
      phone: phone,
      password: password,
    );
    _session.signedIn(result.user);
    await _cache(_ref.read(secureStoreProvider), result.user);
  }

  Future<void> login({required String email, required String password}) async {
    try {
      final result = await _repo.login(email: email, password: password);
      _session.signedIn(result.user);
      await _cache(_ref.read(secureStoreProvider), result.user);
    } on ApiException catch (e) {
      // Re-thrown as the typed exception so the screen can show the device list it already
      // received rather than making a second call for it.
      final limit = asDeviceLimit(e);
      if (limit != null) throw limit;
      rethrow;
    }
  }

  /// Google sign-in. The server wants the **ID token**, not an access token.
  ///
  /// Google never supplies a phone number, so a fresh Google account always lands on the
  /// phone gate. That is the whole reason `needs_phone` exists on this endpoint.
  Future<void> signInWithGoogle({required String serverClientId}) async {
    final google = GoogleSignIn.instance;
    await google.initialize(serverClientId: serverClientId);

    if (!google.supportsAuthenticate()) {
      throw const ApiException(
        code: ApiErrorCode.googleNotConfigured,
        statusCode: null,
      );
    }

    final account = await google.authenticate();
    final idToken = account.authentication.idToken;
    if (idToken == null || idToken.isEmpty) {
      throw const ApiException(code: ApiErrorCode.invalidGoogleToken, statusCode: null);
    }

    try {
      final result = await _repo.google(idToken);
      _session.signedIn(result.user);
      await _cache(_ref.read(secureStoreProvider), result.user);
    } on ApiException catch (e) {
      final limit = asDeviceLimit(e);
      if (limit != null) throw limit;
      rethrow;
    }
  }

  /// Saves the phone the gate collected and updates the session, which releases the guard.
  Future<void> submitPhone(String e164) async {
    final user = await _repo.setPhone(e164);
    _session.signedIn(user);
    // Cached too: the phone gate is a route guard, and a stale cache would send the user
    // back to the gate on the next cold start.
    await _cache(_ref.read(secureStoreProvider), user);
  }

  Future<void> signOut() async {
    await _repo.logout();
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {
      // Not signed in with Google, or the plugin is unavailable. Nothing to undo.
    }
    _ref.read(sessionEndedProvider.notifier).clear();
    _session.signedOut();
  }

  /// Closes the account, then ends the session exactly as signing out does.
  Future<void> deleteAccount({String? password}) async {
    await _repo.deleteAccount(password: password);
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {
      // Not signed in with Google, or the plugin is unavailable. Nothing to undo.
    }
    _ref.read(sessionEndedProvider.notifier).clear();
    _session.signedOut();
  }

  Future<DeviceList> devices() => _repo.devices();

  Future<SwapAllowance> removeDevice(int id) => _repo.removeDevice(id);

  Future<DeviceSwapRequest> requestDeviceSwap({String? reason}) =>
      _repo.requestDeviceSwap(reason: reason);
}

final authControllerProvider = Provider<AuthController>(AuthController.new);
