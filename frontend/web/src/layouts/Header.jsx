import { useCallback, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, LayoutDashboard, LogOut, Menu, Search, User, UserCog, X } from 'lucide-react';
import { colors, gradients, layout } from '../theme/tokens.js';
import { auth } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useDismissable } from '../lib/useDismissable.js';
import { useSiteSettings } from '../lib/site-settings.jsx';

function UserMenu() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useDismissable(open, useCallback(() => setOpen(false), []));
  const item = { padding: '11px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 14,
    display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', width: '100%', textAlign: 'inherit' };

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('nav.dashboard')}
        style={{ width: 42, height: 42, borderRadius: '50%', background: user?.avatar_url ? `center/cover url(${user.avatar_url})` : gradients.avatar,
          display: 'grid', placeItems: 'center', color: '#fff', cursor: 'pointer', flex: 'none', border: '2px solid rgba(255,255,255,.25)', padding: 0 }}
      >
        {/* A real avatar when there is one; otherwise a person, not an initial. */}
        {!user?.avatar_url && <User size={20} strokeWidth={2.2} aria-hidden="true" />}
      </button>
      {open && (
        <div role="menu" style={{ position: 'absolute', insetInlineEnd: 0, top: 50, width: 230, background: '#fff',
          border: '1px solid #ececf2', borderRadius: 14, boxShadow: '0 18px 44px rgba(20,20,43,.18)', zIndex: 60, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #f0f0f4' }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{user?.name}</div>
            <div style={{ fontSize: 12, color: '#5A6180', direction: 'ltr', textAlign: 'start' }}>{user?.email}</div>
          </div>
          <button type="button" role="menuitem" style={item} onClick={() => { setOpen(false); navigate('/dashboard'); }}>
            <LayoutDashboard size={16} aria-hidden="true" /> {t('nav.dashboard')}
          </button>
          <button type="button" role="menuitem" style={item} onClick={() => { setOpen(false); navigate('/dashboard/profile'); }}>
            <UserCog size={16} aria-hidden="true" /> {t('profile.account')}
          </button>
          <button type="button" role="menuitem" style={{ ...item, color: colors.accent, borderTop: '1px solid #f0f0f4' }}
            onClick={() => { logout(); setOpen(false); navigate('/'); }}>
            <LogOut size={16} aria-hidden="true" /> {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useDismissable(open, useCallback(() => setOpen(false), []));

  const load = () => auth.notifications().then((r) => { setItems(r.notifications); setUnread(r.unread); }).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);

  async function markAll() { try { await auth.notifReadAll(); load(); } catch { /* noop */ } }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        aria-label={t('nav.notifications')}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ background: 'rgba(255,255,255,.09)', border: 'none', cursor: 'pointer', position: 'relative',
          width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', color: '#cfcfe0' }}
      >
        <Bell size={18} aria-hidden="true" />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: 0, insetInlineEnd: 0, background: colors.accent, color: '#fff',
            fontSize: 10, fontWeight: 800, borderRadius: 10, padding: '1px 5px', minWidth: 16 }}>{unread}</span>
        )}
      </button>
      {open && (
        <div style={{ position: 'absolute', insetInlineEnd: 0, top: 44, width: 320, maxHeight: 420, overflowY: 'auto',
          background: '#fff', border: `1px solid ${colors.line}`, borderRadius: 14, boxShadow: '0 18px 44px rgba(20,20,43,.18)', zIndex: 60 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: `1px solid ${colors.line2}` }}>
            <b style={{ fontSize: 14 }}>{t('nav.notifications')}</b>
            {unread > 0 && <span onClick={markAll} style={{ fontSize: 12, color: colors.accent, cursor: 'pointer', fontWeight: 700 }}>{t('nav.markAllRead')}</span>}
          </div>
          {items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: colors.muted, fontSize: 13 }}>{t('nav.noNotifications')}</div>
          ) : items.map((n) => (
            <div key={n.id} style={{ padding: '12px 14px', borderBottom: `1px solid ${colors.line2}`,
              background: n.is_read ? '#fff' : colors.accentSoft }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{n.title}</div>
              {n.body && <div style={{ fontSize: 13, color: colors.muted, marginTop: 3 }}>{n.body}</div>}
              <div style={{ fontSize: 11, color: colors.muted2, marginTop: 4 }}>{(n.created_at || '').slice(0, 16).replace('T', ' ')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// One list drives both the desktop bar and the mobile drawer — they used to drift.
const NAV = [
  ['/paths', 'nav.paths'],
  ['/courses', 'nav.courses'],
  ['/videos', 'nav.videos'],
  ['/content', 'nav.consultations'],
  ['/blog', 'nav.blog'],
  ['/pricing', 'nav.pricing'],
  ['/business', 'nav.business'],
];

export default function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const { t, lang, switchLang } = useI18n();
  const settings = useSiteSettings();
  const header = settings.header || {};
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useDismissable(menuOpen, useCallback(() => setMenuOpen(false), []));
  const langToggle = (extra = {}) => (
    <button
      onClick={() => switchLang(lang === 'en' ? 'ar' : 'en')}
      title={lang === 'en' ? 'العربية' : 'English'}
      style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer',
        fontWeight: 800, fontSize: 13, ...extra }}
    >
      {t('lang.toggle')}
    </button>
  );
  const go = (to) => {
    setMenuOpen(false);
    navigate(to);
  };
  const navItem = (to, label) => {
    const active = pathname === to;
    return (
      <span
        key={to}
        onClick={() => go(to)}
        style={{
          cursor: 'pointer',
          color: active ? '#fff' : '#dcdfeb',
          borderBottom: active ? `2px solid ${colors.gold}` : '2px solid transparent',
          paddingBottom: 4,
        }}
      >
        {label}
      </span>
    );
  };

  return (
    <>
      {/* Top utility bar */}
      <div className="site-utility-bar" style={{ background: colors.utilityBar, color: '#cfcfe0', fontSize: 13 }}>
        <div
          className="site-utility-inner"
          style={{
            maxWidth: layout.maxWidth,
            margin: '0 auto',
            padding: '8px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{header.welcome}</span>
          <div className="hide-sm" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ cursor: 'pointer' }}>{header.app_label}</span>
            <span style={{ opacity: 0.4 }}>|</span>
            <span style={{ cursor: 'pointer' }} onClick={() => navigate('/contact')}>
              {header.help_label}
            </span>
            <span style={{ opacity: 0.4 }}>|</span>
            {langToggle({ color: colors.gold })}
          </div>
        </div>
      </div>

      {/* Main header */}
      <header
        ref={menuRef}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: colors.utilityBar,
          borderBottom: '1px solid rgba(255,255,255,.10)',
          boxShadow: '0 1px 12px rgba(20,20,43,.18)',
        }}
      >
        <div
          className="site-header-inner"
          style={{
            maxWidth: layout.maxWidth,
            margin: '0 auto',
            padding: '0 24px',
            height: 74,
            display: 'flex',
            alignItems: 'center',
            gap: 20,
          }}
        >
          <img
            className="site-logo"
            src="/brand/logo-white.png"
            alt="بيطرة BAYTARA"
            onClick={() => navigate('/')}
            style={{
              height: 44,
              width: 'auto',
              objectFit: 'contain',
              cursor: 'pointer',
              flex: 'none',
            }}
          />

          <nav
            className="hide-md"
            style={{ display: 'flex', alignItems: 'center', gap: 22, fontSize: 14.5, fontWeight: 600 }}
          >
            {NAV.map(([to, key]) => navItem(to, t(key)))}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginInlineStart: 'auto' }}>
            <button
              className="hide-sm"
              aria-label={t('nav.search')}
              onClick={() => navigate('/courses')}
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'rgba(255,255,255,.09)',
                border: 'none',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                flex: 'none',
              }}
            >
              <Search size={17} aria-hidden="true" />
            </button>
            {!user && (
              <button
                className="hide-sm"
                onClick={() => navigate('/auth')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 14.5,
                  fontWeight: 600,
                  color: '#fff',
                  cursor: 'pointer',
                  padding: '10px 12px',
                }}
              >
                {t('nav.login')}
              </button>
            )}
            <button
              className="hover-bright hide-sm"
              onClick={() => navigate('/pricing')}
              style={{
                background: colors.gold,
                border: 'none',
                borderRadius: 10,
                fontSize: 14.5,
                fontWeight: 700,
                color: colors.utilityBar,
                cursor: 'pointer',
                padding: '11px 20px',
              }}
            >
              {t('common.enroll')}
            </button>
            {user && <NotificationBell />}
            {user && <UserMenu />}
            <button
              className="show-md"
              aria-label={t('nav.menu')}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,.09)',
                border: 'none',
                borderRadius: 10,
                width: 42,
                height: 42,
                color: '#fff',
                cursor: 'pointer',
                flex: 'none',
              }}
            >
              {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div
            className="show-md"
            style={{
              flexDirection: 'column',
              padding: '8px 24px 16px',
              borderTop: '1px solid rgba(255,255,255,.10)',
              background: colors.utilityBar,
              color: '#fff',
            }}
          >
            {NAV.map(([to, label]) => (
              <span
                key={to}
                onClick={() => go(to)}
                style={{
                  padding: '12px 4px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  color: pathname === to ? colors.gold : '#fff',
                  borderBottom: '1px solid rgba(255,255,255,.10)',
                }}
              >
                {t(label)}
              </span>
            ))}
            <span style={{ padding: '12px 4px', borderBottom: '1px solid rgba(255,255,255,.10)' }}>
              {langToggle({ fontSize: 15, color: '#fff' })}
            </span>
            {user && (
              <span onClick={() => go('/dashboard')} style={{ padding: '12px 4px', cursor: 'pointer', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,.10)' }}>
                {t('nav.dashboard')} ({user.name})
              </span>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                onClick={() => { if (user) { logout(); go('/'); } else { go('/auth'); } }}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,.09)',
                  border: '1px solid rgba(255,255,255,.16)',
                  borderRadius: 10,
                  padding: 12,
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                {user ? t('nav.logout') : t('nav.login')}
              </button>
              <button
                onClick={() => go('/pricing')}
                style={{
                  flex: 1,
                  background: colors.gold,
                  border: 'none',
                  borderRadius: 10,
                  padding: 12,
                  fontSize: 15,
                  fontWeight: 700,
                  color: colors.utilityBar,
                  cursor: 'pointer',
                }}
              >
                {t('common.enroll')}
              </button>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
