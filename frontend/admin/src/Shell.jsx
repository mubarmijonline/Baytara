import { useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  BarChart3,
  BookOpen,
  Boxes,
  CircleUserRound,
  ClipboardList,
  FolderTree,
  Gauge,
  GraduationCap,
  Languages,
  Library,
  LogOut,
  Mail,
  Newspaper,
  Settings,
  Tags,
  Upload,
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ADMIN_DATA_CHANGED_EVENT } from './admin-data-events.js';
import { ADMIN_STATS_CHANGED_EVENT } from './admin-stats.js';
import { api } from './api.js';
import { useAdminLanguage } from './i18n.jsx';

const NAV = [
  ['dashboard', 'nav.dashboard', Gauge],
  ['payments', 'nav.payments', ClipboardList],
  ['baytarian', 'nav.baytarian', BadgeCheck],
  ['courses', 'nav.courses', BookOpen],
  ['videos', 'nav.videos', Library],
  ['videos/upload', 'nav.videoUpload', Upload],
  ['video-reports', 'nav.videoReports', BarChart3],
  ['bundles', 'nav.bundles', Boxes],
  ['hierarchy', 'nav.hierarchy', FolderTree],
  ['categories', 'nav.categories', Tags],
  ['articles', 'nav.articles', Newspaper],
  ['instructors', 'nav.instructors', GraduationCap],
  ['users', 'nav.users', CircleUserRound],
  ['messages', 'nav.messages', Mail],
  ['settings', 'nav.settings', Settings],
];

export default function Shell({ onLogout }) {
  const [stats, setStats] = useState(null);
  const [outletRevision, setOutletRevision] = useState(0);
  const { language, setLanguage, t } = useAdminLanguage();
  const { pathname } = useLocation();
  const statsRequestSequence = useRef(0);
  const targetLanguage = language === 'ar' ? 'English' : 'Arabic';

  useEffect(() => {
    let active = true;
    function refreshStats() {
      const requestSequence = ++statsRequestSequence.current;
      api.stats({ deferUnauthorized: true }).then((stats) => {
        if (!active || requestSequence !== statsRequestSequence.current) return;
        setStats(stats);
      }).catch((error) => {
        if (active && requestSequence === statsRequestSequence.current && error.status === 401) onLogout();
      });
    }

    refreshStats();
    window.addEventListener(ADMIN_STATS_CHANGED_EVENT, refreshStats);
    return () => {
      active = false;
      statsRequestSequence.current += 1;
      window.removeEventListener(ADMIN_STATS_CHANGED_EVENT, refreshStats);
    };
  }, [pathname, onLogout]);

  useEffect(() => {
    function refreshActivePage() {
      setOutletRevision((value) => value + 1);
    }

    window.addEventListener(ADMIN_DATA_CHANGED_EVENT, refreshActivePage);
    return () => window.removeEventListener(ADMIN_DATA_CHANGED_EVENT, refreshActivePage);
  }, []);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="dot" />{t('admin.brand')}</div>
        <nav className="sidebar-nav" aria-label={t('admin.navigation')}>
          {NAV.map(([path, labelKey, Icon]) => (
            <NavLink key={path} to={`/${path}`} className="navitem">
              <span className="navitem-label"><Icon size={18} aria-hidden="true" /><span>{t(labelKey)}</span></span>
              {path === 'payments' && stats?.payments?.pending ? <span className="count">{stats.payments.pending}</span> : null}
              {path === 'baytarian' && stats?.baytarian?.pending ? <span className="count">{stats.baytarian.pending}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="spacer" />
        <button
          type="button"
          className="navitem nav-action"
          title={t('common.changeLanguage')}
          aria-label={targetLanguage}
          onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
        >
          <span className="navitem-label"><Languages size={18} aria-hidden="true" /><span>{targetLanguage}</span></span>
        </button>
        <button type="button" className="navitem nav-action" onClick={onLogout}>
          <span className="navitem-label"><LogOut size={18} aria-hidden="true" /><span>{t('common.logout')}</span></span>
        </button>
      </aside>
      <main className="content">
        <Outlet key={`${pathname}:${outletRevision}`} context={{ stats }} />
      </main>
    </div>
  );
}
