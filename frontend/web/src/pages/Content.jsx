import { Container } from '../components/Primitives.jsx';
import PageHero from '../components/PageHero.jsx';
import { colors } from '../theme/tokens.js';
import { freeContent } from '../data/mock.js';
import { webapi, useFetch } from '../lib/api.js';

export default function Content() {
  const { data } = useFetch(() => webapi.articles('content'), []);
  const list = data?.articles?.length
    ? data.articles.map((a, i) => ({
        title: a.title,
        dur: a.excerpt || '',
        type: 'محتوى',
        grad: freeContent[i % freeContent.length].grad,
      }))
    : [];
  return (
    <div>
      <PageHero
        breadcrumb="الرئيسية › محتوى مجاني"
        title="محتوى تعليمي واستشاري مجاني"
        subtitle="ندوات، ملفات، وسلاسل فيديو مجانية متاحة للجميع — تعلّم وابدأ رحلتك دون أي التزام."
      />
      <Container style={{ padding: '40px 24px 60px' }}>
        <div
          className="grid-collapse-sm"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 22 }}
        >
          {list.map((c) => (
            <div
              key={c.title}
              className="hover-lift"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                border: `1px solid ${colors.line}`,
                borderRadius: 18,
                overflow: 'hidden',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: 130,
                  minHeight: 130,
                  alignSelf: 'stretch',
                  background: c.grad,
                  flex: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,.9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    style={{
                      width: 0,
                      height: 0,
                      borderTop: '9px solid transparent',
                      borderBottom: '9px solid transparent',
                      borderRight: '14px solid #14142b',
                      marginRight: -3,
                    }}
                  />
                </div>
              </div>
              <div style={{ padding: '18px 18px 18px 0', flex: 1 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: colors.accent,
                    background: colors.accentSoft,
                    padding: '4px 10px',
                    borderRadius: 100,
                  }}
                >
                  {c.type}
                </span>
                <div style={{ fontSize: 17, fontWeight: 800, margin: '12px 0 6px', lineHeight: 1.4 }}>{c.title}</div>
                <div style={{ fontSize: 13, color: colors.muted2 }}>{c.dur}</div>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </div>
  );
}
