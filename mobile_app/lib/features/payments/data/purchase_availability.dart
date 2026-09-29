// Whether this build may offer a purchase at all.
//
// **Decided 2026-09-22: the reader model on iOS.** Selling happens on the website; the iOS
// app shows prices and plays what the account already owns, and offers no way to buy.
//
// The part of that decision that is easy to get wrong, and expensive to get wrong at
// review: **there is no link out either.** "Sell on the website, and put a direct payment
// link in the app" is not a middle ground -- a button or link that sends the user to any
// purchasing mechanism other than In-App Purchase is the precise thing App Store Guideline
// 3.1.1 prohibits, and it is rejected exactly as an in-app gateway would be. The
// exceptions that exist (the US storefront after the Epic injunction, the EU under the
// DMA, and the reader-app external-link entitlement) are storefront- and
// entitlement-specific and none of them applies to an Egyptian storefront by default. This
// area moved repeatedly through 2025 and 2026, so read the current guideline text before
// submitting rather than trusting this comment.
//
// So the direct payment link belongs where Apple has no say: WhatsApp, email, the website
// itself. A student who is sent https://baytara.app/buy/<slug> pays in their browser and
// then signs in to watch. That is the same journey, and it costs nothing in commission.
//
// Android keeps full in-app checkout. Play's billing policy has its own rules about
// digital content and they deserve their own check before launch, but Play does not have
// Apple's anti-steering clause.
//
// If the client later prefers to sell inside the iOS app, this becomes the StoreKit path
// and the backend gains a receipt-validation endpoint. Nothing else in the app changes,
// which is the whole point of the flag.
import 'package:flutter/foundation.dart';

abstract final class PurchaseAvailability {
  /// True when this build may take the user to checkout.
  ///
  /// Every purchase entry point asks this first -- course detail, video detail, the
  /// renewal prompt on the learning shelf, the pricing page and the buy screen itself.
  /// That list is exhaustive and there is a test that says so; a new buy button that
  /// forgets to ask is an App Store rejection nobody sees coming.
  static bool get purchasesEnabled {
    if (kIsWeb) return true;
    // defaultTargetPlatform rather than dart:io Platform: the latter does not exist on web
    // and its mere import breaks the web build.
    if (defaultTargetPlatform == TargetPlatform.iOS) return false;
    return true;
  }

  /// The copy shown in place of a buy button names the website, at the client's request
  /// (2026-09-23), and it must stay **plain text**. Not a link, not a button, not a
  /// `url_launcher` call: a tappable route to an external purchase is what Guideline 3.1.1
  /// prohibits outright, while naming the site in a sentence is the grey area the client
  /// has chosen to accept. Anyone tempted to make it tappable "for convenience" would be
  /// converting a calculated risk into a certain rejection.
  ///
  /// True when a price may be displayed even though buying is not offered. Under the reader
  /// model this stays true: showing what something costs is not a call to action, and a
  /// catalogue with no prices is worse for the reader and no safer at review.
  static bool get pricesVisible => true;
}
