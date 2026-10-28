// The ultrasound calculator, made hard to miss (client, 2026-10-27): "its icon should be
// clear enough to catch the eye the moment anyone opens the site, on the phone or the
// laptop". Two pieces: a strip on its own line under the header on phones and narrow
// screens (the desktop header has its own pill), and a banner on the home page.
import { Link, useLocation } from 'react-router-dom';
import { Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { Container } from './Primitives.jsx';
import { useI18n } from '../lib/i18n.jsx';

// Gestation lengths the calculator uses (backend/app/services/sonar.py), as reference.
const SPECIES = [['bovine', 283], ['buffalo', 310], ['equine', 340], ['ovine', 150], ['caprine', 150],
  ['canine_small', 63], ['canine_large', 63], ['feline', 65]];
const NAMES = {
  ar: { bovine: 'الأبقار', buffalo: 'الجاموس', equine: 'الخيول', ovine: 'الأغنام', caprine: 'الماعز',
    canine_small: 'كلاب صغيرة', canine_large: 'كلاب كبيرة', feline: 'القطط' },
  en: { bovine: 'Cattle', buffalo: 'Buffalo', equine: 'Horses', ovine: 'Sheep', caprine: 'Goats',
    canine_small: 'Small dogs', canine_large: 'Large dogs', feline: 'Cats' },
};

export function SonarStrip() {
  const { pathname } = useLocation();
  const { t, lang } = useI18n();
  if (pathname === '/tools/sonar') return null;
  const Arrow = lang === 'en' ? ChevronRight : ChevronLeft;
  return (
    <Link to="/tools/sonar" className="sonar-strip show-md">
      <em>{t('sonar.promo.badge')}</em>
      <Activity size={16} aria-hidden="true" />
      <span>{t('sonar.promo.strip')}</span>
      <Arrow size={16} aria-hidden="true" />
    </Link>
  );
}

export function SonarBanner() {
  const { t, lang } = useI18n();
  const names = NAMES[lang === 'en' ? 'en' : 'ar'];
  return (
    <Container style={{ padding: '40px 24px 8px' }}>
      <div className="sonar-banner">
        <div className="sonar-banner-text">
          <span className="sonar-banner-badge"><Activity size={14} aria-hidden="true" /> {t('sonar.promo.badge')}</span>
          <h2>{t('sonar.promo.title')}</h2>
          <p>{t('sonar.promo.body')}</p>
          <Link to="/tools/sonar" className="sonar-banner-cta">{t('sonar.promo.cta')}</Link>
        </div>
        <div className="sonar-banner-species" aria-hidden="true">
          {SPECIES.map(([key, days]) => (
            <div key={key}><b>{names[key]}</b><span>{t('sonar.promo.days', { n: days })}</span></div>
          ))}
        </div>
      </div>
    </Container>
  );
}
