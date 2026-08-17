import { Link, useNavigate } from 'react-router-dom';
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
    ['/about', 'nav.about'], ['/blog', 'nav.blog'], ['/business', 'nav.business'],
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
  const legal = [
    [settings.footer?.privacy_url || '/privacy', t('footer.privacy')],
    [settings.footer?.terms_url, t('footer.terms')],
  ].filter(([url]) => typeof url === 'string' && (/^https?:\/\//i.test(url) || url.startsWith('/')));
  const configuredSocials = Object.entries(settings.socials || {})
    .filter(([, url]) => typeof url === 'string' && /^https?:\/\//i.test(url));
  return (
    <footer style={{ background: colors.footer, color: '#b6b6cc' }}>
      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '56px 24px 30px' }}>
        <div
          className="grid-collapse-2"
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr 1fr 1fr',
            gap: 40,
            paddingBottom: 40,
            borderBottom: '1px solid rgba(255,255,255,.1)',
          }}
        >
          <div>
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
                  {name.slice(0, 2).toUpperCase()}
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 22,
            fontSize: 13,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <span>{settings.footer?.copyright || '© 2026 بيطرة Baytara. جميع الحقوق محفوظة.'}</span>
          {legal.length > 0 && (
            <div style={{ display: 'flex', gap: 18 }}>
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
