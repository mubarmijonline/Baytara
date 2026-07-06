import { Container } from '../components/Primitives.jsx';
import { colors, gradients } from '../theme/tokens.js';
import { bizStats, bizFeatures, logos } from '../data/mock.js';

export default function Business() {
  return (
    <div>
      <section style={{ background: 'linear-gradient(120deg,#14142b,#2a1a3a)', color: '#fff', padding: '70px 0' }}>
        <Container
          className="grid-collapse-2"
          style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 40, alignItems: 'center' }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: colors.accent, letterSpacing: 1, marginBottom: 14 }}>
              BAYTARA FOR BUSINESS
            </div>
            <h1 style={{ fontSize: 44, fontWeight: 900, margin: '0 0 16px', lineHeight: 1.2 }}>استثمر في نمو فريقك الطبي</h1>
            <p style={{ fontSize: 18, color: '#c9c9dc', lineHeight: 1.7, margin: '0 0 28px', maxWidth: 500 }}>
              منصة تدريب متكاملة للعيادات والمزارع مع محتوى بيطري احترافي، لوحة تحكم للمدراء، وتقارير أداء لحظية.
            </p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <button
                style={{
                  background: colors.accent,
                  border: 'none',
                  borderRadius: 12,
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: 800,
                  padding: '16px 32px',
                  cursor: 'pointer',
                }}
              >
                اطلب عرضاً تجريبياً
              </button>
              <button
                style={{
                  background: 'rgba(255,255,255,.1)',
                  border: '1px solid rgba(255,255,255,.25)',
                  borderRadius: 12,
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: 700,
                  padding: '16px 28px',
                  cursor: 'pointer',
                }}
              >
                تحدث مع مختص
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {bizStats.map((b) => (
              <div
                key={b.label}
                style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 16, padding: 22 }}
              >
                <div style={{ fontSize: 30, fontWeight: 900 }}>{b.num}</div>
                <div style={{ fontSize: 14, color: '#b6b6cc' }}>{b.label}</div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <Container style={{ padding: '60px 24px' }}>
        <h2 style={{ fontSize: 30, fontWeight: 900, margin: '0 0 8px', textAlign: 'center' }}>لماذا تختارنا العيادات والمزارع</h2>
        <p style={{ textAlign: 'center', color: colors.muted, fontSize: 16, margin: '0 0 40px' }}>
          كل ما تحتاجه لبناء ثقافة تعلّم مستمرة داخل مؤسستك
        </p>
        <div
          className="grid-collapse-sm"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22 }}
        >
          {bizFeatures.map((f) => (
            <div key={f.title} style={{ border: `1px solid ${colors.line}`, borderRadius: 18, padding: 28 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: f.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                  fontSize: 22,
                  color: '#fff',
                  fontWeight: 900,
                }}
              >
                {f.icon}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{f.title}</div>
              <p style={{ fontSize: 15, color: colors.muted, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </Container>

      <section style={{ background: colors.surfaceMuted }}>
        <Container style={{ padding: '46px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.muted2, marginBottom: 24 }}>
            تثق بنا أكثر من 900 عيادة ومزرعة في المنطقة
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 40, flexWrap: 'wrap', opacity: 0.5 }}>
            {logos.map((l, i) => (
              <div key={i} style={{ fontSize: 22, fontWeight: 900, color: colors.muted }}>
                {l}
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section style={{ maxWidth: 900, margin: '0 auto', padding: '60px 24px' }}>
        <div style={{ background: gradients.accentCta, borderRadius: 24, padding: 46, textAlign: 'center', color: '#fff' }}>
          <h2 style={{ fontSize: 30, fontWeight: 900, margin: '0 0 12px' }}>جاهز لتطوير فريقك؟</h2>
          <p style={{ fontSize: 17, opacity: 0.95, margin: '0 0 26px' }}>
            احجز عرضاً تجريبياً مجانياً وسيتواصل معك فريقنا خلال 24 ساعة.
          </p>
          <div style={{ display: 'flex', gap: 10, maxWidth: 460, margin: '0 auto' }}>
            <input
              placeholder="بريد العمل الإلكتروني"
              style={{ flex: 1, border: 'none', borderRadius: 12, padding: '15px 18px', fontSize: 15, outline: 'none' }}
            />
            <button
              style={{
                background: colors.ink,
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 800,
                padding: '15px 26px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              ابدأ الآن
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
