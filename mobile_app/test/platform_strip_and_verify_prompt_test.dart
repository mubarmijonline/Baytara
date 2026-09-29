// Milestone 22 in the app.
//
// Two client asks from 2026-09-28, both already on the website: the few videos an admin
// pins lead the home page's "getting started" strip, and a vet-only lock says what to do
// ("verify your account as a veterinarian to watch") with a button that does it.
import 'dart:convert';

import 'package:baytara/core/i18n/app_localizations.dart';
import 'package:baytara/core/network/dio_client.dart';
import 'package:baytara/core/storage/device_id.dart';
import 'package:baytara/core/storage/secure_store.dart';
import 'package:baytara/features/auth/domain/session.dart';
import 'package:baytara/features/catalogue/application/catalogue_providers.dart';
import 'package:baytara/features/catalogue/data/catalogue_repository.dart';
import 'package:baytara/features/catalogue/ui/home_screen.dart';
import 'package:baytara/features/catalogue/ui/widgets/verify_prompt.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

class _FakeStorage extends FlutterSecureStorage {
  _FakeStorage() : super();
  final Map<String, String> values = {};

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

Map<String, dynamic> _video(int id, String title) =>
    {'id': id, 'title': title, 'access_type': 'free', 'has_video': true, 'can_play': true};

/// Answers the handful of endpoints the home screen reads, and records what was asked.
class _Api implements HttpClientAdapter {
  final List<RequestOptions> asked = [];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<List<int>>? requestStream,
      Future<void>? cancelFuture) async {
    asked.add(options);
    final body = switch (options.path) {
      '/videos' when options.queryParameters['uncategorized'] == 1 => {
          'videos': [_video(33, 'طريقك الذهبي'), _video(34, 'كيف تشترك')],
          'total': 2, 'page': 1, 'pages': 1,
        },
      '/videos' => {'videos': [_video(42, 'فيديو المكتبة')], 'total': 1, 'page': 1, 'pages': 1},
      '/courses' => {'courses': [], 'total': 0, 'page': 1, 'pages': 1},
      '/categories' => {'categories': []},
      '/instructors' => {'instructors': []},
      _ => <String, dynamic>{},
    };
    return ResponseBody.fromString(jsonEncode(body), 200,
        headers: {Headers.contentTypeHeader: [Headers.jsonContentType]});
  }

  @override
  void close({bool force = false}) {}
}

class _SignedOut extends SessionController {
  @override
  SessionState build() => const SessionSignedOut();
}

(CatalogueRepository, _Api) _repo() {
  final store = SecureStore(storage: _FakeStorage());
  final api = _Api();
  final client = ApiClient(
    store: store,
    deviceId: DeviceIdProvider(store),
    currentLanguage: () => 'ar',
    onSignOut: (_) {},
    baseUrl: 'https://example.test/api/v1',
  );
  client.raw.httpClientAdapter = api;
  return (CatalogueRepository(client: client), api);
}

void main() {
  test('the strip asks for what the website home asks for', () async {
    final (repo, api) = _repo();
    final videos = await repo.platformVideos();

    final request = api.asked.single;
    expect(request.path, '/videos');
    expect(request.queryParameters['uncategorized'], 1);
    expect(request.queryParameters['per_page'], 4);
    // No sort: the server's default order is the one that puts pinned videos first.
    expect(request.queryParameters.containsKey('sort'), isFalse);
    expect(videos.map((v) => v.id), [33, 34]);
  });

  testWidgets('home shows the getting-started strip, in the order the server sent',
      (tester) async {
    final (repo, _) = _repo();
    await tester.pumpWidget(ProviderScope(
      overrides: [
        catalogueRepositoryProvider.overrideWithValue(repo),
        sessionProvider.overrideWith(_SignedOut.new),
      ],
      child: MaterialApp(
        locale: const Locale('ar'),
        localizationsDelegates: L10n.localizationsDelegates,
        supportedLocales: L10n.supportedLocales,
        home: const HomeScreen(),
      ),
    ));
    await tester.pumpAndSettle();

    final strip = find.text('تعرّف على المنصة');
    await tester.scrollUntilVisible(strip, 200);
    expect(strip, findsOneWidget);
    expect(find.text('طريقك الذهبي'), findsOneWidget);
    // In the order the server returned, which is the pinned order.
    expect(tester.getTopLeft(find.text('طريقك الذهبي')).dy,
        lessThan(tester.getTopLeft(find.text('كيف تشترك')).dy));
  });

  testWidgets('the vet-only lock says what to do, and the button goes to verification',
      (tester) async {
    final router = GoRouter(routes: [
      GoRoute(path: '/', builder: (_, _) => const Scaffold(body: VerifyToWatchPrompt())),
      GoRoute(path: '/verify', builder: (_, _) => const Scaffold(body: Text('verify-screen'))),
    ]);
    await tester.pumpWidget(MaterialApp.router(
      locale: const Locale('ar'),
      localizationsDelegates: L10n.localizationsDelegates,
      supportedLocales: L10n.supportedLocales,
      routerConfig: router,
    ));
    await tester.pumpAndSettle();

    expect(find.text('وثّق حسابك كطبيب بيطري للمشاهدة'), findsOneWidget);
    await tester.tap(find.text('توثيق الحساب الآن'));
    await tester.pumpAndSettle();
    expect(find.text('verify-screen'), findsOneWidget);
  });
}
