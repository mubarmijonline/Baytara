// Mirrors backend/app/services/phone.py so the form can say what is wrong before
// the round trip. The server still decides — this only saves a rejected request.

// country code -> [mobile national prefixes, national significant number length]
const MOBILE_RULES = {
  20: [['10', '11', '12', '15'], 10],   // Egypt
  966: [['5'], 9],                      // Saudi Arabia
  971: [['5'], 9],                      // United Arab Emirates
  965: [['5', '6', '9'], 8],            // Kuwait
  974: [['3', '5', '6', '7'], 8],       // Qatar
  973: [['3', '6'], 8],                 // Bahrain
  968: [['7', '9'], 8],                 // Oman
};

const DEFAULT_COUNTRY = '20';

// Returns the number as +<cc><nsn>, or '' when it is not a mobile we accept.
export function normalizeMobile(raw) {
  if (typeof raw !== 'string') return '';
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = DEFAULT_COUNTRY + digits.slice(1);

  for (const [code, [prefixes, length]] of Object.entries(MOBILE_RULES)) {
    if (!digits.startsWith(code)) continue;
    let national = digits.slice(code.length);
    if (national.startsWith('0')) national = national.slice(1);
    if (national.length === length && prefixes.some((p) => national.startsWith(p))) {
      return `+${code}${national}`;
    }
  }
  return '';
}

// Deliberately loose, and the same shape the server's Email field accepts: one @,
// something either side, a dot in the domain. Anything stricter rejects real
// addresses, and the server is the one that has to agree anyway.
export function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}
