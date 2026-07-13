import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '../theme/tokens.js';
import { plansData, faqs } from '../data/mock.js';
import { useSettings } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

export default function Pricing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [annual, setAnnual] = useState(true);
  const settings = useSettings();
  const mockPlans = plansData(annual, colors.accent);
  // admin-defined plans override content over the design's styled templates; else mock
  const plans = Array.isArray(settings.plans) && settings.plans.length
    ? settings.plans.map((item, i) => ({ ...mockPlans[i % mockPlans.length], ...item }))
    : mockPlans;
  const faqList = Array.isArray(settings.faqs) && settings.faqs.length ? settings.faqs : faqs;

  const toggleBtn = (active, label, onClick) => (
    <button
      onClick={onClick}
      style={{
        border: 'none',
        borderRadius: 100,
        padding: '10px 24px',
        fontSize: 15,
        fontWeight: 800,
        cursor: 'pointer',
        background: active ? '#fff' : 'transparent',
        color: active ? colors.ink : colors.muted,
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ textAlign: 'center', padding: '60px 24px 30px' }}>
        <h1 style={{ fontSize: 40, fontWeight: 900, margin: '0 0 12px' }}>اختر خطة اشتراكك</h1>
        <p style={{ fontSize: 18, color: colors.muted, margin: '0 auto 26px', maxWidth: 560 }}>
          وصول غير محدود لأكثر من 2000 دورة بيطرية. ألغِ في أي وقت.
        </p>
        <div style={{ display: 'inline-flex', background: colors.surfaceAlt, borderRadius: 100, padding: 5 }}>
          {toggleBtn(!annual, 'شهري', () => setAnnual(false))}
          {toggleBtn(annual, 'سنوي · وفّر 40%', () => setAnnual(true))}
        </div>
      </div>

      <div
        className="grid-collapse-sm"
        style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 24px 40px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22, alignItems: 'stretch' }}
      >
        {plans.map((p) => (
          <div
            key={p.name}
            style={{ border: p.border, borderRadius: 20, padding: 30, position: 'relative', background: p.bg, color: p.fg }}
          >
            {p.featured && (
              <span
                style={{
                  position: 'absolute',
                  top: -13,
                  right: 24,
                  background: colors.accent,
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '6px 14px',
                  borderRadius: 100,
                }}
              >
                الأكثر شعبية
              </span>
            )}
            <div style={{ fontSize: 19, fontWeight: 900, marginBottom: 6 }}>{p.name}</div>
            <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 20 }}>{p.tagline}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 42, fontWeight: 900 }}>{p.price}</span>
              <span style={{ fontSize: 15, opacity: 0.7 }}>ج.م / {p.per}</span>
            </div>
            <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 22 }}>{p.billed}</div>
            <button
              onClick={() => navigate(user ? '/courses' : '/auth')}
              style={{
                width: '100%',
                background: p.btnBg,
                color: p.btnFg,
                border: p.btnBorder,
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 800,
                padding: 14,
                cursor: 'pointer',
                marginBottom: 22,
              }}
            >
              {p.cta}
            </button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {p.features.map((f) => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                  <span style={{ color: colors.accent, fontWeight: 900 }}>✓</span> {f}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '30px 24px 70px' }}>
        <h2 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 22px', textAlign: 'center' }}>الأسئلة الشائعة</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {faqList.map((q) => (
            <div key={q.q} style={{ border: `1px solid ${colors.line}`, borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 16, fontWeight: 800 }}>
                <span>{q.q}</span>
                <span style={{ color: colors.muted2 }}>+</span>
              </div>
              <p style={{ fontSize: 14, color: colors.muted, lineHeight: 1.6, margin: '10px 0 0' }}>{q.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
