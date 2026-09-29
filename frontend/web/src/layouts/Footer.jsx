import { Link, useNavigate } from 'react-router-dom';
import PaymentBadges from '../components/PaymentBadges.jsx';
import SocialIcon from '../components/SocialIcon.jsx';
import { colors, layout } from '../theme/tokens.js';
import { useI18n } from '../lib/i18n.jsx';
import { useSiteSettings } from '../lib/site-settings.jsx';

// Every entry is a real route. These used to be dead <span>s fed by mock data.
const COLUMNS = [
  ['footer.col.platform', [
    ['/paths', 'nav.paths'], ['/courses', 'nav.courses'], ['/videos', 'nav.videos'],
    ['/bundles', 'nav.bundles'], ['/pricing', 'nav.pricing'],
  ]],
  ['footer.col.company', [
    ['/about', 'nav.about'], ['/library', 'library.title'], ['/business', 'nav.business'],
    ['/content', 'nav.consultations'], ['/contact', 'nav.contact'],
  ]],
  ['footer.col.help', [
    ['/contact', 'nav.contact'], ['/pricing', 'nav.pricing'],
    ['/dashboard', 'nav.dashboard'], ['/auth', 'nav.login'],
  ]],
];

const PLACEHOLDER_SOCIALS = ['facebook', 'instagram', 'youtube', 'whatsapp'];

export default function Footer() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const settings = useSiteSettings();
  const tagline = settings.footer?.tagline;
  // Privacy falls back to the built-in /privacy page: Google's OAuth branding
  // form needs a privacy link that always resolves on baytara.app.
  // Every one of these falls back to its built-in page. The terms link used to have no
  // fallback, so with `terms_url` unset in the CMS -- which it is -- the filter dropped it
  // and the site published no terms link at all. A payment gateway's merchant review looks
  // for exactly these four in the footer, so "only if an admin remembered to paste a URL"
  // is not good enough for any of them.
  const legal = [
    [settings.footer?.privacy_url || '/privacy', t('footer.privacy')],
    [settings.footer?.terms_url || '/terms', t('footer.terms')],
    [settings.footer?.refund_url || '/refund', t('footer.refund')],
    [settings.footer?.delivery_url || '/delivery', t('footer.delivery')],
  ].filter(([url]) => typeof url === 'string' && (/^https?:\/\//i.test(url) || url.startsWith('/')));
  const contact = settings.contact || {};
  const contactRows = [
    { key: 'email', icon: '✉', value: (contact.email || '').trim(), href: (v) => `mailto:${v}` },
    // tel: strips to digits and a leading +, which is what a dialler expects; the text
    // keeps the spacing a human reads.
    { key: 'phone', icon: '☎', value: (contact.phone || '').trim(), href: (v) => `tel:${v.replace(/[^0-9+]/g, '')}` },
    { key: 'address', icon: '⌂', value: (contact.address || '').trim(), href: null },
  ]
    .filter((row) => row.value)
    .map((row) => ({ ...row, href: row.href ? row.href(row.value) : null }));

  const configuredSocials = Object.entries(settings.socials || {})
    .filter(([, url]) => typeof url === 'string' && /^https?:\/\//i.test(url));
  return (
    <footer style={{ background: colors.footer, color: '#b6b6cc' }}>
      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '56px 24px 30px' }}>
        <div
          className="footer-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr 1fr 1fr',
            gap: 40,
            paddingBottom: 40,
            borderBottom: '1px solid rgba(255,255,255,.1)',
          }}
        >
          <div className="footer-brand">
            <img
              src="/brand/logo-white.png"
              alt="بيطرة BAYTARA"
              onClick={() => navigate('/')}
              style={{
                height: 54,
                width: 'auto',
                objectFit: 'contain',
                marginBottom: 16,
                cursor: 'pointer',
                display: 'block',
              }}
            />
            <p style={{ fontSize: 14, lineHeight: 1.7, margin: '0 0 20px', maxWidth: 300 }}>
              {tagline ||
                'منصة التعلّم البيطري الأولى في العالم العربي — نُتيح المعرفة للأطباء والطلاب ومربّي الحيوان بمحتوى عربي أصيل من نخبة الخبراء.'}
            </p>
            {contactRows.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, margin: '0 0 20px' }}>
                {contactRows.map(({ key, href, value, icon }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5 }}>
                    <span aria-hidden="true" style={{ opacity: 0.65, flex: 'none' }}>{icon}</span>
                    {href ? (
                      // dir="ltr" so an address or a number keeps its own order inside the
                      // right-to-left column.
                      <a href={href} dir="ltr" className="link-muted"
                        style={{ color: 'inherit', textDecoration: 'none', overflowWrap: 'anywhere' }}>
                        {value}
                      </a>
                    ) : (
                      <span style={{ overflowWrap: 'anywhere' }}>{value}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              {(configuredSocials.length ? configuredSocials : PLACEHOLDER_SOCIALS.map((name) => [name, ''])).map(([name, url]) => (
                <a
                  key={name}
                  aria-label={name}
                  href={url || undefined}
                  target={url ? '_blank' : undefined}
                  rel={url ? 'noreferrer' : undefined}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: 'rgba(255,255,255,.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 800,
                    color: '#fff',
                    cursor: 'pointer',
                    textDecoration: 'none',
                  }}
                >
                  <SocialIcon name={name} />
                </a>
              ))}
            </div>
          </div>
          {COLUMNS.map(([titleKey, links]) => (
            <div key={titleKey}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: '#fff', marginBottom: 14 }}>{t(titleKey)}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {links.map(([to, labelKey]) => (
                  <Link key={`${to}-${labelKey}`} to={to} className="link-muted" style={{ fontSize: 13.5, color: 'inherit' }}>
                    {t(labelKey)}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ paddingTop: 22 }}>
          <PaymentBadges tone="dark" />
        </div>

        <div
          className="footer-bottom"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 18,
            fontSize: 13,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <span>{settings.footer?.copyright || '© 2026 بيطرة Baytara. جميع الحقوق محفوظة.'}</span>
          {legal.length > 0 && (
            <div className="footer-legal" style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              {legal.map(([url, label]) => (url.startsWith('/') ? (
                <span key={label} style={{ cursor: 'pointer' }} onClick={() => navigate(url)}>{label}</span>
              ) : (
                <a key={label} href={url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{label}</a>
              )))}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
