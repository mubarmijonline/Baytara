// The reader model, and the rule that keeps it true.
//
// Decided 2026-09-22: on iOS the app shows prices and plays what the account owns, and
// offers no way to buy and no link to one. A single buy button that forgets to ask is an
// App Store rejection that nobody sees until review, which is why the last test here reads
// the source rather than trusting a comment.
import 'dart:io';

import 'package:baytara/features/payments/data/purchase_availability.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  tearDown(() => debugDefaultTargetPlatformOverride = null);

  test('iOS offers no purchase', () {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    expect(PurchaseAvailability.purchasesEnabled, isFalse);
  });

  test('iOS still shows prices', () {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    expect(PurchaseAvailability.pricesVisible, isTrue,
        reason: 'a price is not a call to action; a catalogue without one is just worse');
  });

  test('Android keeps in-app checkout', () {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    expect(PurchaseAvailability.purchasesEnabled, isTrue);
  });

  test('the screen that names the website never makes it tappable', () {
    // The reader-model copy names baytara.app in a sentence, which is the risk the client
    // chose to take. Turning it into a link or a button is the thing Guideline 3.1.1
    // prohibits outright, so a screen that shows this message must not also be able to
    // open a URL.
    final offenders = <String>[];
    for (final entity in Directory('lib').listSync(recursive: true)) {
      if (entity is! File || !entity.path.endsWith('.dart')) continue;
      final source = entity.readAsStringSync();
      if (!source.contains('checkoutUnavailableOnThisPlatform')) continue;
      // buy_screen opens the gateway on Android, where purchases are allowed; it is the
      // only screen where both may legitimately appear.
      if (entity.path.endsWith('buy_screen.dart')) continue;
      if (source.contains('launchUrl') || source.contains('url_launcher')) {
        offenders.add(entity.path);
      }
    }
    expect(offenders, isEmpty,
        reason: 'these show the website sentence and can also open a URL');
  });

  test('every screen that opens checkout asks first', () {
    // Guideline 3.1.1 is enforced against the shipped binary, not against intentions, so
    // this reads the tree. If a new screen pushes /buy/ without consulting the flag, the
    // reader model has a hole in it and this fails at the moment the hole is made.
    final offenders = <String>[];
    for (final entity in Directory('lib').listSync(recursive: true)) {
      if (entity is! File || !entity.path.endsWith('.dart')) continue;
      final source = entity.readAsStringSync();
      // The router's own route declaration is the destination, not an entry point to it.
      if (entity.path.endsWith('router/app_router.dart')) continue;
      if (!source.contains("'/buy/")) continue;
      if (!source.contains('PurchaseAvailability')) offenders.add(entity.path);
    }
    expect(offenders, isEmpty,
        reason: 'these push /buy/ without checking whether buying is allowed');
  });
}
