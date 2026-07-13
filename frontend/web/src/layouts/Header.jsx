import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { colors, gradients, layout } from '../theme/tokens.js';
import { isAuthed, auth } from '../lib/api.js';

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

function SearchIcon() {
  return (
    <span
      style={{
        width: 16,
        height: 16,
        border: '2px solid #9a9aac',
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
          background: '#9a9aac',
          bottom: -3,
          left: -4,
          transform: 'rotate(45deg)',
          borderRadius: 2,
        }}
      />
    </span>
  );
}

const NAV = [
  ['/courses', 'الدورات'],
  ['/pricing', 'الاشتراكات'],
  ['/business', 'للأعمال'],
  ['/blog', 'المدوّنة'],
];

export default function Header() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const go = (to) => {
    setMenuOpen(false);
    navigate(to);
  };
  const navItem = (to, label) => (
    <span
      onClick={() => go(to)}
      style={{ cursor: 'pointer', color: pathname === to ? colors.accent : colors.ink }}
    >
      {label}
    </span>
  );

  return (
    <>
      {/* Top utility bar */}
      <div style={{ background: colors.utilityBar, color: '#cfcfe0', fontSize: 13 }}>
        <div
          style={{
            maxWidth: layout.maxWidth,
            margin: '0 auto',
            padding: '8px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>مرحباً بك في منصة التعلّم البيطري الأولى عربياً</span>
          <div className="hide-sm" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ cursor: 'pointer' }}>تحميل التطبيق</span>
            <span style={{ opacity: 0.4 }}>|</span>
            <span style={{ cursor: 'pointer' }} onClick={() => navigate('/contact')}>
              المساعدة
            </span>
            <span style={{ opacity: 0.4 }}>|</span>
            <span style={{ cursor: 'pointer' }}>EN</span>
          </div>
        </div>
      </div>

      {/* Main header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: '#fff',
          borderBottom: `1px solid ${colors.line}`,
          boxShadow: '0 1px 12px rgba(20,20,43,.04)',
        }}
      >
        <div
          style={{
            maxWidth: layout.maxWidth,
            margin: '0 auto',
            padding: '0 24px',
            height: layout.headerHeight,
            display: 'flex',
            alignItems: 'center',
            gap: 20,
          }}
        >
          <img
            src="/baytara_logo.jpeg"
            alt="بيطرة"
            onClick={() => navigate('/')}
            style={{
              height: 48,
              width: 156,
              objectFit: 'cover',
              objectPosition: 'center',
              borderRadius: 10,
              cursor: 'pointer',
              flex: 'none',
            }}
          />

          <button
            className="hide-md"
            onClick={() => navigate('/courses')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: colors.surfaceAlt,
              border: 'none',
              borderRadius: 10,
              padding: '10px 16px',
              fontSize: 15,
              fontWeight: 700,
              color: colors.ink,
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3 }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: 16, height: 2, background: colors.ink, borderRadius: 2 }} />
              ))}
            </span>
            الفئات
          </button>

          <div
            className="hide-sm"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: colors.surfaceAlt,
              border: `1px solid ${colors.line}`,
              borderRadius: 12,
              padding: '0 16px',
              height: 44,
            }}
          >
            <SearchIcon />
            <input
              placeholder="ابحث عن دورة أو طبيب أو تخصّص…"
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: 15,
                color: colors.ink,
              }}
            />
          </div>

          <nav
            className="hide-md"
            style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 15, fontWeight: 700 }}
          >
            {navItem('/courses', 'الدورات')}
            {navItem('/pricing', 'الاشتراكات')}
            {navItem('/business', 'للأعمال')}
            {navItem('/blog', 'المدوّنة')}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginInlineStart: 'auto' }}>
            {!isAuthed() && (
              <button
                className="hide-sm"
                onClick={() => navigate('/auth')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 15,
                  fontWeight: 700,
                  color: colors.ink,
                  cursor: 'pointer',
                  padding: '10px 12px',
                }}
              >
                تسجيل الدخول
              </button>
            )}
            <button
              className="hover-bright hide-sm"
              onClick={() => navigate('/pricing')}
              style={{
                background: colors.accent,
                border: 'none',
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 800,
                color: '#fff',
                cursor: 'pointer',
                padding: '11px 22px',
              }}
            >
              اشترك الآن
            </button>
            {isAuthed() && <NotificationBell />}
            <div
              onClick={() => navigate('/dashboard')}
              title="لوحتي"
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: gradients.avatar,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 800,
                cursor: 'pointer',
                flex: 'none',
              }}
            >
              م
            </div>
            <button
              className="show-md"
              aria-label="القائمة"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              style={{
                flexDirection: 'column',
                gap: 4,
                background: colors.surfaceAlt,
                border: 'none',
                borderRadius: 10,
                padding: 12,
                cursor: 'pointer',
                flex: 'none',
              }}
            >
              {[0, 1, 2].map((i) => (
                <span key={i} style={{ width: 18, height: 2, background: colors.ink, borderRadius: 2 }} />
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
              borderTop: `1px solid ${colors.line}`,
              background: '#fff',
            }}
          >
            <span
              onClick={() => go('/courses')}
              style={{ padding: '12px 4px', cursor: 'pointer', fontWeight: 700, borderBottom: `1px solid ${colors.line2}` }}
            >
              الفئات والدورات
            </span>
            {NAV.map(([to, label]) => (
              <span
                key={to}
                onClick={() => go(to)}
                style={{
                  padding: '12px 4px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  color: pathname === to ? colors.accent : colors.ink,
                  borderBottom: `1px solid ${colors.line2}`,
                }}
              >
                {label}
              </span>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button
                onClick={() => go('/auth')}
                style={{
                  flex: 1,
                  background: colors.surfaceAlt,
                  border: `1px solid ${colors.line}`,
                  borderRadius: 10,
                  padding: 12,
                  fontSize: 15,
                  fontWeight: 700,
                  color: colors.ink,
                  cursor: 'pointer',
                }}
              >
                تسجيل الدخول
              </button>
              <button
                onClick={() => go('/pricing')}
                style={{
                  flex: 1,
                  background: colors.accent,
                  border: 'none',
                  borderRadius: 10,
                  padding: 12,
                  fontSize: 15,
                  fontWeight: 800,
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                اشترك الآن
              </button>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
