import { useNavigate } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import PageHero from '../components/PageHero.jsx';
import { colors } from '../theme/tokens.js';
import { articles } from '../data/mock.js';
import { webapi, useFetch } from '../lib/api.js';

export default function Blog() {
  const navigate = useNavigate();
  const { data } = useFetch(() => webapi.articles('blog'), []);
  const list = data?.articles?.length
    ? data.articles.map((a) => ({ ...a, date: (a.published_at || a.created_at || '').slice(0, 10), read: '' }))
    : articles;
  const [featured, ...rest] = list;

  return (
    <div>
      <PageHero
        breadcrumb="الرئيسية › المدوّنة"
        title="المدوّنة والمقالات التوعوية"
        subtitle="مقالات ونصائح بيطرية من خبرائنا لمساعدتك في رعاية حيواناتك وتطوير مهاراتك المهنية."
      />
      <Container style={{ padding: '40px 24px 60px' }}>
        {/* Featured */}
        <div
          className="grid-collapse-2"
          onClick={() => navigate(`/blog/${featured.slug}`)}
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr',
            gap: 0,
            border: `1px solid ${colors.line}`,
            borderRadius: 20,
            overflow: 'hidden',
            marginBottom: 40,
            cursor: 'pointer',
          }}
        >
          <div style={{ minHeight: 260, background: featured.grad }} />
          <div style={{ padding: 36, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span
              style={{
                alignSelf: 'flex-start',
                background: colors.accentSoft,
                color: colors.accent,
                fontSize: 12,
                fontWeight: 800,
                padding: '5px 12px',
                borderRadius: 100,
                marginBottom: 14,
              }}
            >
              {featured.cat}
            </span>
            <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 12px', lineHeight: 1.3 }}>{featured.title}</h2>
            <p style={{ fontSize: 16, color: colors.muted, lineHeight: 1.7, margin: '0 0 18px' }}>{featured.excerpt}</p>
            <div style={{ fontSize: 13, color: colors.muted2 }}>
              {featured.date} · {featured.read}
            </div>
          </div>
        </div>

        {/* Grid */}
        <div
          className="grid-collapse-sm"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22 }}
        >
          {rest.map((a) => (
            <div
              key={a.slug}
              className="hover-lift"
              onClick={() => navigate(`/blog/${a.slug}`)}
              style={{ border: `1px solid ${colors.line}`, borderRadius: 16, overflow: 'hidden', background: '#fff', cursor: 'pointer' }}
            >
              <div style={{ height: 160, background: a.grad }} />
              <div style={{ padding: 20 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: colors.accent }}>{a.cat}</span>
                <h3 style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.4, margin: '8px 0 10px' }}>{a.title}</h3>
                <p style={{ fontSize: 14, color: colors.muted, lineHeight: 1.6, margin: '0 0 14px' }}>{a.excerpt}</p>
                <div style={{ fontSize: 12, color: colors.muted2 }}>
                  {a.date} · {a.read}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </div>
  );
}
