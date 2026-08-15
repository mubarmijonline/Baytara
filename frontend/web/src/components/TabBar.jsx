import { Link, useLocation } from 'react-router-dom';
import { Home, Signpost, MessageSquareText, CircleUser } from 'lucide-react';
import { colors } from '../theme/tokens.js';
import { useI18n } from '../lib/i18n.jsx';

const TABS = [
  ['/', 'tab.home', Home],
  ['/paths', 'tab.paths', Signpost],
  ['/content', 'tab.consultations', MessageSquareText],
  ['/dashboard', 'tab.dashboard', CircleUser],
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
      {TABS.map(([to, labelKey, Glyph]) => {
        const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? 'page' : undefined}
            style={{ color: active ? colors.accent : colors.muted2, fontWeight: active ? 700 : 500 }}
          >
            <Glyph size={19} aria-hidden="true" style={{ display: 'block', margin: '0 auto 2px' }} />
            {t(labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
