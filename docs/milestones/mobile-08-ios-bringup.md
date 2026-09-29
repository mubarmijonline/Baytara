# mobile-08 — iOS bring-up

**Status: BLOCKED. Cannot be completed on this machine.**

iOS apps cannot be compiled or signed without macOS, and this is a Linux server. Nothing in
`ios/` has ever been built. This document is a handover, not a report of work done.

## What is true right now

**No iOS code in this repository has ever been compiled.** Not once. `flutter analyze` checks
Dart, not Swift, and the Android build never touches `ios/`. Treat every Swift file as
unproven.

That includes `CaptureGuard.swift`, which is the **entire iOS content-protection story**
outside of FairPlay itself.

## Prepared during milestones 0-7

These were done as the relevant milestone went by, so the first Mac build starts from
something coherent rather than from `flutter create` defaults:

| | |
|---|---|
| `ios/Runner/CaptureGuard.swift` | capture detection, cover view, screenshot and mirroring reporting, app-switcher blur |
| `ios/Runner/AppDelegate.swift` | instantiates and retains the guard |
| Bundle identifier | `app.baytara.app`, matching Android and distinct from the Capacitor shell's `app.baytara.mobile` |
| Deployment target | 15.0 (Flutter 3.47's default; VdoCipher needs 12+, so this clears it) |
| `Info.plist` | camera and photo-library usage strings |
| Dart | fully cross-platform; no Android-only branches outside the capture guards |

### Two defects found and fixed while writing this handover

Both would have broken the first Mac build, and neither is visible from Linux without
looking for it:

1. **`CaptureGuard.swift` was not in `project.pbxproj`.** `AppDelegate.swift` referenced it,
   but Xcode only compiles files listed in the project, so the build would have failed with
   "cannot find CaptureGuard in scope". Added at all four required points: `PBXBuildFile`,
   `PBXFileReference`, group membership, and the Sources build phase.
2. **`NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` were missing.** iOS
   *terminates* an app that touches the camera or photo library without them, so
   verification (milestone 6) would have crashed the app on first use rather than showing an
   error.

## What has to happen on a Mac

In order. Steps 1 to 3 are mechanical; step 4 is the one that can change the product.

1. **`flutter build ios --debug`** and fix what falls out. First compile of ~200 lines of
   never-built Swift; expect real errors.
2. **CocoaPods**: no `Podfile` exists yet — it is generated on the first macOS build. The
   VdoCipher, Google Sign-In, image_picker and custom-tabs pods resolve then, and version
   conflicts surface then too.
3. **Signing**: an Apple Developer account ($99/yr), a team, and provisioning for
   `app.baytara.app`.
4. **Verify FairPlay on a real device.** See below.

## The one genuinely open risk

**FairPlay blanking a screen recording is the whole iOS protection story**, and it is
unproven on this VdoCipher account.

Android does not depend on it: `FLAG_SECURE` blanks the picture and
`ALLOW_CAPTURE_BY_NONE` silences the audio, both verified present in the built APK. iOS has
no equivalent to either. It has FairPlay, plus detection that stops nothing.

So if FairPlay does not blank recordings on this account tier, **iOS has no working content
protection** and the options are all product decisions: refuse playback on iOS, accept the
exposure, or change the VdoCipher plan.

This was flagged during milestone 3 with the recommendation to confirm it **in writing** with
VdoCipher then, so the answer arrived before this milestone rather than at it. The head dev
was named as the person who would know. **It is still outstanding.**

## The other decision this milestone forces

**Apple requires In-App Purchase for digital content**, and the Fawaterak hosted checkout
will very likely draw a Guideline 3.1.1 rejection.

Deliberately deferred since the plan, and kept cheap: every purchase entry point already asks
`PurchaseAvailability.purchasesEnabled`
(`lib/features/payments/data/purchase_availability.dart`). One edit there switches the whole
app:

- **reader model** — return false on iOS. Prices stay visible; buy buttons and any link out
  disappear, because linking out is what the rule actually forbids. No backend work.
- **real IAP** — the iOS branch routes to StoreKit, Apple takes 15-30%, and the backend gains
  a receipt-validation endpoint. Significant work, must be agreed separately.

**No iOS revenue exists until this is decided.**

## Also required before submission, none of it client-side

- **Account deletion.** App Store review asks for it and **no endpoint exists**.
- **Password reset.** **No endpoint exists.** Not a blocker for review, but it will be the
  first support request after launch.
- **Universal Links** now cover the shared library pages as well as the payment return
  (milestone 10). The entitlement is already in the project —
  `ios/Runner/Runner.entitlements`, referenced by all three Runner build configurations —
  so two things are left, both outside this repo:
    1. enable **Associated Domains** for the App ID in the Apple Developer portal, or the
       build is rejected at signing;
    2. publish `apple-app-site-association` on `baytara.app`, which
       `APPLE_TEAM_ID=... deploy/gen_applinks.sh` writes. nginx already has the location
       block and serves it as `application/json`.
  The `components` list in that file must stay in step with the intent filters in
  `AndroidManifest.xml` and with `locationForLink()` in `lib/core/links/app_link.dart`.
- A privacy policy URL (exists, `https://baytara.app/privacy`) and App Privacy answers.

## Acceptance, when a Mac exists

- [ ] `flutter build ipa` succeeds.
- [ ] A protected lesson plays on a real iPhone.
- [ ] **A screen recording of that lesson is black.** If it is not, stop and escalate.
- [ ] Starting a recording pauses playback, covers the surface, and posts one `suspicious`
      event.
- [ ] A screenshot posts a `suspicious` event.
- [ ] Mirroring to an external display pauses playback.
- [ ] The app-switcher snapshot is covered.
- [ ] Sign-in, catalogue, payments (per the IAP decision) and verification all work.
- [ ] Both locales render correctly, RTL included.
- [ ] A `https://baytara.app/library/<slug>` link tapped in Messages or WhatsApp opens the
      app on that book, and opens Safari on a device without the app.
