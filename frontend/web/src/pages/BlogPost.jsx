import { useParams, useNavigate } from 'react-router-dom';
import { colors } from '../theme/tokens.js';
import { articles } from '../data/mock.js';

const body = [
  'يُعدّ هذا الموضوع من أهم الجوانب التي يجب على كل طبيب بيطري ومربّي حيوان الإلمام بها، لما له من أثر مباشر على صحة القطيع والإنتاجية.',
  'في هذا المقال نستعرض أبرز الإجراءات العملية والخطوات الوقائية المبنية على أحدث التوصيات العلمية، مع أمثلة تطبيقية من الميدان.',
  'ننصح دائماً بالرجوع إلى الطبيب البيطري المختص قبل تطبيق أي بروتوكول علاجي، وبمتابعة الدورات المتخصّصة على منصة بيطرة للتعمّق أكثر في التفاصيل.',
];

export default function BlogPost() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const article = articles.find((a) => a.slug === slug) || articles[0];
  const related = articles.filter((a) => a.slug !== article.slug).slice(0, 3);

  return (
    <div>
      <div style={{ height: 320, background: article.grad, position: 'relative' }} />
      <article style={{ maxWidth: 760, margin: '-80px auto 0', padding: '0 24px 60px', position: 'relative' }}>
        <div style={{ background: '#fff', border: `1px solid ${colors.line}`, borderRadius: 20, padding: 40, boxShadow: '0 20px 50px rgba(20,20,43,.08)' }}>
          <span
            onClick={() => navigate('/blog')}
            style={{ fontSize: 13, color: colors.accent, fontWeight: 700, cursor: 'pointer' }}
          >
            ← كل المقالات
          </span>
          <span
            style={{
              display: 'inline-block',
              background: colors.accentSoft,
              color: colors.accent,
              fontSize: 12,
              fontWeight: 800,
              padding: '5px 12px',
              borderRadius: 100,
              margin: '16px 0 14px',
            }}
          >
            {article.cat}
          </span>
          <h1 style={{ fontSize: 34, fontWeight: 900, margin: '0 0 14px', lineHeight: 1.3 }}>{article.title}</h1>
          <div style={{ fontSize: 13, color: colors.muted2, marginBottom: 26 }}>
            {article.date} · {article.read}
          </div>
          {body.map((p, i) => (
            <p key={i} style={{ fontSize: 17, lineHeight: 1.9, color: colors.ink2, margin: '0 0 20px' }}>
              {p}
            </p>
          ))}
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 900, margin: '40px 0 18px' }}>مقالات ذات صلة</h2>
        <div
          className="grid-collapse-sm"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}
        >
          {related.map((a) => (
            <div
              key={a.slug}
              className="hover-lift"
              onClick={() => navigate(`/blog/${a.slug}`)}
              style={{ border: `1px solid ${colors.line}`, borderRadius: 16, overflow: 'hidden', background: '#fff', cursor: 'pointer' }}
            >
              <div style={{ height: 110, background: a.grad }} />
              <div style={{ padding: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.4 }}>{a.title}</div>
              </div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
