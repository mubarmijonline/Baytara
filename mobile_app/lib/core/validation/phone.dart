// Mobile-number rules, ported from backend/app/services/phone.py via
// frontend/web/src/lib/validate.js. All three must agree.
//
// This matters more than ordinary form validation: the number is burnt into the video
// watermark, so a wrong one weakens content protection as much as a missing one. The
// server still decides -- this only saves a round trip and lets the field say what is
// wrong while the user is still looking at it.

/// dial code -> (accepted mobile prefixes, national significant number length)
const Map<String, (List<String>, int)> _mobileRules = {
  '20': (['10', '11', '12', '15'], 10), // Egypt
  '966': (['5'], 9), // Saudi Arabia
  '971': (['5'], 9), // United Arab Emirates
  '965': (['5', '6', '9'], 8), // Kuwait
  '974': (['3', '5', '6', '7'], 8), // Qatar
  '973': (['3', '6'], 8), // Bahrain
  '968': (['7', '9'], 8), // Oman
};

/// A bare 01xxxxxxxxx is Egyptian -- that is how every existing row is written. Gulf
/// mobiles are 5xxxxxxxx in both SA and AE, so a bare Gulf national number cannot be told
/// apart from its neighbour's and must carry a country code.
const String defaultDial = '20';

class Country {
  const Country(this.iso, this.dial, this.flag, this.example);
  final String iso;
  final String dial;
  final String flag;

  /// A real-shaped national number, used as the placeholder so the field shows the length
  /// and opening digits the country actually uses.
  final String example;
}

/// In the order the picker offers them. Egypt leads because it is the default market.
const List<Country> countries = [
  Country('EG', '20', '🇪🇬', '1024527770'),
  Country('SA', '966', '🇸🇦', '512345678'),
  Country('AE', '971', '🇦🇪', '501234567'),
  Country('KW', '965', '🇰🇼', '51234567'),
  Country('QA', '974', '🇶🇦', '33123456'),
  Country('BH', '973', '🇧🇭', '36123456'),
  Country('OM', '968', '🇴🇲', '91234567'),
];

Country countryFor(String dial) =>
    countries.firstWhere((c) => c.dial == dial, orElse: () => countries.first);

/// The number as `+<cc><nsn>`, or an empty string when it is not a mobile we accept.
String normalizeMobile(String? raw) {
  if (raw == null) return '';
  var digits = raw.replaceAll(RegExp(r'\D'), '');
  if (digits.isEmpty) return '';
  if (digits.startsWith('00')) digits = digits.substring(2);
  if (digits.startsWith('0')) digits = defaultDial + digits.substring(1);

  for (final entry in _mobileRules.entries) {
    final code = entry.key;
    if (!digits.startsWith(code)) continue;
    var national = digits.substring(code.length);
    // Some people keep the trunk 0 after the country code (+20 010...).
    if (national.startsWith('0')) national = national.substring(1);
    final (prefixes, length) = entry.value;
    if (national.length == length && prefixes.any(national.startsWith)) {
      return '+$code$national';
    }
  }
  return '';
}

/// Digits only, never a leading zero. The trunk 0 belongs to dialling inside a country and
/// the picker has already said which country this is; typing it would produce +20 0102...,
/// one digit too long but still reading as valid to a human.
String nationalDigits(String? raw) =>
    (raw ?? '').replaceAll(RegExp(r'\D'), '').replaceAll(RegExp(r'^0+'), '');

int nationalLength(String dial) => _mobileRules[dial]?.$2 ?? 15;

bool isValidNational(String dial, String national) {
  final rule = _mobileRules[dial];
  if (rule == null) return false;
  final (prefixes, length) = rule;
  return national.length == length && prefixes.any(national.startsWith);
}

String composeMobile(String dial, String national) {
  final digits = nationalDigits(national);
  return isValidNational(dial, digits) ? '+$dial$digits' : '';
}

/// Seeds the picker from whatever is already stored, and lets someone paste a full
/// international number into the national box without it turning into nonsense.
({String dial, String national, bool matched}) splitMobile(String? value) {
  final e164 = normalizeMobile(value);
  if (e164.isEmpty) {
    return (dial: defaultDial, national: nationalDigits(value), matched: false);
  }
  final digits = e164.substring(1);
  final dial = _mobileRules.keys.firstWhere(
    digits.startsWith,
    orElse: () => defaultDial,
  );
  return (dial: dial, national: digits.substring(dial.length), matched: true);
}

/// Deliberately loose, and the same shape the server's Email field accepts: one @,
/// something either side, a dot in the domain. Anything stricter rejects real addresses,
/// and the server is the one that has to agree anyway.
bool isEmail(String? value) =>
    value != null && RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(value.trim());

/// The server's floor (RegisterSchema in backend/app/api/v1/auth.py).
const int minPasswordLength = 8;
