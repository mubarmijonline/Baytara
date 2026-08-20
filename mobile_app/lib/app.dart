import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/i18n/app_localizations.dart';
import 'core/i18n/locale_controller.dart';
import 'core/theme/app_theme.dart';
import 'features/payments/application/checkout_controller.dart';
import 'features/payments/application/deep_links.dart';
import 'router/app_router.dart';

class BaytaraApp extends ConsumerStatefulWidget {
  const BaytaraApp({super.key});

  @override
  ConsumerState<BaytaraApp> createState() => _BaytaraAppState();
}

class _BaytaraAppState extends ConsumerState<BaytaraApp> {
  final _deepLinks = DeepLinkService();

  @override
  void initState() {
    super.initState();
    // Started once for the life of the app so a payment return is caught whether the app
    // was running or cold started.
    _deepLinks.start(_onDeepLink);
  }

  void _onDeepLink(Uri uri) {
    final callback = parsePaymentCallback(uri);
    if (callback.paymentId == null) return;
    // Only the id is used, and only to ask the server what happened. The `status` parameter
    // in the URL is never treated as an outcome.
    ref.read(routerProvider).push('/payment/callback?pid=${callback.paymentId}');
  }

  @override
  void dispose() {
    _deepLinks.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final locale = ref.watch(localeProvider);

    return MaterialApp.router(
      onGenerateTitle: (context) => L10n.of(context).appName,
      debugShowCheckedModeBanner: false,
      routerConfig: ref.watch(routerProvider),

      // Arabic first. Directionality follows the locale automatically, so switching to
      // English flips the whole tree to LTR without any per-widget handling.
      locale: locale,
      supportedLocales: supportedLocales,
      localizationsDelegates: const [
        L10n.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],

      theme: AppTheme.forLocale(locale),
    );
  }
}
