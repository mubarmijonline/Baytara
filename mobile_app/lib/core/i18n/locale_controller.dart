// Language selection. Arabic is the default and the app opens right-to-left.
//
// The choice is persisted in ordinary preferences, not secure storage -- it is a display
// preference, not a secret. It also feeds the Accept-Language header and the ?lang= query
// parameter, so changing it changes what the API returns, not just what the widgets say.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const supportedLocales = [Locale('ar'), Locale('en')];

/// Arabic. Stated once here rather than assumed at each call site.
const defaultLocale = Locale('ar');

class LocaleController extends Notifier<Locale> {
  static const _key = 'baytara_lang';
  final _prefs = const FlutterSecureStorage();

  @override
  Locale build() {
    _restore();
    return defaultLocale;
  }

  Future<void> _restore() async {
    final saved = await _prefs.read(key: _key);
    if (saved == 'en' || saved == 'ar') state = Locale(saved!);
  }

  Future<void> set(Locale locale) async {
    if (locale == state) return;
    state = locale;
    await _prefs.write(key: _key, value: locale.languageCode);
  }

  Future<void> toggle() =>
      set(state.languageCode == 'ar' ? const Locale('en') : const Locale('ar'));
}

final localeProvider = NotifierProvider<LocaleController, Locale>(LocaleController.new);

/// The language string the API wants. Read by the Dio context interceptor on every request.
final languageCodeProvider = Provider<String>((ref) => ref.watch(localeProvider).languageCode);
