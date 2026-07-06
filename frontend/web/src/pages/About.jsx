import { Container } from '../components/Primitives.jsx';
import PageHero from '../components/PageHero.jsx';
import { colors } from '../theme/tokens.js';
import { stats } from '../data/mock.js';

const values = [
  { icon: '🎯', title: 'رسالتنا', desc: 'إتاحة المعرفة البيطرية الاحترافية لكل طبيب وطالب ومربّي حيوان في العالم العربي بلغته الأم.' },
  { icon: '👁', title: 'رؤيتنا', desc: 'أن نكون المرجع الأول للتعلّم والاستشارة البيطرية عربياً، ونرفع مستوى الرعاية الصحية الحيوانية في المنطقة.' },
  { icon: '🤝', title: 'قيمنا', desc: 'المصداقية العلمية، جودة المحتوى، سهولة الوصول، ودعم مجتمع بيطري متكامل.' },
];

export default function About() {
  return (
    <div>
      <PageHero
        breadcrumb="الرئيسية › من نحن"
        title="من نحن"
        subtitle="بيطرة منصة تعليمية واستشارية متخصّصة في الطب البيطري والإنتاج الحيواني، تجمع نخبة الخبراء العرب في مكان واحد."
      />
      <Container style={{ padding: '50px 24px' }}>
        <div
          className="grid-collapse-sm"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22, marginBottom: 50 }}
        >
          {values.map((v) => (
            <div key={v.title} style={{ border: `1px solid ${colors.line}`, borderRadius: 18, padding: 28 }}>
              <div style={{ fontSize: 30, marginBottom: 14 }}>{v.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>{v.title}</div>
              <p style={{ fontSize: 15, color: colors.muted, lineHeight: 1.7, margin: 0 }}>{v.desc}</p>
            </div>
          ))}
        </div>

        <div
          style={{ background: colors.surfaceMuted, borderRadius: 24, padding: '46px 40px', marginBottom: 20 }}
        >
          <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 30px', textAlign: 'center' }}>بيطرة بالأرقام</h2>
          <div
            className="grid-collapse-sm"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}
          >
            {stats.map((s) => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 34, fontWeight: 900, color: colors.accent }}>{s.num}</div>
                <div style={{ fontSize: 15, color: colors.muted, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </div>
  );
}
