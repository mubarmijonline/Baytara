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

// The picker, in the order it is offered. Egypt leads because it is the default
// market; `example` is a real-shaped national number used as the placeholder, so
// the field shows the length and opening digits the country actually uses.
export const COUNTRIES = [
  { iso: 'EG', dial: '20', flag: '🇪🇬', example: '1024527770' },
  { iso: 'SA', dial: '966', flag: '🇸🇦', example: '512345678' },
  { iso: 'AE', dial: '971', flag: '🇦🇪', example: '501234567' },
  { iso: 'KW', dial: '965', flag: '🇰🇼', example: '51234567' },
  { iso: 'QA', dial: '974', flag: '🇶🇦', example: '33123456' },
  { iso: 'BH', dial: '973', flag: '🇧🇭', example: '36123456' },
  { iso: 'OM', dial: '968', flag: '🇴🇲', example: '91234567' },
];

export const DEFAULT_DIAL = DEFAULT_COUNTRY;

export function countryFor(dial) {
  return COUNTRIES.find((c) => c.dial === dial) || COUNTRIES[0];
}

// Digits only, and never a leading zero: the trunk 0 belongs to dialling inside a
// country, and the picker has already said which country this is. Typing it would
// make +20 0102… — a number one digit too long that reads as valid to a human.
export function nationalDigits(raw) {
  return String(raw ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

export function nationalLength(dial) {
  return MOBILE_RULES[dial] ? MOBILE_RULES[dial][1] : 15;
}

export function isValidNational(dial, national) {
  const rule = MOBILE_RULES[dial];
  if (!rule) return false;
  const [prefixes, length] = rule;
  return national.length === length && prefixes.some((p) => national.startsWith(p));
}

export function composeMobile(dial, national) {
  const digits = nationalDigits(national);
  return isValidNational(dial, digits) ? `+${dial}${digits}` : '';
}

// Seeds the picker from whatever is already stored, and lets someone paste a full
// international number into the national box without it turning into nonsense.
export function splitMobile(value) {
  const e164 = normalizeMobile(value);
  if (!e164) return { dial: DEFAULT_DIAL, national: nationalDigits(value), matched: false };
  const digits = e164.slice(1);
  const dial = Object.keys(MOBILE_RULES).find((cc) => digits.startsWith(cc)) || DEFAULT_DIAL;
  return { dial, national: digits.slice(dial.length), matched: true };
}

// Deliberately loose, and the same shape the server's Email field accepts: one @,
// something either side, a dot in the domain. Anything stricter rejects real
// addresses, and the server is the one that has to agree anyway.
export function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}
