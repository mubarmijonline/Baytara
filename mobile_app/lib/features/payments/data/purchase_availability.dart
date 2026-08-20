// Whether this build may offer a purchase at all.
//
// Apple requires In-App Purchase for digital content, and the Fawaterak hosted checkout
// will very likely draw a Guideline 3.1.1 rejection. That decision is deliberately DEFERRED
// (see the plan, Part 5): it does not bind until an iOS submission, which is milestone 8.
//
// This flag exists so deferring stays cheap. Every purchase entry point in the app asks it
// first, so switching iOS to the "reader" model later is one line here rather than an edit
// across the catalogue, course detail, pricing and bundle screens. Retrofitting it after
// those screens exist is the expensive version of the same change.
//
// When the decision is made, exactly one of these happens:
//   - reader model  -> return false on iOS; prices stay visible, buy buttons do not
//   - real IAP      -> the iOS path routes to StoreKit instead of the hosted gateway, and
//                      the backend gains a receipt-validation endpoint
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';

abstract final class PurchaseAvailability {
  /// True when this build may show prices and take the user to checkout.
  ///
  /// Android: yes, Fawaterak checkout is fine on Play for a service like this.
  /// iOS: currently yes, because the decision is not made. **This is the line to change.**
  static bool get purchasesEnabled {
    if (kIsWeb) return true;
    if (Platform.isIOS) {
      // NOT YET DECIDED. Flip to false for the reader model before any App Store
      // submission, or replace this branch with the StoreKit path.
      return true;
    }
    return true;
  }

  /// True when a price may be displayed even though buying is not offered. Under the reader
  /// model this stays true: showing what something costs is allowed, linking out to buy it
  /// is not.
  static bool get pricesVisible => true;
}
