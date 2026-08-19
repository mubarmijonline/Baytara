# mobile-00 — Flutter toolchain and app skeleton

**Status:** done

## Goal

Stand up a real Flutter project for the Baytara Android/iOS app, with the toolchain
installed on this server, the brand applied, and the three cross-cutting pieces every later
milestone depends on: the HTTP interceptor stack, the route guards, and Arabic-first
localisation.

No product screens. The four tabs render placeholders.

## Decisions taken before building

- **Android first.** iOS source is written where it belongs but never compiled; this is a
  Linux box. Milestone 8 is iOS bring-up.
- **`applicationId` is `app.baytara.app`**, deliberately different from the Capacitor
  shell's `app.baytara.mobile`, so both install side by side during the transition. It is
  immutable once published, which is why it was fixed on day one rather than left as the
  generated `app.baytara.baytara`.
- **The Capacitor shell is untouched.** `mobile/` still builds and still ships.

## Toolchain

Installed on this server, outside `$HOME` so it is not tied to one account:

| | |
|---|---|
| Flutter | 3.47.0 stable, Dart 3.13.0 → `/development/flutter` |
| Android SDK | platform 36, build-tools 36.0.0, platform-tools 37.0.1 → `/development/android-sdk` |
| JDK | system OpenJDK 17.0.19 |

`flutter doctor` is green for the Android toolchain. Chrome and Linux-desktop stay red and
that is correct — neither is a target.

### Two toolchain findings worth recording

1. **`minSdk` is 24, not the 21 the contract doc assumes.** Flutter 3.47 defaults to
   compileSdk 36 / targetSdk 36 / minSdk 24 and no longer supports API < 24. VdoCipher's
   floor is 21, so 24 clears it; the doc's number is simply out of date.

2. **`flutter_secure_storage` is pinned to 10.3.1, not the latest 11.0.0.** v11 requires
   compileSdk 37, and Android 37 now ships as a *minor-versioned* platform directory
   (`android-37.0`) that the current AGP cannot resolve — it looks for `android-37`, and
   `sdkmanager` has no package under that name. The auto-installed platform also reports a
   malformed `AndroidVersion.ApiLevel=37.0`. 10.3.1 targets compileSdk 36 and builds
   cleanly. Revisit when AGP catches up with minor SDK versions.

## What was built

```
mobile_app/lib/
  core/
    network/   dio_client.dart, refresh_interceptor.dart, api_error.dart
    storage/   secure_store.dart, device_id.dart
    i18n/      app_ar.arb, app_en.arb, locale_controller.dart, error_copy.dart
    theme/     tokens.dart, app_theme.dart
    providers.dart
  features/auth/domain/session.dart
  router/      app_router.dart, guards.dart
```

**Theme** is a direct port of `frontend/web/src/theme/tokens.js`, and the font weights
mirror the `@font-face` block in `frontend/web/src/theme/global.css` exactly, so a screen
looks the same in the app as on the site. Thmanyah (Arabic) and Stolzl (Latin) are bundled
from `brand_identity/Fonts/`, with the other script as `fontFamilyFallback` so a mixed-script
line does not fall to tofu.

**`api_error.dart`** is the full server error vocabulary as one enum, read out of the running
backend rather than the contract doc. It carries the codes the doc omits — `access_expired`,
`invalid_course_context`, and the five malformed-event codes — plus two predicates:
`indicatesMissingAppUserAgent` and `indicatesClientBug`, both of which are our bug and are
asserted loudly in debug rather than shown to a user.

**`error_copy.dart`** maps each code to one localised sentence and to a `PlaybackRecovery`.
The distinction that matters: `access_expired` recovers via **renew**, `not_entitled` via
**purchase**. Treating them alike would tell a lapsed customer to re-buy a course they
already paid for, at full price.

**`kAppUserAgent = 'BaytaraApp/1'`** is set on every request. Without it
`POST /video/playback` refuses every capture-protected lesson.

## The refresh bug, and why the test is shaped the way it is

The access token lives 15 minutes, so concurrent 401s are routine. The obvious fix — one
shared in-flight `Future` — **does not work on its own here**, and the test proved it:
`QueuedInterceptor` serialises `onError`, so five 401s are handled one after another, each
finding the previous refresh already finished and the shared future cleared. That yields
five refreshes and five token writes, which is the exact bug the web app shipped once.

The working fix is two mechanisms:

1. compare the token the request *carried* against the token now in storage — if they
   differ, somebody already refreshed and the request only needs replaying;
2. keep the shared future as well, for genuinely overlapping callers.

`test/refresh_single_flight_test.dart` asserts exactly one refresh across five concurrent
401s, and attaches the `Authorization` header the way the real client does, because without
it the comparison in (1) is never exercised.

## Tests

`flutter test` — 22 passing, `flutter analyze` clean.

| File | Covers |
|---|---|
| `refresh_single_flight_test.dart` | one refresh across five concurrent 401s; failed refresh clears both tokens; `device_not_registered` reports its own reason |
| `guards_test.dart` | all four redirects, including that the phone gate outranks every other destination |
| `error_mapping_test.dart` | every wire code round-trips; `access_expired` renews rather than re-purchases; capability-gate codes flagged as our bug |

## Acceptance check

```bash
cd mobile_app && flutter test && flutter analyze && flutter build apk --debug
```

## Not done here, on purpose

Sign-in, catalogue, player, payments, verification — milestones 1 through 7. The four tabs
render placeholders. The guards are real and tested, so nothing added later can quietly
bypass them.

## Open item raised during this milestone

**Stolzl's licence needs checking before any store release.** The zip in
`brand_identity/Fonts/English/` carries a banner from `dafont.style`, a redistribution site.
Stolzl is a commercial typeface. The web app already serves the same files, so the exposure
is not new, but embedding a font in a store-distributed binary is a different and more
scrutinised kind of distribution. Someone should confirm a licence exists, or swap the Latin
face. This is a business question, not a build blocker.
