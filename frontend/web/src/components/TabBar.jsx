import { Link, useLocation } from 'react-router-dom';
import { Home, GraduationCap, BookOpen, CircleUser, LogIn } from 'lucide-react';
import { colors } from '../theme/tokens.js';
import { useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';

// Four fits a phone; a fifth crowds it. The library takes the third slot, because it is
// the thing the client wants people opening daily and it had no way in on a phone at all.
const TABS = [
  ['/', 'tab.home', Home],
  ['/courses', 'nav.courses', GraduationCap],
  ['/library', 'library.title', BookOpen],
];

// Phone-only bottom navigation. Visibility lives in global.css under the same
// 760px breakpoint that hides the utility bar, so there is one mobile threshold.
export default function TabBar() {
  const { pathname } = useLocation();
  const { t } = useI18n();
  const { user, loading } = useAuth();

  // Never sit on top of the player.
  if (pathname.startsWith('/learn/')) return null;

  // The last slot is the account, but "لوحتي" promises a dashboard to someone who has no
  // account yet. Signed out, it is the way in instead. `loading` means a token is already
  // being rehydrated, so treat it as signed in and don't flash "sign in" at a member.
  const signedIn = !!user || loading;
  const last = signedIn
    ? ['/dashboard', 'tab.dashboard', CircleUser]
    : ['/auth', 'tab.signin', LogIn];

  return (
    <nav className="site-tabbar" aria-label={t('nav.menu')}>
      {[...TABS, last].map(([to, labelKey, Glyph]) => {
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
