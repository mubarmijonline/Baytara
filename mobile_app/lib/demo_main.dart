// Screenshot entrypoint. NOT the app: `lib/main.dart` is untouched and is what ships.
//
//   flutter run -t lib/demo_main.dart
//
// What it changes, and nothing else:
//   1. the API answers from lib/demo/demo_fixtures.dart instead of the network;
//   2. the session starts signed in, with a phone number, so the phone gate has nothing to
//      say (guards.dart is not modified -- a user WITH a phone simply passes guard 2);
//   3. the first-run tour is marked seen, so the app opens on Home.
//
// Everything else -- routing, guards, theming, RTL, every widget -- is the real app.
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/i18n/locale_controller.dart';
import 'core/network/dio_client.dart';
import 'core/providers.dart';
import 'demo/demo_api.dart';
import 'features/auth/domain/session.dart';

/// The account every screen renders against. `phone` is what clears the phone gate, and
/// `isBaytarian` is what unlocks the vet-only tiers.
const _demoUser = AuthUser(
  id: 1,
  name: 'أحمد ذياب',
  email: 'demo@baytara.app',
  phone: '+201000000000',
  isBaytarian: true,
);

/// Signed in from the first frame. The overrides of [signedOut] and [restoredEmpty] are what
/// stop the splash's bootstrap -- which finds no real token -- from demoting the session.
class _DemoSession extends SessionController {
  @override
  SessionState build() => const SessionSignedIn(_demoUser);

  @override
  void signedOut() {}

  @override
  void restoredEmpty() {}
}

/// Skips the tour. Returning `true` from build() also skips the base class's read of secure
/// storage, which on a fresh install would answer `false` and force onboarding.
class _DemoOnboarding extends OnboardingSeen {
  @override
  bool? build() => true;
}

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    ProviderScope(
      overrides: [
        verboseNetworkLoggingProvider.overrideWithValue(false),
        sessionProvider.overrideWith(_DemoSession.new),
        onboardingSeenProvider.overrideWith(_DemoOnboarding.new),
        apiClientProvider.overrideWith((ref) => ApiClient(
              store: ref.watch(secureStoreProvider),
              deviceId: ref.watch(deviceIdProvider),
              currentLanguage: () => ref.read(languageCodeProvider),
              onSignOut: (_) {},
              dio: Dio()..httpClientAdapter = DemoAdapter(),
            )),
      ],
      child: const BaytaraApp(),
    ),
  );
}
