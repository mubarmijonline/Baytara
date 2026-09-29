// The accepted payment methods, shown in the footer and on the checkout page.
//
// Kashier's merchant checklist asks for these to be visible in both places, and the reason
// is not decoration: a buyer who cannot see that their card is accepted before they commit
// is a buyer who abandons, and a gateway reviewer checks that the site does not promise a
// method it cannot take.
//
// These are typeset wordmarks rather than the official artwork, because the official
// Visa/Mastercard/Meeza/Kashier files are not in this repo and inventing an approximation
// of a trademark is worse than setting the name plainly. Swap in the real assets when the
// merchant kit arrives: drop them in `public/brand/pay/` and give the entry a `src`.
import { colors } from '../theme/tokens.js';
import { useI18n } from '../lib/i18n.jsx';

const METHODS = [
  { key: 'visa', label: 'VISA' },
  { key: 'mastercard', label: 'Mastercard' },
  { key: 'meeza', label: 'ميزة Meeza' },
  { key: 'kashier', label: 'Kashier' },
];

export default function PaymentBadges({ tone = 'dark', align = 'start' }) {
  const { t } = useI18n();
  const onDark = tone === 'dark';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, alignItems: align === 'center' ? 'center' : 'flex-start' }}>
      <span style={{ fontSize: 12.5, color: onDark ? '#9a9ab4' : colors.muted2, fontWeight: 600 }}>
        {t('pay.accepted')}
      </span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: align === 'center' ? 'center' : 'flex-start' }}>
        {METHODS.map(({ key, label, src }) => (
          <span
            key={key}
            // dir="ltr" so the Latin wordmarks keep their own order inside an RTL page.
            dir="ltr"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 62,
              height: 30,
              padding: '0 10px',
              borderRadius: 6,
              background: onDark ? 'rgba(255,255,255,.95)' : '#fff',
              border: `1px solid ${onDark ? 'rgba(255,255,255,.25)' : colors.line}`,
              color: colors.utilityBar,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.2,
              whiteSpace: 'nowrap',
            }}
          >
            {src ? <img src={src} alt={label} style={{ height: 18, display: 'block' }} /> : label}
          </span>
        ))}
      </div>
      <span style={{ fontSize: 11.5, color: onDark ? '#8a8aa6' : colors.muted2, lineHeight: 1.7 }}>
        {t('pay.secured')}
      </span>
    </div>
  );
}
