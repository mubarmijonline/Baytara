import { useNavigate } from 'react-router-dom';
import { colors, layout } from '../theme/tokens.js';
import { footerCols, socials } from '../data/mock.js';
import { useSettings } from '../lib/api.js';

export default function Footer() {
  const navigate = useNavigate();
  const settings = useSettings();
  const tagline = settings.footer?.tagline;
  return (
    <footer style={{ background: colors.footer, color: '#b6b6cc' }}>
      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '56px 24px 30px' }}>
        <div
          className="grid-collapse-2"
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr 1fr 1fr',
            gap: 40,
            paddingBottom: 40,
            borderBottom: '1px solid rgba(255,255,255,.1)',
          }}
        >
          <div>
            <img
              src="/brand/logo-white.png"
              alt="بيطرة BAYTARA"
              onClick={() => navigate('/')}
              style={{
                height: 54,
                width: 'auto',
                objectFit: 'contain',
                marginBottom: 16,
                cursor: 'pointer',
                display: 'block',
              }}
            />
            <p style={{ fontSize: 14, lineHeight: 1.7, margin: '0 0 20px', maxWidth: 300 }}>
              {tagline ||
                'منصة التعلّم البيطري الأولى في العالم العربي — نُتيح المعرفة للأطباء والطلاب ومربّي الحيوان بمحتوى عربي أصيل من نخبة الخبراء.'}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              {socials.map((s) => (
                <div
                  key={s}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: 'rgba(255,255,255,.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 800,
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  {s}
                </div>
              ))}
            </div>
          </div>
          {footerCols.map((col) => (
            <div key={col.title}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 16 }}>{col.title}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {col.links.map((l) => (
                  <span key={l} className="link-muted" style={{ fontSize: 14 }}>
                    {l}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 22,
            fontSize: 13,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <span>© 2026 بيطرة Baytara. جميع الحقوق محفوظة.</span>
          <div style={{ display: 'flex', gap: 20 }}>
            <span style={{ cursor: 'pointer' }}>سياسة الخصوصية</span>
            <span style={{ cursor: 'pointer' }}>الشروط والأحكام</span>
            <span style={{ cursor: 'pointer' }}>اتفاقية الاستخدام</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
