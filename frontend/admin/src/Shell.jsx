import { useEffect, useState } from 'react';
import {
  BadgeCheck,
  BookOpen,
  Boxes,
  CircleUserRound,
  ClipboardList,
  FolderTree,
  Gauge,
  Languages,
  Library,
  LogOut,
  Mail,
  Newspaper,
  Settings,
  Tags,
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ADMIN_STATS_CHANGED_EVENT } from './admin-stats.js';
import { api } from './api.js';
import { useAdminLanguage } from './i18n.jsx';

const NAV = [
  ['dashboard', 'nav.dashboard', Gauge],
  ['payments', 'nav.payments', ClipboardList],
  ['baytarian', 'nav.baytarian', BadgeCheck],
  ['courses', 'nav.courses', BookOpen],
  ['videos', 'nav.videos', Library],
  ['bundles', 'nav.bundles', Boxes],
  ['hierarchy', 'nav.hierarchy', FolderTree],
  ['categories', 'nav.categories', Tags],
  ['articles', 'nav.articles', Newspaper],
  ['users', 'nav.users', CircleUserRound],
  ['messages', 'nav.messages', Mail],
  ['settings', 'nav.settings', Settings],
];

export default function Shell({ onLogout }) {
  const [pending, setPending] = useState(0);
  const [baytPending, setBaytPending] = useState(0);
  const { language, setLanguage, t } = useAdminLanguage();
  const { pathname } = useLocation();

  useEffect(() => {
    let active = true;
    function refreshStats() {
      api.stats().then((stats) => {
        if (!active) return;
        setPending(stats.payments.pending);
        setBaytPending(stats.baytarian?.pending || 0);
      }).catch((error) => {
        if (active && error.status === 401) onLogout();
      });
    }

    refreshStats();
    window.addEventListener(ADMIN_STATS_CHANGED_EVENT, refreshStats);
    return () => {
      active = false;
      window.removeEventListener(ADMIN_STATS_CHANGED_EVENT, refreshStats);
    };
  }, [pathname, onLogout]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="dot" />{t('admin.brand')}</div>
        <nav className="sidebar-nav" aria-label={t('admin.navigation')}>
          {NAV.map(([path, labelKey, Icon]) => (
            <NavLink key={path} to={`/${path}`} className="navitem">
              <span className="navitem-label"><Icon size={18} aria-hidden="true" /><span>{t(labelKey)}</span></span>
              {path === 'payments' && pending ? <span className="count">{pending}</span> : null}
              {path === 'baytarian' && baytPending ? <span className="count">{baytPending}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="spacer" />
        <button
          type="button"
          className="navitem nav-action"
          title={t('common.changeLanguage')}
          onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
        >
          <span className="navitem-label"><Languages size={18} aria-hidden="true" /><span>{language === 'ar' ? 'English' : 'العربية'}</span></span>
        </button>
        <button type="button" className="navitem nav-action" onClick={onLogout}>
          <span className="navitem-label"><LogOut size={18} aria-hidden="true" /><span>{t('common.logout')}</span></span>
        </button>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
