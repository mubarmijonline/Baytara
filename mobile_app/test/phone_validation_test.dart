// Parity with backend/app/services/phone.py. When these disagree the field accepts a number
// the server then rejects, or refuses one it would have taken -- and because the number is
// burnt into the video watermark, a wrong one weakens content protection.
import 'package:baytara/core/validation/phone.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('normalizeMobile', () {
    test('a bare Egyptian number is assumed Egyptian', () {
      expect(normalizeMobile('01024527770'), '+201024527770');
      expect(normalizeMobile('0102 452 7770'), '+201024527770');
      expect(normalizeMobile('0102-452-7770'), '+201024527770');
    });

    test('the international forms all land on the same E.164 value', () {
      const expected = '+201024527770';
      for (final input in [
        '+201024527770',
        '00201024527770',
        '201024527770',
        '+20 010 2452 7770', // trunk 0 kept after the country code
      ]) {
        expect(normalizeMobile(input), expected, reason: input);
      }
    });

    test('every supported country', () {
      expect(normalizeMobile('+966512345678'), '+966512345678');
      expect(normalizeMobile('+971501234567'), '+971501234567');
      expect(normalizeMobile('+96551234567'), '+96551234567');
      expect(normalizeMobile('+97433123456'), '+97433123456');
      expect(normalizeMobile('+97336123456'), '+97336123456');
      expect(normalizeMobile('+96891234567'), '+96891234567');
    });

    test('rejects what the server rejects', () {
      for (final bad in [
        '',
        '01',              // the guess that used to pass
        '0102452777',      // one short
        '010245277701',    // one long
        '01324527770',     // 13 is not an Egyptian mobile prefix
        '+20 2 24527770',  // Cairo landline
        'not a number',
      ]) {
        expect(normalizeMobile(bad), '', reason: bad);
      }
    });

    test('a null is not an exception', () {
      expect(normalizeMobile(null), '');
    });
  });

  group('the field helpers', () {
    test('the trunk zero is stripped, because the picker already named the country', () {
      expect(nationalDigits('01024527770'), '1024527770');
      expect(nationalDigits('0001024527770'), '1024527770');
      expect(nationalDigits('102 452 7770'), '1024527770');
    });

    test('composeMobile only builds a number the server would accept', () {
      expect(composeMobile('20', '1024527770'), '+201024527770');
      expect(composeMobile('20', '102452777'), '');
      expect(composeMobile('966', '512345678'), '+966512345678');
      expect(composeMobile('966', '112345678'), '', reason: 'not a Saudi mobile prefix');
    });

    test('splitMobile seeds the picker from a stored number', () {
      final egypt = splitMobile('+201024527770');
      expect(egypt.dial, '20');
      expect(egypt.national, '1024527770');
      expect(egypt.matched, isTrue);

      final saudi = splitMobile('+966512345678');
      expect(saudi.dial, '966');
      expect(saudi.national, '512345678');

      final junk = splitMobile('nonsense');
      expect(junk.matched, isFalse);
      expect(junk.dial, defaultDial, reason: 'falls back to the default market');
    });

    test('each country advertises an example of its own valid shape', () {
      for (final c in countries) {
        expect(isValidNational(c.dial, c.example), isTrue,
            reason: '${c.iso} placeholder must be a number the rules accept');
        expect(c.example.length, nationalLength(c.dial), reason: c.iso);
      }
    });
  });

  group('isEmail', () {
    test('accepts ordinary addresses', () {
      for (final ok in ['a@b.co', 'omar.ashraf+tag@example.com']) {
        expect(isEmail(ok), isTrue, reason: ok);
      }
    });

    test('rejects the obvious', () {
      for (final bad in ['', 'a@b', 'a b@c.com', '@b.com', 'a@.com', null]) {
        expect(isEmail(bad), isFalse, reason: '$bad');
      }
    });
  });
}
