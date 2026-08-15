import { Link, useLocation } from 'react-router-dom';
import { colors } from '../theme/tokens.js';
import { useI18n } from '../lib/i18n.jsx';

const TABS = [
  ['/', 'tab.home', '⌂'],
  ['/paths', 'tab.paths', '◈'],
  ['/content', 'tab.consultations', '✎'],
  ['/dashboard', 'tab.dashboard', '◔'],
];

// Phone-only bottom navigation. Visibility lives in global.css under the same
// 760px breakpoint that hides the utility bar, so there is one mobile threshold.
export default function TabBar() {
  const { pathname } = useLocation();
  const { t } = useI18n();

  // Never sit on top of the player.
  if (pathname.startsWith('/learn/')) return null;

  return (
    <nav className="site-tabbar" aria-label={t('nav.menu')}>
      {TABS.map(([to, labelKey, glyph]) => {
        const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? 'page' : undefined}
            style={{ color: active ? colors.accent : colors.muted2, fontWeight: active ? 700 : 500 }}
          >
            <span aria-hidden="true" style={{ fontSize: 17, lineHeight: 1.2, display: 'block' }}>{glyph}</span>
            {t(labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
