// Whether this build may offer a purchase at all.
//
// **Decided 2026-10-04: enrolment is website-only, on every platform.** The apps browse the
// catalogue, show prices, and play what the account already owns. Enrolling, buying and
// renewing all happen on baytara.app. This supersedes the 2026-09-22 reader model, which
// was iOS-only and kept in-app checkout on Android.
//
// On iOS there is **no link out and no mention of the website** where a buy button would
// be. A button, a link, or a sentence sending the user to any purchasing mechanism other
// than In-App Purchase is what App Store Guideline 3.1.1 refuses, and the app is published
// under an account that is not Baytara's own, which leaves no room for a grey area. The
// copy there is neutral: enrolment is not available in the app.
//
// Android has no such clause, so it names the website -- as plain text, never a tappable
// link, so the same widget is safe on both platforms.
//
// The checkout code (buy screen, gateway, payment return) is kept but has no route: if the
// client later wants in-app selling, this flag and the routes come back, and on iOS that
// means StoreKit plus a backend receipt-validation endpoint.
import 'package:flutter/foundation.dart';

import '../../../core/i18n/app_localizations.dart';

abstract final class PurchaseAvailability {
  /// True when this build may take the user to checkout. False everywhere: enrolment is
  /// website-only.
  ///
  /// Every place that used to start a purchase asks this first -- course detail, video
  /// detail, the renewal prompt on the learning shelf, the pricing page and the player's
  /// refusal view. There is a test that says so.
  static bool get purchasesEnabled => false;

  /// True when a price may be displayed even though buying is not offered. Showing what
  /// something costs is not a call to action, and a catalogue with no prices is worse for
  /// the reader and no safer at review.
  static bool get pricesVisible => true;

  /// True when the copy may name baytara.app as the place to enrol. Never on iOS.
  static bool get mayNameWebsite => defaultTargetPlatform != TargetPlatform.iOS;

  /// What is shown where a buy, enrol or renew button would otherwise be. Plain text only:
  /// a screen showing this must not also open a URL (see purchase_availability_test).
  static String unavailableNotice(L10n l) =>
      mayNameWebsite ? l.enrollOnWebsite : l.checkoutUnavailableOnThisPlatform;
}
