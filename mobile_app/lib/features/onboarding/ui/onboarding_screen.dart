// First-run tour.
//
// Three pages, shown once per install. What earns a page here is something a new user would
// otherwise discover by hitting a wall: that the catalogue is Arabic and made by practising
// vets, that verification (not payment) is what opens the specialist material, and that
// videos carry their personal details as a watermark. The last one especially — finding that
// out mid-lesson is a worse introduction than being told up front.
//
// It is deliberately short. A tour nobody finishes teaches nothing, so there is a Skip on
// every page and the whole thing is three swipes.
//
// RTL: PageView derives its scroll direction from the ambient Directionality, so in Arabic
// it advances right-to-left on its own. The progress dots and the arrow glyph are the parts
// that need explicit handling, and both are handled below.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.dart';

class OnboardingPageSpec {
  const OnboardingPageSpec({
    required this.icon,
    required this.title,
    required this.body,
    required this.accent,
  });

  final IconData icon;
  final String title;
  final String body;
  final Color accent;
}

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _controller = PageController();
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  List<OnboardingPageSpec> _pages(L10n l) => [
        OnboardingPageSpec(
          icon: Icons.menu_book_outlined,
          title: l.onboard1Title,
          body: l.onboard1Body,
          accent: BrandColors.gold,
        ),
        OnboardingPageSpec(
          icon: Icons.verified_outlined,
          title: l.onboard2Title,
          body: l.onboard2Body,
          accent: const Color(0xFF5AC8A0),
        ),
        OnboardingPageSpec(
          icon: Icons.shield_outlined,
          title: l.onboard3Title,
          body: l.onboard3Body,
          accent: const Color(0xFF7FA0F0),
        ),
      ];

  Future<void> _finish() async {
    await ref.read(onboardingSeenProvider.notifier).complete();
    if (mounted) context.go('/');
  }

  void _next(int total) {
    if (_page >= total - 1) {
      _finish();
      return;
    }
    _controller.nextPage(
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final pages = _pages(l);
    final isLast = _page == pages.length - 1;

    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(gradient: BrandGradients.hero),
        child: SafeArea(
          child: Column(
            children: [
              // Wordmark and Skip on one line: the brand is present from the first screen,
              // and leaving is never more than one tap away.
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 12, 0),
                child: Row(children: [
                  Image.asset('assets/brand/wordmark_white.png', height: 22),
                  const Spacer(),
                  TextButton(
                    onPressed: _finish,
                    style: TextButton.styleFrom(
                      foregroundColor: Colors.white.withValues(alpha: 0.75),
                    ),
                    child: Text(l.onboardSkip),
                  ),
                ]),
              ),
              Expanded(
                child: PageView.builder(
                  controller: _controller,
                  itemCount: pages.length,
                  onPageChanged: (i) => setState(() => _page = i),
                  itemBuilder: (context, i) => _Page(spec: pages[i]),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 28),
                child: Column(
                  children: [
                    _Dots(count: pages.length, active: _page),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: () => _next(pages.length),
                        style: FilledButton.styleFrom(
                          backgroundColor: BrandColors.gold,
                          foregroundColor: BrandColors.ink,
                          minimumSize: const Size(0, 52),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14)),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(isLast ? l.onboardStart : l.onboardNext,
                                style: const TextStyle(
                                    fontSize: 15.5, fontWeight: FontWeight.w800)),
                            if (!isLast) ...[
                              const SizedBox(width: 8),
                              // Points the way the pages advance, which is the opposite
                              // direction in Arabic.
                              Icon(
                                Directionality.of(context) == TextDirection.rtl
                                    ? Icons.arrow_back
                                    : Icons.arrow_forward,
                                size: 18,
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Page extends StatelessWidget {
  const _Page({required this.spec});
  final OnboardingPageSpec spec;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Concentric rings rather than a bare icon: it gives the page a focal point
            // without needing illustration assets the brand pack does not include.
            SizedBox(
              height: 188,
              width: 188,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  _Ring(size: 188, opacity: 0.07, color: spec.accent),
                  _Ring(size: 144, opacity: 0.11, color: spec.accent),
                  _Ring(size: 100, opacity: 0.16, color: spec.accent),
                  Icon(spec.icon, size: 50, color: spec.accent),
                ],
              ),
            ),
            const SizedBox(height: 44),
            Text(
              spec.title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 23,
                fontWeight: FontWeight.w800,
                color: Colors.white,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 14),
            Text(
              spec.body,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14.5,
                height: 2.0,
                color: Colors.white.withValues(alpha: 0.8),
              ),
            ),
          ],
        ),
      );
}

class _Ring extends StatelessWidget {
  const _Ring({required this.size, required this.opacity, required this.color});

  final double size;
  final double opacity;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: color.withValues(alpha: opacity),
        ),
      );
}

class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.active});

  final int count;
  final int active;

  @override
  Widget build(BuildContext context) {
    // Laid out in logical order so the row mirrors with the rest of the interface: in Arabic
    // the first dot sits on the right, where the first page also is.
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < count; i++)
          AnimatedContainer(
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOut,
            margin: const EdgeInsets.symmetric(horizontal: 4),
            height: 7,
            // The active dot stretches rather than just brightening, so progress is legible
            // at a glance and not only by colour.
            width: i == active ? 26 : 7,
            decoration: BoxDecoration(
              color: i == active
                  ? BrandColors.gold
                  : Colors.white.withValues(alpha: 0.3),
              borderRadius: BorderRadius.circular(4),
            ),
          ),
      ],
    );
  }
}
