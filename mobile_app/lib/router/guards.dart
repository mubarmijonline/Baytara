// Route guards, as pure functions.
//
// The order below is the contract (docs/FLUTTER_APP_PROMPT.md §6) and it is not
// interchangeable: the phone gate has to outrank everything else a signed-in user can
// reach, because POST /video/playback refuses `phone_required` no matter how entitled the
// account is.
//
// These are pure on purpose. go_router's redirect is awkward to test; a function that takes
// a state and a location and returns a destination is not.
import '../features/auth/domain/session.dart';

abstract final class Routes {
  static const splash = '/splash';
  static const onboarding = '/onboarding';
  static const home = '/';
  static const courses = '/courses';
  static const content = '/content';
  static const dashboard = '/dashboard';
  static const signIn = '/auth';
  static const phoneGate = '/auth/phone';
  static const devices = '/account/devices';

  /// Device management reached from a sign-in refusal. Distinct from [devices] because the
  /// user has no token yet, so the guard has to let it through.
  static const devicesBlocking = '/auth/devices';
  static const verify = '/verify';

  /// Reachable without a token.
  static const _public = <String>{
    home, courses, content, signIn, '/videos', '/bundles', '/paths',
    '/instructors', '/blog', '/about', '/contact', '/pricing', '/certificates',
    // The library is public on purpose, book pages included: the summary itself asks for
    // an account, the page that describes it does not.
    '/library', '/articles',
  };

  static bool isPublic(String location) {
    if (_public.contains(location)) return true;
    return _public.any((p) => p != home && location.startsWith('$p/'));
  }

  static bool isPlayer(String location) => location.startsWith('/learn/');
  static bool isVerification(String location) => location.startsWith(verify);
  static bool isAuthFlow(String location) => location.startsWith(signIn);
}

/// Where the router should send a request for [location], or null to allow it through.
///
/// [canPlayTarget] answers guard 3 for player routes: null means "not known yet", which is
/// allowed through so the player screen itself can mint and show the real refusal.
String? guardRedirect({
  required SessionState session,
  required String location,
  bool? canPlayTarget,
  bool? onboardingSeen,
}) {
  // The first-run tour outranks everything, including the splash: it is the first thing a
  // new install should show. `null` means the flag has not been read yet, and deciding then
  // would flash the tour at returning users on every cold start.
  if (onboardingSeen == false) {
    return location == Routes.onboarding ? null : Routes.onboarding;
  }
  // Once seen, the route has nothing left to offer.
  if (onboardingSeen == true && location == Routes.onboarding) {
    return session is SessionSignedIn ? Routes.home : Routes.home;
  }

  // Still reading secure storage. Deciding now would bounce a signed-in user to the
  // catalogue for the half-second before their token loads.
  if (session is SessionRestoring) {
    return location == Routes.splash ? null : Routes.splash;
  }

  // 1. No token -> public routes only.
  if (session is SessionSignedOut) {
    if (location == Routes.splash) return Routes.home;
    if (Routes.isPublic(location) || Routes.isAuthFlow(location)) return null;
    return '${Routes.signIn}?next=${Uri.encodeComponent(location)}';
  }

  final user = (session as SessionSignedIn).user;
  if (location == Routes.splash) return Routes.home;

  // 2. Signed in without a phone -> the gate, wherever they were going.
  if (!user.hasPhone && location != Routes.phoneGate) {
    return '${Routes.phoneGate}?next=${Uri.encodeComponent(location)}';
  }
  // ...and once they have one, the gate has nothing to say.
  if (user.hasPhone && location == Routes.phoneGate) return Routes.home;

  // 3. Player route the server would refuse -> send them to the reason instead of a
  //    player that mints an OTP only to throw it away.
  if (Routes.isPlayer(location) && canPlayTarget == false) {
    return Routes.dashboard;
  }

  // 4. Already verified -> verification has nothing to offer.
  if (Routes.isVerification(location) && user.isBaytarian) {
    return Routes.dashboard;
  }

  // A signed-in user does not need the sign-in screen.
  if (Routes.isAuthFlow(location) && location != Routes.phoneGate) return Routes.home;

  return null;
}
