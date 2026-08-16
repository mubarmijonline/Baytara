import { useState } from 'react';
import { colors } from '../theme/tokens.js';
import { useI18n } from '../lib/i18n.jsx';
import {
  COUNTRIES, composeMobile, countryFor, isValidNational,
  nationalDigits, nationalLength, splitMobile,
} from '../lib/validate.js';

// Country picker plus the national number, used at signup, in the phone gate and
// in the profile form. Reports the finished number as E.164, or '' while it is
// still incomplete — the caller only ever stores something the server will accept.
export default function PhoneField({ id, defaultValue = '', onChange, label, hint, autoFocus }) {
  const { t } = useI18n();
  const seed = splitMobile(defaultValue);
  const [dial, setDial] = useState(seed.dial);
  const [national, setNational] = useState(seed.national);
  // Only worth saying once someone has typed something and it is still not a number.
  const incomplete = national.length > 0 && !isValidNational(dial, national);
  const country = countryFor(dial);

  function emit(nextDial, nextNational) {
    setDial(nextDial);
    setNational(nextNational);
    onChange(composeMobile(nextDial, nextNational));
  }

  function typed(raw) {
    // A pasted +9665… should move the picker rather than land in the national box.
    const pasted = splitMobile(raw);
    if (pasted.matched && raw.replace(/[\s()-]/g, '').startsWith('+')) {
      emit(pasted.dial, pasted.national);
      return;
    }
    emit(dial, nationalDigits(raw).slice(0, nationalLength(dial)));
  }

  return (
    <div>
      {label && (
        <label htmlFor={id} style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>
          {label}
        </label>
      )}
      <div style={{ display: 'flex', gap: 8, direction: 'ltr' }}>
        <select
          aria-label={t('auth.countryCode')}
          value={dial}
          onChange={(event) => emit(event.target.value, national)}
          style={{
            // Capped so the number itself keeps room on a 360px phone; the closed
            // state still shows the flag and the dial code, which is what is picked by.
            flex: '0 1 auto', maxWidth: 148, border: '1px solid #e3e6ef', background: colors.surfaceMuted,
            borderRadius: 10, height: 46, padding: '0 28px 0 10px', fontSize: 14.5, color: colors.ink,
          }}
        >
          {COUNTRIES.map((item) => (
            <option key={item.iso} value={item.dial}>
              {item.flag} +{item.dial} {t(`country.${item.iso}`)}
            </option>
          ))}
        </select>
        <input
          id={id}
          value={national}
          onChange={(event) => typed(event.target.value)}
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          aria-invalid={incomplete || undefined}
          placeholder={country.example}
          style={{
            flex: 1, minWidth: 0, border: `1px solid ${incomplete ? '#e0b4ae' : '#e3e6ef'}`,
            background: colors.surfaceMuted, borderRadius: 10, height: 46, padding: '0 14px',
            fontSize: 14.5, color: colors.ink, direction: 'ltr',
          }}
        />
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: incomplete ? '#b3261e' : colors.muted2, lineHeight: 1.7 }}>
        {incomplete
          ? t('validation.phoneFormat', { example: `+${dial} ${country.example}` })
          : hint || t('auth.noLeadingZero')}
      </p>
    </div>
  );
}
