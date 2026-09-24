// The router. Screens arrive milestone by milestone; the shell and the guards are here so
// nothing added later can quietly bypass them.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/i18n/app_localizations.dart';
import '../core/providers.dart';
import '../features/auth/data/auth_dto.dart';
import '../features/auth/domain/session.dart';
import '../features/auth/ui/devices_screen.dart';
import '../features/auth/ui/phone_gate_screen.dart';
import '../features/auth/ui/sign_in_screen.dart';
import '../features/account/ui/info_screens.dart';
import '../features/account/ui/notifications_screen.dart';
import '../features/account/ui/profile_screen.dart';
import '../features/account/ui/settings_screen.dart';
import '../features/catalogue/ui/course_detail_screen.dart';
import '../features/catalogue/ui/bundles_screen.dart';
import '../features/catalogue/ui/business_screen.dart';
import '../features/catalogue/ui/content_screen.dart';
import '../features/catalogue/ui/courses_screen.dart';
import '../features/catalogue/ui/home_screen.dart';
import '../features/catalogue/ui/how_it_works_screen.dart';
import '../features/catalogue/ui/instructor_screen.dart';
import '../features/catalogue/ui/pricing_screen.dart';
import '../features/catalogue/ui/request_demo_screen.dart';
import '../features/catalogue/ui/video_detail_screen.dart';
import '../features/catalogue/ui/videos_screen.dart';
import '../features/exam/ui/exam_screen.dart';
import '../features/learning/ui/certificate_screen.dart';
import '../features/library/ui/book_detail_screen.dart';
import '../features/library/ui/library_screen.dart';
import '../features/onboarding/ui/onboarding_screen.dart';
import '../features/learning/ui/my_learning_screen.dart';
import '../features/payments/data/payment_dto.dart';
import '../features/payments/ui/buy_screen.dart';
import '../features/payments/ui/payment_return_screen.dart';
import '../features/payments/ui/payments_screen.dart';
import '../features/player/ui/player_screen.dart';
import '../features/verification/ui/verify_screen.dart';
import 'guards.dart';
import 'splash_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: Routes.splash,
    // Re-runs redirect whenever the session changes: a sign-out mid-session must eject the
    // user from a protected screen rather than leaving them on a page that no longer loads.
    refreshListenable: _RouterListenable(ref),
    redirect: (context, state) {
      final to = guardRedirect(
        session: ref.read(sessionProvider),
        location: state.matchedLocation,
        onboardingSeen: ref.read(onboardingSeenProvider),
      );
      // The device screen reached from a sign-in refusal is the one authed-looking route a
      // signed-out user must be able to see. Without this the guard would bounce them
      // straight back to the sign-in they just failed.
      if (state.matchedLocation == Routes.devicesBlocking) return null;
      return to;
    },
    routes: [
      GoRoute(path: Routes.splash, builder: (_, _) => const SplashScreen()),
      GoRoute(path: Routes.onboarding, builder: (_, _) => const OnboardingScreen()),
      ShellRoute(
        builder: (context, state, child) =>
            _TabShell(location: state.matchedLocation, child: child),
        routes: [
          GoRoute(path: Routes.home, builder: (_, _) => const HomeScreen()),
          GoRoute(path: Routes.courses, builder: (_, _) => const CoursesScreen()),
          GoRoute(path: Routes.content, builder: (_, _) => const ContentScreen()),
          GoRoute(path: Routes.dashboard, builder: (_, _) => const MyLearningScreen()),
        ],
      ),
      GoRoute(
        path: Routes.signIn,
        builder: (_, state) => SignInScreen(next: state.uri.queryParameters['next']),
      ),
      GoRoute(
        path: Routes.phoneGate,
        builder: (_, state) => PhoneGateScreen(next: state.uri.queryParameters['next']),
      ),
      // Pushed by the sign-in screen on 403 device_limit_reached, seeded with the list the
      // refusal already carried.
      GoRoute(
        path: Routes.devicesBlocking,
        builder: (_, state) => DevicesScreen(
          initial: state.extra as DeviceList?,
          blocking: true,
        ),
      ),
      GoRoute(path: Routes.devices, builder: (_, _) => const DevicesScreen()),
      GoRoute(path: '/account/payments', builder: (_, _) => const PaymentsScreen()),

      // Guard rule 4 skips this entirely for an already-verified vet.
      GoRoute(path: Routes.verify, builder: (_, _) => const VerifyScreen()),
      GoRoute(path: '/account/profile', builder: (_, _) => const ProfileScreen()),
      GoRoute(path: '/account/notifications',
          builder: (_, _) => const NotificationsScreen()),
      GoRoute(path: '/account/settings', builder: (_, _) => const SettingsScreen()),

      // Where the gateway's deep link lands. Confirms with the server; the URL's `status`
      // parameter is not consulted.
      GoRoute(
        path: '/payment/callback',
        builder: (_, state) => PaymentReturnScreen(
          paymentId: int.parse(state.uri.queryParameters['pid'] ?? '0'),
        ),
      ),

      // Buying. `kind` decides which of the four flows this is; `?kind=renewal` is where a
      // lapsed enrolment and an access_expired refusal both lead.
      GoRoute(
        path: '/buy/:slug',
        builder: (_, state) {
          final q = state.uri.queryParameters;
          return BuyScreen(
            kind: PaymentKind.fromWire(q['kind']),
            courseId: int.tryParse(q['course_id'] ?? ''),
            bundleId: int.tryParse(q['bundle_id'] ?? ''),
            videoId: int.tryParse(q['video_id'] ?? ''),
            title: q['title'],
          );
        },
      ),

      // Catalogue detail routes sit outside the tab shell so they push over it with a
      // back button, rather than swapping the tab content underneath the bar.
      GoRoute(
        path: '/courses/:slug',
        builder: (_, state) =>
            CourseDetailScreen(slug: state.pathParameters['slug']!),
      ),
      // The exam. Same path the website uses, so a link to it works on either.
      GoRoute(
        path: '/courses/:slug/exam',
        builder: (_, state) => ExamScreen(slug: state.pathParameters['slug']!),
      ),
      GoRoute(path: '/videos', builder: (_, _) => const VideosScreen()),

      // Was missing entirely: every video card pushes this, so tapping one did nothing.
      GoRoute(
        path: '/videos/:id',
        builder: (_, state) =>
            VideoDetailScreen(videoId: int.parse(state.pathParameters['id']!)),
      ),

      // Also dead until now: the player's refusal screen sends a would-be buyer here.
      GoRoute(path: '/pricing', builder: (_, _) => const PricingScreen()),
      GoRoute(path: '/business', builder: (_, _) => const BusinessScreen()),
      GoRoute(
        path: '/business/request',
        builder: (_, state) => RequestDemoScreen(
          kind: state.uri.queryParameters['kind'] == 'specialist'
              ? DemoRequestKind.specialist
              : DemoRequestKind.demo,
        ),
      ),
      GoRoute(path: '/how-it-works', builder: (_, _) => const HowItWorksScreen()),
      GoRoute(path: '/about', builder: (_, _) => const AboutScreen()),
      GoRoute(path: '/contact', builder: (_, _) => const ContactScreen()),
      GoRoute(path: '/privacy', builder: (_, _) => const PrivacyScreen()),
      GoRoute(path: '/bundles', builder: (_, _) => const BundlesScreen()),
      GoRoute(path: '/instructors', builder: (_, _) => const InstructorsScreen()),
      GoRoute(
        path: '/instructors/:id',
        builder: (_, state) =>
            InstructorScreen(instructorId: int.parse(state.pathParameters['id']!)),
      ),
      GoRoute(path: '/paths', builder: (_, _) => const PathsScreen()),
      GoRoute(
        path: '/paths/:slug',
        builder: (_, state) =>
            PathDetailScreen(slug: state.pathParameters['slug']!),
      ),
      // The library. Two shelves, articles and book summaries, exactly as the website
      // carries them -- `?shelf=books` on either side opens the same one.
      GoRoute(
        path: '/library',
        builder: (_, state) =>
            LibraryScreen(shelf: state.uri.queryParameters['shelf'] ?? 'articles'),
      ),
      GoRoute(
        path: '/library/:slug',
        builder: (_, state) =>
            BookDetailScreen(slug: state.pathParameters['slug']!),
      ),

      // The blog index became the library in September; the website redirects the same
      // way. Article URLs are unchanged, so nothing shared before then breaks.
      GoRoute(path: '/blog', redirect: (_, _) => '/library'),
      GoRoute(
        path: '/articles/:slug',
        builder: (_, state) => ArticleScreen(slug: state.pathParameters['slug']!),
      ),

      // Public: anyone holding the serial can verify a certificate, no account needed.
      // Two kinds of serial, one screen. The verification falls through from one endpoint
      // to the other, so either link opens.
      GoRoute(
        path: '/completion-certificates/:serial',
        builder: (_, state) =>
            CertificateScreen(serial: state.pathParameters['serial']!),
      ),
      GoRoute(
        path: '/certificates/:serial',
        builder: (_, state) =>
            CertificateScreen(serial: state.pathParameters['serial']!),
      ),

      // The player. Routes.isPlayer() matches this prefix, so guard rule 3 applies.
      GoRoute(
        path: '/learn/:courseId/:lessonId',
        builder: (_, state) => PlayerScreen(
          lessonId: int.parse(state.pathParameters['lessonId']!),
          courseId: int.tryParse(state.pathParameters['courseId'] ?? ''),
        ),
      ),
    ],
  );
});

/// Re-runs the redirect when either the session or the onboarding flag changes. Without the
/// second, a first-run user finishing the tour would sit on it until something else moved.
class _RouterListenable extends ChangeNotifier {
  _RouterListenable(Ref ref) {
    ref.listen(sessionProvider, (_, _) => notifyListeners());
    ref.listen(onboardingSeenProvider, (_, _) => notifyListeners());
  }
}

/// The four bottom tabs, matching frontend/web/src/components/TabBar.jsx exactly so the app
/// and the mobile web agree on what the primary destinations are.
class _TabShell extends ConsumerWidget {
  const _TabShell({required this.location, required this.child});

  final String location;
  final Widget child;

  /// The last tab is the account, but "حسابي" promises one to a visitor who has no account
  /// yet. Signed out it becomes the way in, and the guard no longer has to explain
  /// itself by bouncing a tap on "my account" to a sign-in screen.
  List<String> _routes(bool signedIn) => [
        Routes.home,
        Routes.courses,
        Routes.content,
        signedIn ? Routes.dashboard : Routes.signIn,
      ];

  int _index(List<String> destinations) {
    final i = destinations.indexWhere(
      (d) => d == Routes.home ? location == Routes.home : location.startsWith(d),
    );
    return i < 0 ? 0 : i;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final onHome = location == Routes.home;
    final signedIn = ref.watch(sessionProvider) is SessionSignedIn;

    return PopScope(
      // Back on a secondary tab returns to Home instead of leaving the app. Only Home
      // itself lets the system close it, which is how a bottom-nav app is expected to
      // behave on Android; previously any tab exited straight to the launcher.
      canPop: onHome,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !onHome) context.go(Routes.home);
      },
      child: _scaffold(context, l, signedIn),
    );
  }

  Widget _scaffold(BuildContext context, L10n l, bool signedIn) {
    final destinations = _routes(signedIn);
    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index(destinations),
        onDestinationSelected: (i) => context.go(destinations[i]),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.home_outlined), label: l.tabHome),
          NavigationDestination(
              icon: const Icon(Icons.school_outlined), label: l.tabCourses),
          NavigationDestination(
              icon: const Icon(Icons.forum_outlined), label: l.tabContent),
          signedIn
              ? NavigationDestination(
                  icon: const Icon(Icons.person_outline), label: l.tabDashboard)
              : NavigationDestination(
                  icon: const Icon(Icons.login_outlined), label: l.tabSignIn),
        ],
      ),
    );
  }
}
