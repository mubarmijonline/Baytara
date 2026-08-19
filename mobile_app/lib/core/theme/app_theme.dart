// The Material theme, built from the brand tokens.
//
// Font choice is per-locale, not per-string: Thmanyah carries Arabic, Stolzl the Latin.
// `fontFamilyFallback` means a mixed-script line (an Arabic sentence with an English
// product name in it) still renders both halves rather than dropping to tofu.
import 'package:flutter/material.dart';

import 'tokens.dart';

abstract final class AppTheme {
  static const _arabic = 'Thmanyah';
  static const _latin = 'Stolzl';

  static ThemeData forLocale(Locale locale) {
    final isArabic = locale.languageCode == 'ar';
    final primary = isArabic ? _arabic : _latin;
    final fallback = isArabic ? const [_latin] : const [_arabic];

    final scheme = ColorScheme.fromSeed(
      seedColor: BrandColors.accent,
      primary: BrandColors.accent,
      secondary: BrandColors.gold,
      surface: BrandColors.surface,
      brightness: Brightness.light,
    );

    final base = ThemeData(useMaterial3: true, colorScheme: scheme);

    return base.copyWith(
      scaffoldBackgroundColor: BrandColors.surface,
      textTheme: base.textTheme.apply(
        fontFamily: primary,
        fontFamilyFallback: fallback,
        bodyColor: BrandColors.ink2,
        displayColor: BrandColors.ink,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: BrandColors.utilityBar,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
      ),
      dividerTheme: const DividerThemeData(color: BrandColors.line, thickness: 1),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: BrandColors.accent,
          foregroundColor: Colors.white,
          minimumSize: const Size(0, BrandLayout.minTouchTarget),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: TextStyle(fontFamily: primary, fontWeight: FontWeight.w700, fontSize: 15),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: BrandColors.accent,
          minimumSize: const Size(0, BrandLayout.minTouchTarget),
          side: const BorderSide(color: BrandColors.line),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: BrandColors.surfaceMuted,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: BrandColors.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: BrandColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: BrandColors.accent, width: 2),
        ),
      ),
      cardTheme: CardThemeData(
        color: BrandColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: BrandColors.line),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: BrandColors.surface,
        indicatorColor: BrandColors.accentSoft,
        height: 64,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontFamily: primary,
            fontSize: 11.5,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w700
                : FontWeight.w500,
            color: states.contains(WidgetState.selected)
                ? BrandColors.accent
                : BrandColors.muted2,
          ),
        ),
      ),
    );
  }
}
