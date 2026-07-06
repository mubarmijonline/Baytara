import { Container } from '../components/Primitives.jsx';
import PageHero from '../components/PageHero.jsx';
import { colors } from '../theme/tokens.js';

const channels = [
  { icon: '✉', title: 'البريد الإلكتروني', value: 'support@baytara.com' },
  { icon: '☎', title: 'الهاتف', value: '+20 100 000 0000' },
  { icon: '⌂', title: 'العنوان', value: 'القاهرة، جمهورية مصر العربية' },
];

const inputStyle = {
  width: '100%',
  border: `1px solid #ddd`,
  borderRadius: 12,
  padding: '14px 16px',
  fontSize: 15,
  outline: 'none',
  marginBottom: 16,
};

export default function Contact() {
  return (
    <div>
      <PageHero
        breadcrumb="الرئيسية › تواصل معنا"
        title="تواصل معنا"
        subtitle="لديك سؤال أو اقتراح؟ فريقنا جاهز لمساعدتك. راسلنا وسنعود إليك في أقرب وقت."
      />
      <Container style={{ padding: '40px 24px 60px' }}>
        <div
          className="grid-collapse-2"
          style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 40, alignItems: 'start' }}
        >
          {/* Form */}
          <form
            onSubmit={(e) => e.preventDefault()}
            style={{ border: `1px solid ${colors.line}`, borderRadius: 20, padding: 32 }}
          >
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 20px' }}>أرسل رسالة</h2>
            <div className="grid-collapse-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <input placeholder="الاسم الكامل" style={inputStyle} />
              <input placeholder="البريد الإلكتروني" style={inputStyle} />
            </div>
            <input placeholder="الموضوع" style={inputStyle} />
            <textarea placeholder="رسالتك…" rows={6} style={{ ...inputStyle, resize: 'vertical' }} />
            <button
              type="submit"
              style={{
                background: colors.accent,
                border: 'none',
                borderRadius: 12,
                color: '#fff',
                fontSize: 16,
                fontWeight: 800,
                padding: '14px 30px',
                cursor: 'pointer',
              }}
            >
              إرسال الرسالة
            </button>
          </form>

          {/* Channels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {channels.map((c) => (
              <div
                key={c.title}
                style={{ display: 'flex', alignItems: 'center', gap: 16, border: `1px solid ${colors.line}`, borderRadius: 16, padding: 20 }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 12,
                    background: colors.accentSoft,
                    color: colors.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    flex: 'none',
                  }}
                >
                  {c.icon}
                </div>
                <div>
                  <div style={{ fontSize: 13, color: colors.muted2, marginBottom: 3 }}>{c.title}</div>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{c.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </div>
  );
}
