// The guards decide what a user can reach. Getting rule 2 wrong is the expensive one: the
// server refuses POST /video/playback with `phone_required` regardless of entitlement, so a
// phoneless account that slips past the gate reaches a player that can only ever fail.
import 'package:baytara/features/auth/domain/session.dart';
import 'package:baytara/router/guards.dart';
import 'package:flutter_test/flutter_test.dart';

const _withPhone = AuthUser(id: 1, name: 'A', email: 'a@b.c', phone: '01000000000');
const _noPhone = AuthUser(id: 2, name: 'B', email: 'b@b.c');
const _verifiedVet =
    AuthUser(id: 3, name: 'C', email: 'c@b.c', phone: '01000000000', isBaytarian: true);

void main() {
  group('the first-run tour', () {
    test('a fresh install is sent to onboarding before anything else', () {
      // Outranks even the splash: it is the first thing a new install should show.
      expect(
        guardRedirect(
          session: const SessionRestoring(),
          location: '/courses',
          onboardingSeen: false,
        ),
        Routes.onboarding,
      );
      expect(
        guardRedirect(
          session: const SessionSignedIn(_withPhone),
          location: '/learn/1/2',
          onboardingSeen: false,
        ),
        Routes.onboarding,
      );
    });

    test('onboarding itself is allowed through', () {
      expect(
        guardRedirect(
          session: const SessionSignedOut(),
          location: Routes.onboarding,
          onboardingSeen: false,
        ),
        isNull,
      );
    });

    test('an unread flag decides nothing', () {
      // null means "not loaded yet". Treating it as false would flash the tour at returning
      // users on every cold start.
      expect(
        guardRedirect(
          session: const SessionSignedOut(),
          location: '/courses',
          onboardingSeen: null,
        ),
        isNull,
      );
    });

    test('once seen, the route sends you home instead of replaying it', () {
      expect(
        guardRedirect(
          session: const SessionSignedOut(),
          location: Routes.onboarding,
          onboardingSeen: true,
        ),
        Routes.home,
      );
    });

    test('having seen it does not otherwise change the guards', () {
      expect(
        guardRedirect(
          session: const SessionSignedIn(_noPhone),
          location: '/learn/1/2',
          onboardingSeen: true,
        ),
        startsWith(Routes.phoneGate),
      );
    });
  });

  group('while restoring', () {
    test('everything waits on the splash screen', () {
      expect(
        guardRedirect(session: const SessionRestoring(), location: '/courses'),
        Routes.splash,
      );
      expect(
        guardRedirect(session: const SessionRestoring(), location: Routes.splash),
        isNull,
      );
    });
  });

  group('signed out', () {
    test('public routes are allowed', () {
      for (final route in ['/', '/courses', '/courses/anatomy', '/blog', '/pricing']) {
        expect(guardRedirect(session: const SessionSignedOut(), location: route), isNull,
            reason: '$route should be public');
      }
    });

    test('a protected route redirects to sign-in and keeps the destination', () {
      final result =
          guardRedirect(session: const SessionSignedOut(), location: '/learn/12/34');
      expect(result, startsWith(Routes.signIn));
      expect(result, contains(Uri.encodeComponent('/learn/12/34')));
    });
  });

  group('the phone gate', () {
    test('a signed-in user with no phone cannot reach the player', () {
      final result =
          guardRedirect(session: const SessionSignedIn(_noPhone), location: '/learn/12/34');
      expect(result, startsWith(Routes.phoneGate));
      expect(result, contains(Uri.encodeComponent('/learn/12/34')));
    });

    test('it outranks every other destination, catalogue included', () {
      expect(
        guardRedirect(session: const SessionSignedIn(_noPhone), location: '/courses'),
        startsWith(Routes.phoneGate),
      );
    });

    test('once a phone exists the gate stops intercepting', () {
      expect(
        guardRedirect(session: const SessionSignedIn(_withPhone), location: '/courses'),
        isNull,
      );
      expect(
        guardRedirect(session: const SessionSignedIn(_withPhone), location: Routes.phoneGate),
        Routes.home,
      );
    });
  });

  group('player entitlement', () {
    test('a lesson the server would refuse does not open the player', () {
      expect(
        guardRedirect(
          session: const SessionSignedIn(_withPhone),
          location: '/learn/12/34',
          canPlayTarget: false,
        ),
        Routes.dashboard,
      );
    });

    test('unknown entitlement is allowed through so the player can show the real reason', () {
      expect(
        guardRedirect(session: const SessionSignedIn(_withPhone), location: '/learn/12/34'),
        isNull,
      );
    });
  });

  group('verification', () {
    test('an already-verified vet is sent away from the verification flow', () {
      expect(
        guardRedirect(session: const SessionSignedIn(_verifiedVet), location: '/verify'),
        Routes.dashboard,
      );
    });

    test('an unverified user may start it', () {
      expect(
        guardRedirect(session: const SessionSignedIn(_withPhone), location: '/verify'),
        isNull,
      );
    });
  });

  group('the library', () {
    // Public on purpose: the summary itself asks for an account, the page that describes
    // it does not, or it could never be found or shared.
    for (final location in ['/library', '/library/merck-summary', '/articles/a-post']) {
      test('$location is open to a visitor', () {
        expect(
          guardRedirect(session: const SessionSignedOut(), location: location),
          isNull,
        );
      });
    }
  });

  test('a signed-in user has no use for the sign-in screen', () {
    expect(
      guardRedirect(session: const SessionSignedIn(_withPhone), location: Routes.signIn),
      Routes.home,
    );
  });
}
