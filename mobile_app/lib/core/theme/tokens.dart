// Baytara design tokens.
//
// A direct port of frontend/web/src/theme/tokens.js. The two files must agree: a colour
// changed on the site and not here shows up as an app that is subtly off-brand, which is
// harder to notice than an outright break. Brand guide: Space Explorer blue (#3048A0),
// Gamboge gold (#E9BE43).
import 'package:flutter/material.dart';

abstract final class BrandColors {
  static const accent = Color(0xFF3048A0);
  static const accentSoft = Color(0xFFEEF2FB);
  static const ink = Color(0xFF1E2A5E);
  static const ink2 = Color(0xFF33334A);
  static const muted = Color(0xFF5A6180);
  static const muted2 = Color(0xFF6B7291);
  static const line = Color(0xFFECECF2);
  static const line2 = Color(0xFFF0F0F4);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceAlt = Color(0xFFF5F5F8);
  static const surfaceMuted = Color(0xFFF7F7FB);
  static const star = Color(0xFFF5B23E);
  static const gold = Color(0xFFE9BE43);
  static const utilityBar = Color(0xFF141E42);
  static const footer = Color(0xFF141E42);
}

/// Dark hero / header gradients. `hero` is the 120deg three-stop from the web.
abstract final class BrandGradients {
  static const hero = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF1B2A66), Color(0xFF3048A0), Color(0xFF16255C)],
    stops: [0.0, 0.55, 1.0],
  );

  static const darkPanel = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF1B2A66), Color(0xFF3048A0)],
  );

  static const accentCta = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF3048A0), Color(0xFFE9BE43)],
  );

  static const avatar = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF3048A0), Color(0xFF4356A6)],
  );

  /// Card / thumbnail palette — the design's `g[]` array, cycled by index.
  static const thumbs = <LinearGradient>[
    LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomRight,
        colors: [Color(0xFF16255C), Color(0xFF3048A0)]),
    LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomRight,
        colors: [Color(0xFF16255C), Color(0xFF3048A0)]),
    LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomRight,
        colors: [Color(0xFF3048A0), Color(0xFF24357A)]),
    LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomRight,
        colors: [Color(0xFF24357A), Color(0xFF8A6D1F)]),
    LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomRight,
        colors: [Color(0xFF16255C), Color(0xFF16255C)]),
    LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomRight,
        colors: [Color(0xFF16255C), Color(0xFF24357A)]),
  ];

  static LinearGradient thumbFor(int index) => thumbs[index % thumbs.length];
}

abstract final class BrandLayout {
  static const double maxWidth = 1240;
  static const double headerHeight = 70;
  /// Accessibility floor. Every tappable thing is at least this tall.
  static const double minTouchTarget = 44;
}
