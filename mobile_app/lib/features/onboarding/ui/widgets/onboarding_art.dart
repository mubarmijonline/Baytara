// The three onboarding illustrations, painted rather than shipped as images.
//
// Painting them buys three things a PNG cannot: they animate, they scale to any screen
// without a 3x asset set, and they recolour with the brand tokens instead of being baked.
//
// Each painter takes `t` (a looping 0..1 clock) and `entrance` (0..1, how settled this page
// is). Motion is driven from those two rather than from internal timers, so everything on a
// page stays in step and a half-swiped page renders half-formed instead of popping.
import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Page 1 — knowledge. Rings of orbiting nodes around an open book, suggesting a body of
/// material rather than a single lesson.
class KnowledgeArt extends CustomPainter {
  KnowledgeArt({required this.t, required this.entrance, required this.accent});

  final double t;
  final double entrance;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    final centre = Offset(size.width / 2, size.height / 2);
    final unit = size.shortestSide / 2;

    // Two counter-rotating orbits. Opposite directions read as depth; same direction reads
    // as one rigid object turning.
    for (final (index, spec) in <(double, int, double)>[
      (0.94, 6, 1.0),
      (0.66, 4, -1.4),
    ].indexed) {
      final (radiusFactor, count, speed) = spec;
      final radius = unit * radiusFactor * entrance;
      final angleOffset = t * 2 * math.pi * speed;

      canvas.drawCircle(
        centre,
        radius,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.2
          ..color = accent.withValues(alpha: 0.16 * entrance),
      );

      for (var i = 0; i < count; i++) {
        final angle = angleOffset + (i * 2 * math.pi / count);
        final node = centre + Offset(math.cos(angle), math.sin(angle)) * radius;
        // Nodes breathe out of phase so the ring never looks like a rigid cog.
        final pulse = 0.5 + 0.5 * math.sin((t * 2 * math.pi) + i + index);
        canvas.drawCircle(
          node,
          (2.6 + pulse * 2.2) * entrance,
          Paint()..color = accent.withValues(alpha: (0.35 + pulse * 0.45) * entrance),
        );
      }
    }

    // The book: two leaves meeting at a spine, drawn as filled quads.
    final w = unit * 0.62 * entrance;
    final h = unit * 0.44 * entrance;
    final lift = math.sin(t * 2 * math.pi) * unit * 0.02;
    final origin = centre.translate(0, lift);

    for (final side in [-1.0, 1.0]) {
      final path = Path()
        ..moveTo(origin.dx, origin.dy - h * 0.62)
        ..lineTo(origin.dx + side * w, origin.dy - h * 0.30)
        ..lineTo(origin.dx + side * w, origin.dy + h * 0.72)
        ..lineTo(origin.dx, origin.dy + h * 0.40)
        ..close();
      canvas.drawPath(
        path,
        Paint()..color = accent.withValues(alpha: (side < 0 ? 0.92 : 0.62) * entrance),
      );
    }
  }

  @override
  bool shouldRepaint(KnowledgeArt old) =>
      old.t != t || old.entrance != entrance || old.accent != accent;
}

/// Page 2 — verification. A shield that draws itself stroke-first, then fills, with a tick
/// that arrives last. The order matters: it reads as something being checked and then
/// granted, which is what verification is.
class VerifiedArt extends CustomPainter {
  VerifiedArt({required this.t, required this.entrance, required this.accent});

  final double t;
  final double entrance;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    final centre = Offset(size.width / 2, size.height / 2);
    final unit = size.shortestSide / 2;

    // A halo that expands and fades on a loop, like a signal being acknowledged.
    final ripple = (t % 1.0);
    canvas.drawCircle(
      centre,
      unit * (0.62 + ripple * 0.55) * entrance,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..color = accent.withValues(alpha: (1 - ripple) * 0.30 * entrance),
    );

    final w = unit * 0.70 * entrance;
    final h = unit * 0.88 * entrance;
    final shield = Path()
      ..moveTo(centre.dx, centre.dy - h)
      ..lineTo(centre.dx + w, centre.dy - h * 0.52)
      ..lineTo(centre.dx + w, centre.dy + h * 0.12)
      // The point of a shield is its bottom curve; a straight V looks like a badge.
      ..quadraticBezierTo(
          centre.dx + w * 0.86, centre.dy + h * 0.74, centre.dx, centre.dy + h)
      ..quadraticBezierTo(
          centre.dx - w * 0.86, centre.dy + h * 0.74, centre.dx - w, centre.dy + h * 0.12)
      ..lineTo(centre.dx - w, centre.dy - h * 0.52)
      ..close();

    canvas.drawPath(shield, Paint()..color = accent.withValues(alpha: 0.14 * entrance));

    // The outline traces on as the page settles, using path metrics so it draws like a pen
    // rather than fading in.
    final metrics = shield.computeMetrics().toList();
    final drawn = Path();
    for (final metric in metrics) {
      drawn.addPath(metric.extractPath(0, metric.length * entrance), Offset.zero);
    }
    canvas.drawPath(
      drawn,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.4
        ..strokeCap = StrokeCap.round
        ..color = accent.withValues(alpha: 0.95),
    );

    // The tick only starts once the shield is essentially complete.
    final tickProgress = ((entrance - 0.55) / 0.45).clamp(0.0, 1.0);
    if (tickProgress <= 0) return;

    final tick = Path()
      ..moveTo(centre.dx - w * 0.40, centre.dy + h * 0.02)
      ..lineTo(centre.dx - w * 0.08, centre.dy + h * 0.32)
      ..lineTo(centre.dx + w * 0.46, centre.dy - h * 0.34);

    final tickMetric = tick.computeMetrics().first;
    canvas.drawPath(
      tickMetric.extractPath(0, tickMetric.length * tickProgress),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4.0
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..color = Colors.white,
    );
  }

  @override
  bool shouldRepaint(VerifiedArt old) =>
      old.t != t || old.entrance != entrance || old.accent != accent;
}

/// Page 3 — protected video. A frame with a play glyph, a scan line sweeping it, and the
/// viewer's details tiled faintly across it. It shows what a watermark is instead of
/// describing one.
class ProtectedArt extends CustomPainter {
  ProtectedArt({
    required this.t,
    required this.entrance,
    required this.accent,
    required this.watermark,
  });

  final double t;
  final double entrance;
  final Color accent;

  /// Rendered into the frame, so the concept lands before the user meets it in a lesson.
  final String watermark;

  @override
  void paint(Canvas canvas, Size size) {
    final centre = Offset(size.width / 2, size.height / 2);
    final unit = size.shortestSide / 2;

    final w = unit * 1.02 * entrance;
    final h = w * 0.60;
    final frame = RRect.fromRectAndRadius(
      Rect.fromCenter(center: centre, width: w * 2, height: h * 2),
      const Radius.circular(14),
    );

    canvas.drawRRect(frame, Paint()..color = accent.withValues(alpha: 0.13 * entrance));
    canvas.drawRRect(
      frame,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.8
        ..color = accent.withValues(alpha: 0.75 * entrance),
    );

    canvas.save();
    canvas.clipRRect(frame);

    // Tiled watermark, angled the way a real burned-in mark is so it cannot be cropped out.
    if (watermark.isNotEmpty && entrance > 0.3) {
      canvas.save();
      canvas.translate(centre.dx, centre.dy);
      canvas.rotate(-0.42);
      final painter = TextPainter(
        text: TextSpan(
          text: watermark,
          style: TextStyle(
            fontSize: 9,
            color: Colors.white.withValues(alpha: 0.20 * entrance),
            fontWeight: FontWeight.w600,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      for (var row = -3; row <= 3; row++) {
        for (var col = -2; col <= 2; col++) {
          painter.paint(
            canvas,
            Offset(col * (painter.width + 26) - painter.width / 2, row * 26),
          );
        }
      }
      canvas.restore();
    }

    // The scan line: a soft band travelling down the frame, the visual shorthand for
    // something being watched over.
    final scanY = centre.dy - h + (2 * h) * ((t * 1.6) % 1.0);
    canvas.drawRect(
      Rect.fromLTRB(centre.dx - w, scanY - 16, centre.dx + w, scanY + 16),
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            accent.withValues(alpha: 0),
            accent.withValues(alpha: 0.42 * entrance),
            accent.withValues(alpha: 0),
          ],
        ).createShader(
            Rect.fromLTRB(centre.dx - w, scanY - 16, centre.dx + w, scanY + 16)),
    );
    canvas.restore();

    // Play glyph, breathing gently so the frame does not read as a still image.
    final pulse = 1 + math.sin(t * 2 * math.pi) * 0.05;
    final r = unit * 0.26 * entrance * pulse;
    canvas.drawCircle(centre, r, Paint()..color = Colors.white.withValues(alpha: 0.92));
    final triangle = Path()
      ..moveTo(centre.dx - r * 0.28, centre.dy - r * 0.42)
      ..lineTo(centre.dx + r * 0.48, centre.dy)
      ..lineTo(centre.dx - r * 0.28, centre.dy + r * 0.42)
      ..close();
    canvas.drawPath(triangle, Paint()..color = const Color(0xFF141E42));
  }

  @override
  bool shouldRepaint(ProtectedArt old) =>
      old.t != t || old.entrance != entrance || old.accent != accent;
}
