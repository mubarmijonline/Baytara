import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { colors, gradients, layout } from '../theme/tokens.js';
import { auth } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useSiteSettings } from '../lib/site-settings.jsx';

function UserMenu() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen((o) => !o)}
        title="حسابي"
        style={{ width: 42, height: 42, borderRadius: '50%', background: gradients.avatar, display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, cursor: 'pointer', flex: 'none' }}
      >
        {(user?.name || '?').trim().charAt(0)}
      </div>
      {open && (
        <div style={{ position: 'absolute', insetInlineEnd: 0, top: 48, width: 220, background: '#fff',
          border: '1px solid #ececf2', borderRadius: 14, boxShadow: '0 18px 44px rgba(20,20,43,.18)', zIndex: 60, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #f0f0f4' }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{user?.name}</div>
            <div style={{ fontSize: 12, color: '#5A6180', direction: 'ltr', textAlign: 'right' }}>{user?.email}</div>
          </div>
          <div onClick={() => { setOpen(false); navigate('/dashboard'); }} style={{ padding: '11px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>لوحتي</div>
          <div onClick={() => { logout(); setOpen(false); navigate('/'); }} style={{ padding: '11px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#3048A0', borderTop: '1px solid #f0f0f4' }}>تسجيل الخروج</div>
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  const load = () => auth.notifications().then((r) => { setItems(r.notifications); setUnread(r.unread); }).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);

  async function markAll() { try { await auth.notifReadAll(); load(); } catch { /* noop */ } }

  return (
    <div style={{ position: 'relative' }}>
      <button
        aria-label="الإشعارات"
        onClick={() => setOpen((o) => !o)}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 20, position: 'relative', padding: 6 }}
      >
        🔔
        {unread > 0 && (
          <span style={{ position: 'absolute', top: 0, insetInlineEnd: 0, background: colors.accent, color: '#fff',
            fontSize: 10, fontWeight: 800, borderRadius: 10, padding: '1px 5px', minWidth: 16 }}>{unread}</span>
        )}
      </button>
      {open && (
        <div style={{ position: 'absolute', insetInlineEnd: 0, top: 44, width: 320, maxHeight: 420, overflowY: 'auto',
          background: '#fff', border: `1px solid ${colors.line}`, borderRadius: 14, boxShadow: '0 18px 44px rgba(20,20,43,.18)', zIndex: 60 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: `1px solid ${colors.line2}` }}>
            <b style={{ fontSize: 14 }}>الإشعارات</b>
            {unread > 0 && <span onClick={markAll} style={{ fontSize: 12, color: colors.accent, cursor: 'pointer', fontWeight: 700 }}>تعليم الكل كمقروء</span>}
          </div>
          {items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: colors.muted, fontSize: 13 }}>لا إشعارات.</div>
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

function SearchIcon({ color = '#cfcfe0' }) {
  return (
    <span
      style={{
        width: 16,
        height: 16,
        border: `2px solid ${color}`,
        borderRadius: '50%',
        position: 'relative',
        flex: 'none',
      }}
    >
      <span
        style={{
          position: 'absolute',
          width: 7,
          height: 2,
          background: color,
          bottom: -3,
          left: -4,
          transform: 'rotate(45deg)',
          borderRadius: 2,
        }}
      />
    </span>
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
              <SearchIcon />
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
                flexDirection: 'column',
                gap: 4,
                background: 'rgba(255,255,255,.09)',
                border: 'none',
                borderRadius: 10,
                padding: 12,
                cursor: 'pointer',
                flex: 'none',
              }}
            >
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: 18, height: 2, background: '#fff', borderRadius: 2 }} />
              ))}
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
