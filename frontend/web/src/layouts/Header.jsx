import { useNavigate, useLocation } from 'react-router-dom';
import { colors, gradients, layout } from '../theme/tokens.js';

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

export default function Header() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const navItem = (to, label) => (
    <span
      onClick={() => navigate(to)}
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
          <div
            onClick={() => navigate('/')}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 1,
              fontWeight: 800,
              fontSize: 26,
              letterSpacing: '-.5px',
              cursor: 'pointer',
            }}
          >
            <span style={{ color: colors.ink }}>بيطرة</span>
            <span style={{ color: colors.accent, fontSize: 30, lineHeight: 0 }}>.</span>
          </div>

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
            <button
              className="hover-bright"
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
          </div>
        </div>
      </header>
    </>
  );
}
