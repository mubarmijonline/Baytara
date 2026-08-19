// The composition root: how the core services are wired together.
//
// Kept in one file so the dependency order is readable at a glance -- store feeds device id,
// both feed the API client, and the client is what every repository will take.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'i18n/locale_controller.dart';
import 'network/api_error.dart';
import 'network/dio_client.dart';
import 'storage/device_id.dart';
import 'storage/secure_store.dart';

final secureStoreProvider = Provider<SecureStore>((ref) => SecureStore());

final deviceIdProvider = Provider<DeviceIdProvider>(
  (ref) => DeviceIdProvider(ref.watch(secureStoreProvider)),
);

/// Raised when the session ends for a reason the user did not choose. The router listens
/// and redirects; screens listen to explain why.
///
/// Riverpod 3 removed StateProvider, so this is a Notifier holding the same one value.
class SessionEnded extends Notifier<ApiErrorCode?> {
  @override
  ApiErrorCode? build() => null;

  void raise(ApiErrorCode reason) => state = reason;
  void clear() => state = null;
}

final sessionEndedProvider =
    NotifierProvider<SessionEnded, ApiErrorCode?>(SessionEnded.new);

/// Set by main() for debug builds. Off in tests, where request logs are only noise.
final verboseNetworkLoggingProvider = Provider<bool>((ref) => false);

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    verboseLogging: ref.watch(verboseNetworkLoggingProvider),
    store: ref.watch(secureStoreProvider),
    deviceId: ref.watch(deviceIdProvider),
    currentLanguage: () => ref.read(languageCodeProvider),
    onSignOut: (reason) => ref.read(sessionEndedProvider.notifier).raise(reason),
  );
});
