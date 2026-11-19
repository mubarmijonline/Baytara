// Website-only enrolment, and the rules that keep it true.
//
// Decided 2026-10-04: on every platform the app shows prices and plays what the account
// owns, and offers no way to enrol, buy or renew. On iOS it does not even name the website,
// because the app is published under an account that is not Baytara's and Guideline 3.1.1
// leaves no grey area there. A single buy button that forgets to ask is an App Store
// rejection that nobody sees until review, which is why the last tests here read the
// source rather than trusting a comment.
import 'dart:io';

import 'package:baytara/features/payments/data/purchase_availability.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

/// The checkout screens are kept for a possible return of in-app selling, but have no
/// route. They are the only files allowed to open the gateway.
bool _isUnroutedCheckout(String path) => path.contains('features/payments/ui/');

void main() {
  tearDown(() => debugDefaultTargetPlatformOverride = null);

  test('iOS offers no purchase', () {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    expect(PurchaseAvailability.purchasesEnabled, isFalse);
  });

  test('Android offers no purchase either', () {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    expect(PurchaseAvailability.purchasesEnabled, isFalse);
  });

  test('prices stay visible', () {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    expect(PurchaseAvailability.pricesVisible, isTrue,
        reason: 'a price is not a call to action; a catalogue without one is just worse');
  });

  test('only Android names the website', () {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    expect(PurchaseAvailability.mayNameWebsite, isFalse);
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    expect(PurchaseAvailability.mayNameWebsite, isTrue);
  });

  test('the neutral copy does not mention the website', () {
    for (final arb in ['lib/core/i18n/app_ar.arb', 'lib/core/i18n/app_en.arb']) {
      final line = File(arb)
          .readAsLinesSync()
          .firstWhere((l) => l.contains('"checkoutUnavailableOnThisPlatform"'));
      expect(line.toLowerCase(), isNot(contains('baytara.app')), reason: arb);
    }
  });

  test('a screen that shows the notice never makes it tappable', () {
    // Turning the notice into a link or a button is the thing Guideline 3.1.1 prohibits
    // outright, so a screen that shows it must not also be able to open a URL.
    final offenders = <String>[];
    for (final entity in Directory('lib').listSync(recursive: true)) {
      if (entity is! File || !entity.path.endsWith('.dart')) continue;
      if (_isUnroutedCheckout(entity.path)) continue;
      final source = entity.readAsStringSync();
      if (!source.contains('unavailableNotice') && !source.contains('enrollOnWebsite')) {
        continue;
      }
      if (source.contains('launchUrl') || source.contains('url_launcher')) {
        offenders.add(entity.path);
      }
    }
    expect(offenders, isEmpty,
        reason: 'these show the enrolment notice and can also open a URL');
  });

  test('nothing routes to checkout', () {
    // There is no /buy or /payment/callback route any more. A push to one would land on
    // go_router's error page, and a route added back would reopen in-app selling.
    final offenders = <String>[];
    for (final entity in Directory('lib').listSync(recursive: true)) {
      if (entity is! File || !entity.path.endsWith('.dart')) continue;
      if (_isUnroutedCheckout(entity.path)) continue;
      final source = entity.readAsStringSync();
      if (source.contains("'/buy/") || source.contains("path: '/payment/callback'")) {
        offenders.add(entity.path);
      }
    }
    expect(offenders, isEmpty, reason: 'these route to the retired in-app checkout');
  });
}
