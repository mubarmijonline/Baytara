import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, BarChart3, BookOpen, Boxes, CircleUserRound, ClipboardList, FolderTree, Gauge, GraduationCap, Languages, Library, LogOut, Mail, Menu, Newspaper, PanelLeftClose, PanelLeftOpen, Route as RouteIcon, Search, Settings, Star, Tags, TicketPercent, Upload, UserCheck, X } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ADMIN_DATA_CHANGED_EVENT } from './admin-data-events.js';
import { ADMIN_STATS_CHANGED_EVENT } from './admin-stats.js';
import { api } from './api.js';
import { useAdminLanguage } from './i18n.jsx';

// The sidebar used to be seventeen destinations in the order they happened to be built.
// Grouped by the question an admin is answering — what is waiting on me, what am I
// publishing, who are these people, how is the system set up — it is read rather than
// scanned. `paths` joins the list: its routes have always worked, but the only way in
// was a single dashboard tile.
const NAV_GROUPS = [
  ['nav.group.today', [
    ['dashboard', 'nav.dashboard', Gauge],
    ['payments', 'nav.payments', ClipboardList],
    ['promos', 'nav.promos', TicketPercent],
    ['baytarian', 'nav.baytarian', BadgeCheck],
    ['messages', 'nav.messages', Mail],
  ]],
  ['nav.group.content', [
    ['courses', 'nav.courses', BookOpen],
    ['videos', 'nav.videos', Library],
    ['videos/upload', 'nav.videoUpload', Upload],
    ['bundles', 'nav.bundles', Boxes],
    ['paths', 'nav.paths', RouteIcon],
    ['categories', 'nav.categories', Tags],
    ['hierarchy', 'nav.hierarchy', FolderTree],
    ['articles', 'nav.articles', Newspaper],
  ]],
  ['nav.group.people', [
    ['enrollments', 'nav.enrollments', UserCheck],
    ['users', 'nav.users', CircleUserRound],
    ['instructors', 'nav.instructors', GraduationCap],
    ['reviews', 'nav.reviews', Star],
  ]],
  ['nav.group.system', [
    ['video-reports', 'nav.videoReports', BarChart3],
    ['settings', 'nav.settings', Settings],
  ]],
];

const ALL_DESTINATIONS = NAV_GROUPS.flatMap(([, items]) => items);
const RAIL_KEY = 'baytara_admin_nav_rail';

// A queue with something in it is the reason to open the page at all, so the count
// rides the destination it belongs to rather than living only on the dashboard.
function pendingFor(path, stats) {
  if (path === 'payments') return stats?.payments?.pending || 0;
  if (path === 'baytarian') return stats?.baytarian?.pending || 0;
  if (path === 'messages') return stats?.messages?.unread || 0;
  return 0;
}

function storedRail() {
  try {
    return localStorage.getItem(RAIL_KEY) === '1';
  } catch {
    return false;
  }
}

/** Jump to any page by typing its name. Seventeen destinations is past the number a
 *  person scans reliably, and the one you want is rarely the one under the cursor. */
function QuickSearch({ onClose, t }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const named = ALL_DESTINATIONS.map(([path, labelKey, Icon]) => ({
      path, Icon, label: t(labelKey),
    }));
    if (!needle) return named;
    return named.filter((item) => item.label.toLowerCase().includes(needle)
      || item.path.toLowerCase().includes(needle));
  }, [query, t]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setCursor(0); }, [query]);

  function go(item) {
    if (!item) return;
    navigate(`/${item.path}`);
    onClose();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') { onClose(); return; }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((value) => (matches.length ? (value + 1) % matches.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((value) => (matches.length ? (value - 1 + matches.length) % matches.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(matches[cursor]);
    }
  }

  return (
    <div className="palette-bg" onClick={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t('admin.search')}
           onClick={(event) => event.stopPropagation()}>
        <div className="palette-input">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder={t('admin.searchHint')}
            aria-label={t('admin.searchHint')}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <button type="button" className="icon-button" aria-label={t('common.close')} onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {matches.length === 0 ? (
          <p className="palette-empty">{t('admin.searchEmpty')}</p>
        ) : (
          <ul className="palette-results">
            {matches.map((item, index) => (
              <li key={item.path}>
                <button
                  type="button"
                  className={`palette-result${index === cursor ? ' is-active' : ''}`}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => go(item)}
                >
                  <item.Icon size={16} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function Shell({ onLogout }) {
  const [stats, setStats] = useState(null);
  const [outletRevision, setOutletRevision] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rail, setRail] = useState(storedRail);
  const [searching, setSearching] = useState(false);
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

  // The drawer is a phone-width affordance; leaving it open across a navigation would
  // park a panel over the page the admin just asked for.
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  useEffect(() => {
    try {
      localStorage.setItem(RAIL_KEY, rail ? '1' : '0');
    } catch {
      // The choice still holds for this session when storage is unavailable.
    }
  }, [rail]);

  const openSearch = useCallback(() => setSearching(true), []);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && typeof event.key === 'string' && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearching(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const shellClass = [
    'shell',
    rail ? 'shell-rail' : '',
    drawerOpen ? 'shell-drawer-open' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={shellClass}>
      {/* Phone-width chrome. On a desktop the sidebar is always there and this is hidden. */}
      <header className="shell-topbar">
        <button type="button" className="icon-button shell-menu-toggle"
                aria-label={drawerOpen ? t('admin.closeMenu') : t('admin.openMenu')}
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen((open) => !open)}>
          {drawerOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        </button>
        <span className="shell-topbar-brand" aria-hidden="true"><span className="dot" />{t('admin.brand')}</span>
        <button type="button" className="icon-button" aria-label={t('admin.search')} onClick={openSearch}>
          <Search size={18} aria-hidden="true" />
        </button>
      </header>

      <aside className="sidebar">
        <div className="brand"><span className="dot" /><span>{t('admin.brand')}</span></div>

        <button type="button" className="nav-search" onClick={openSearch}>
          <span className="nav-search-label">
            <Search size={16} aria-hidden="true" />
            <span>{t('admin.search')}</span>
          </span>
          <kbd>{t('admin.searchShortcut')}</kbd>
        </button>

        <nav className="sidebar-nav" aria-label={t('admin.navigation')}>
          {NAV_GROUPS.map(([groupKey, items]) => (
            <div className="nav-group" key={groupKey} role="group" aria-label={t(groupKey)}>
              {/* Labelled on the group itself, not as a heading: a heading here would
                  compete with the page's own title for the same accessible name. */}
              <div className="nav-group-title" aria-hidden="true">{t(groupKey)}</div>
              {items.map(([path, labelKey, Icon]) => {
                const pending = pendingFor(path, stats);
                return (
                  <NavLink key={path} to={`/${path}`} className="navitem" title={t(labelKey)}>
                    <span className="navitem-label">
                      <Icon size={18} aria-hidden="true" />
                      <span>{t(labelKey)}</span>
                    </span>
                    {pending ? <span className="count">{pending}</span> : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="spacer" />
        <div className="sidebar-footer">
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
          <button
            type="button"
            className="navitem nav-action nav-rail-toggle"
            aria-label={rail ? t('admin.expandNav') : t('admin.collapseNav')}
            title={rail ? t('admin.expandNav') : t('admin.collapseNav')}
            onClick={() => setRail((value) => !value)}
          >
            <span className="navitem-label">
              {rail ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
              <span>{rail ? t('admin.expandNav') : t('admin.collapseNav')}</span>
            </span>
          </button>
        </div>
      </aside>

      {/* Tapping the page behind an open drawer should close it, the way a drawer does. */}
      <button type="button" className="shell-scrim" tabIndex={-1} aria-hidden="true"
              onClick={() => setDrawerOpen(false)} />

      <main className="content">
        <Outlet key={`${pathname}:${outletRevision}`} context={{ stats }} />
      </main>

      {searching && <QuickSearch t={t} onClose={() => setSearching(false)} />}
    </div>
  );
}
