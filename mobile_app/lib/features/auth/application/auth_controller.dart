// Sign-in, sign-out, and the bootstrap that decides where the app opens.
//
// The controller owns SessionState. The router watches it, so anything that changes the
// session here moves the user automatically -- there is no navigation in this file.
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../../core/network/api_error.dart';
import '../../../core/providers.dart';
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

  /// Runs once at launch. Restores the stored token and asks the server who it belongs to.
  ///
  /// Any failure lands on signed-out rather than an error screen: an expired refresh token
  /// is the ordinary case after thirty days, not an incident. The interceptor has already
  /// cleared the tokens by the time a 401 reaches here.
  Future<void> bootstrap() async {
    final token = await _ref.read(secureStoreProvider).accessToken;
    final refresh = await _ref.read(secureStoreProvider).refreshToken;
    if ((token == null || token.isEmpty) && (refresh == null || refresh.isEmpty)) {
      _session.restoredEmpty();
      return;
    }
    try {
      _session.signedIn(await _repo.me());
    } on ApiException {
      _session.signedOut();
    }
  }

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
  }

  Future<void> login({required String email, required String password}) async {
    try {
      final result = await _repo.login(email: email, password: password);
      _session.signedIn(result.user);
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
    } on ApiException catch (e) {
      final limit = asDeviceLimit(e);
      if (limit != null) throw limit;
      rethrow;
    }
  }

  /// Saves the phone the gate collected and updates the session, which releases the guard.
  Future<void> submitPhone(String e164) async {
    _session.signedIn(await _repo.setPhone(e164));
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

  Future<DeviceList> devices() => _repo.devices();

  Future<void> removeDevice(int id) => _repo.removeDevice(id);
}

final authControllerProvider = Provider<AuthController>(AuthController.new);
