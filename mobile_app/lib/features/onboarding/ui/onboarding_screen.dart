// First-run tour.
//
// Three pages, shown once per install, with Skip on every one. What earns a page is
// something a new user would otherwise discover by hitting a wall: that the catalogue is
// Arabic and made by practising vets, that verification rather than payment opens the
// specialist material, and that videos carry their name and phone as a watermark. The last
// matters most — finding that out mid-lesson is a worse introduction than being told first.
//
// The motion is driven by the **scroll offset**, not by onPageChanged. Everything therefore
// tracks the finger: a half-swipe leaves the art half-turned and the background halfway
// between two colours, and letting go settles it. Animating on page-change instead gives the
// stepped, catalogue-ish feel that makes onboarding look cheap.
//
// Three layers move at different rates, which is what produces the depth:
//   background blobs  0.25x
//   illustration      0.55x
//   text              1.00x
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.dart';
import 'widgets/onboarding_art.dart';

typedef ArtBuilder = CustomPainter Function(double t, double entrance, Color accent);

class _PageSpec {
  const _PageSpec({
    required this.title,
    required this.body,
    required this.accent,
    required this.ground,
    required this.art,
  });

  final String title;
  final String body;
  final Color accent;

  /// The page's own background. Interpolated continuously between pages as the user swipes.
  final Color ground;
  final ArtBuilder art;
}

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen>
    with SingleTickerProviderStateMixin {
  final _controller = PageController();

  /// The ambient clock. Everything that moves on its own reads from this, so there is one
  /// ticker for the screen rather than one per animated element.
  late final AnimationController _clock = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 6),
  )..repeat();

  /// Fractional page position, so motion tracks the finger rather than snapping.
  double _offset = 0;

  @override
  void initState() {
    super.initState();
    _controller.addListener(() {
      final page = _controller.page;
      if (page != null && page != _offset) setState(() => _offset = page);
    });
  }

  @override
  void dispose() {
    _clock.dispose();
    _controller.dispose();
    super.dispose();
  }

  List<_PageSpec> _pages(L10n l) => [
        _PageSpec(
          title: l.onboard1Title,
          body: l.onboard1Body,
          accent: BrandColors.gold,
          ground: const Color(0xFF16255C),
          art: (t, e, c) => KnowledgeArt(t: t, entrance: e, accent: c),
        ),
        _PageSpec(
          title: l.onboard2Title,
          body: l.onboard2Body,
          accent: const Color(0xFF5AC8A0),
          ground: const Color(0xFF123A4A),
          art: (t, e, c) => VerifiedArt(t: t, entrance: e, accent: c),
        ),
        _PageSpec(
          title: l.onboard3Title,
          body: l.onboard3Body,
          accent: const Color(0xFF8FB0FF),
          ground: const Color(0xFF141E42),
          art: (t, e, c) => ProtectedArt(
            t: t,
            entrance: e,
            accent: c,
            watermark: l.appName,
          ),
        ),
      ];

  Future<void> _finish() async {
    await ref.read(onboardingSeenProvider.notifier).complete();
    if (mounted) context.go('/');
  }

  void _next(int total) {
    if (_offset.round() >= total - 1) {
      _finish();
      return;
    }
    _controller.nextPage(
      duration: const Duration(milliseconds: 420),
      // Slight overshoot: it feels sprung rather than mechanical.
      curve: Curves.easeOutBack,
    );
  }

  /// Background colour, blended across the two pages either side of the current offset.
  Color _ground(List<_PageSpec> pages) {
    final low = _offset.floor().clamp(0, pages.length - 1);
    final high = _offset.ceil().clamp(0, pages.length - 1);
    return Color.lerp(
          pages[low].ground,
          pages[high].ground,
          _offset - _offset.floorToDouble(),
        ) ??
        pages[low].ground;
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final pages = _pages(l);
    final index = _offset.round().clamp(0, pages.length - 1);
    final isLast = index == pages.length - 1;

    // Honour the OS setting. Someone who has asked for less motion should not be handed the
    // most animated screen in the app.
    final reduceMotion = MediaQuery.disableAnimationsOf(context);

    return Scaffold(
      body: AnimatedContainer(
        duration: const Duration(milliseconds: 120),
        color: _ground(pages),
        child: Stack(
          children: [
            if (!reduceMotion)
              Positioned.fill(
                child: RepaintBoundary(
                  child: AnimatedBuilder(
                    animation: _clock,
                    builder: (context, _) => CustomPaint(
                      painter: _Ambient(
                        t: _clock.value,
                        // The slowest layer. Barely perceptible on its own, but its absence
                        // is what makes a flat background look flat.
                        offset: _offset * 0.25,
                        accent: pages[index].accent,
                      ),
                    ),
                  ),
                ),
              ),
            SafeArea(
              child: Column(
                children: [
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
                      // Physics that decelerate rather than snapping dead.
                      physics: const BouncingScrollPhysics(
                        parent: AlwaysScrollableScrollPhysics(),
                      ),
                      itemBuilder: (context, i) => _Page(
                        spec: pages[i],
                        clock: _clock,
                        // How far this page is from settled, as a signed distance. Drives
                        // both the parallax and the entrance of the artwork.
                        distance: (_offset - i).clamp(-1.0, 1.0),
                        reduceMotion: reduceMotion,
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 0, 24, 28),
                    child: Column(children: [
                      _Dots(
                        count: pages.length,
                        offset: _offset,
                        accent: pages[index].accent,
                      ),
                      const SizedBox(height: 24),
                      _CtaButton(
                        label: isLast ? l.onboardStart : l.onboardNext,
                        showArrow: !isLast,
                        accent: pages[index].accent,
                        onPressed: () => _next(pages.length),
                      ),
                    ]),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Page extends StatelessWidget {
  const _Page({
    required this.spec,
    required this.clock,
    required this.distance,
    required this.reduceMotion,
  });

  final _PageSpec spec;
  final Animation<double> clock;

  /// -1 (page is off to one side) .. 0 (settled) .. 1 (off to the other).
  final double distance;
  final bool reduceMotion;

  @override
  Widget build(BuildContext context) {
    final settled = 1 - distance.abs();
    // Eased so the artwork is essentially formed by the time the page is two-thirds in,
    // rather than still assembling under the reader's eyes.
    final entrance = Curves.easeOutCubic.transform(settled.clamp(0.0, 1.0));

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 30),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Middle layer: moves against the swipe at roughly half speed.
          Transform.translate(
            offset: Offset(-distance * 62, 0),
            child: Opacity(
              opacity: entrance.clamp(0.25, 1.0),
              child: SizedBox(
                height: 210,
                width: 210,
                child: RepaintBoundary(
                  child: AnimatedBuilder(
                    animation: clock,
                    builder: (context, _) => CustomPaint(
                      painter: spec.art(
                        reduceMotion ? 0.0 : clock.value,
                        reduceMotion ? 1.0 : entrance,
                        spec.accent,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 46),
          // Front layer: full speed, and the two lines are staggered so the heading lands
          // first and the body follows it in.
          Transform.translate(
            offset: Offset(-distance * 26, (1 - entrance) * 26),
            child: Opacity(
              opacity: entrance,
              child: Text(
                spec.title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                  height: 1.5,
                ),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Transform.translate(
            offset: Offset(-distance * 14, (1 - entrance) * 44),
            child: Opacity(
              opacity: (entrance * 1.25 - 0.25).clamp(0.0, 1.0),
              child: Text(
                spec.body,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 14.5,
                  height: 2.0,
                  color: Colors.white.withValues(alpha: 0.82),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Slow drifting shapes behind everything. Deliberately low-contrast: it should register as
/// depth, not as decoration anyone consciously notices.
class _Ambient extends CustomPainter {
  _Ambient({required this.t, required this.offset, required this.accent});

  final double t;
  final double offset;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    final blobs = <(double, double, double, double)>[
      (0.16, 0.18, 0.42, 0.9),
      (0.86, 0.30, 0.30, -1.3),
      (0.28, 0.82, 0.36, 1.6),
      (0.78, 0.74, 0.24, -0.8),
    ];

    for (final (fx, fy, scale, speed) in blobs) {
      final drift = math.sin((t * 2 * math.pi * speed.abs()) + fx * 6) * 14 * speed.sign;
      final centre = Offset(
        size.width * fx - offset * size.width * 0.30,
        size.height * fy + drift,
      );
      canvas.drawCircle(
        centre,
        size.shortestSide * scale,
        Paint()
          ..color = accent.withValues(alpha: 0.05)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 46),
      );
    }
  }

  @override
  bool shouldRepaint(_Ambient old) =>
      old.t != t || old.offset != offset || old.accent != accent;
}

/// Progress dots. The active one stretches and the fill tracks the scroll offset, so the
/// indicator moves with the finger instead of jumping when the page commits.
class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.offset, required this.accent});

  final int count;
  final double offset;
  final Color accent;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (var i = 0; i < count; i++)
            () {
              // 1 when this dot is the current page, falling to 0 either side.
              final nearness = (1 - (offset - i).abs()).clamp(0.0, 1.0);
              return AnimatedContainer(
                duration: const Duration(milliseconds: 90),
                margin: const EdgeInsets.symmetric(horizontal: 4),
                height: 7,
                width: 7 + nearness * 21,
                decoration: BoxDecoration(
                  color: Color.lerp(
                    Colors.white.withValues(alpha: 0.28),
                    accent,
                    nearness,
                  ),
                  borderRadius: BorderRadius.circular(4),
                ),
              );
            }(),
        ],
      );
}

/// The primary action. Presses down slightly, because a button that does not acknowledge a
/// touch feels broken on a phone.
class _CtaButton extends StatefulWidget {
  const _CtaButton({
    required this.label,
    required this.showArrow,
    required this.accent,
    required this.onPressed,
  });

  final String label;
  final bool showArrow;
  final Color accent;
  final VoidCallback onPressed;

  @override
  State<_CtaButton> createState() => _CtaButtonState();
}

class _CtaButtonState extends State<_CtaButton> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    // The arrow points the way the pages advance, which is the other way round in Arabic.
    final rtl = Directionality.of(context) == TextDirection.rtl;

    return GestureDetector(
      onTapDown: (_) => setState(() => _down = true),
      onTapUp: (_) => setState(() => _down = false),
      onTapCancel: () => setState(() => _down = false),
      onTap: widget.onPressed,
      child: AnimatedScale(
        scale: _down ? 0.97 : 1.0,
        duration: const Duration(milliseconds: 110),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 260),
          height: 54,
          width: double.infinity,
          decoration: BoxDecoration(
            color: widget.accent,
            borderRadius: BorderRadius.circular(15),
            boxShadow: [
              BoxShadow(
                color: widget.accent.withValues(alpha: _down ? 0.15 : 0.34),
                blurRadius: _down ? 8 : 20,
                offset: Offset(0, _down ? 2 : 8),
              ),
            ],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                widget.label,
                style: const TextStyle(
                  fontSize: 15.5,
                  fontWeight: FontWeight.w800,
                  color: BrandColors.ink,
                ),
              ),
              if (widget.showArrow) ...[
                const SizedBox(width: 8),
                Icon(rtl ? Icons.arrow_back : Icons.arrow_forward,
                    size: 18, color: BrandColors.ink),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
