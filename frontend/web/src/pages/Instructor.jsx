import { useParams, useNavigate } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import { colors, layout } from '../theme/tokens.js';
import { rawInstructors, rawCourses, expertise } from '../data/mock.js';
import { webapi, mapCourse, useFetch } from '../lib/api.js';

export default function Instructor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const idx = Number(id) || 0;
  const { data } = useFetch(() => webapi.instructor(id).catch(() => null), [id]);
  const apiIns = data?.instructor;
  const mentorMock = rawInstructors[idx] || rawInstructors[0];
  // real name/title/bio when the instructor exists in the DB; keep mock visual fields (grad, counts)
  const mentor = apiIns
    ? { ...mentorMock, name: apiIns.name, title: apiIns.headline || mentorMock.title,
        bio: apiIns.bio || mentorMock.bio, ini: (apiIns.name || '؟').trim().charAt(0) }
    : mentorMock;
  let mentorCourses = data?.courses?.length
    ? data.courses.map(mapCourse)
    : rawCourses.filter((c) => c.mentorIdx === idx).slice(0, 4);
  if (!mentorCourses.length) mentorCourses = rawCourses.slice(0, 2);

  return (
    <div>
      {/* Header */}
      <div style={{ background: 'linear-gradient(120deg,#14142b,#12285a)', color: '#fff', padding: '50px 0' }}>
        <Container style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              background: mentor.grad,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 46,
              fontWeight: 900,
              flex: 'none',
              border: '4px solid rgba(255,255,255,.2)',
            }}
          >
            {mentor.ini}
          </div>
          <div>
            <h1 style={{ fontSize: 34, fontWeight: 900, margin: '0 0 6px' }}>{mentor.name}</h1>
            <div style={{ fontSize: 17, color: '#c9c9dc', marginBottom: 16 }}>{mentor.title}</div>
            <div style={{ display: 'flex', gap: 26, fontSize: 14, flexWrap: 'wrap' }}>
              <span>
                <b style={{ fontSize: 18 }}>{mentor.courses}</b> دورة
              </span>
              <span>
                <b style={{ fontSize: 18 }}>{mentor.students}</b> متعلّم
              </span>
              <span>
                <span style={{ color: colors.star }}>★</span> <b style={{ fontSize: 18 }}>4.8</b> تقييم
              </span>
            </div>
          </div>
        </Container>
      </div>

      <Container style={{ padding: '40px 24px 60px' }}>
        <div
          className="grid-collapse-2"
          style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 40, alignItems: 'start' }}
        >
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 14px' }}>نبذة</h2>
            <p style={{ fontSize: 16, lineHeight: 1.8, color: colors.ink2, margin: '0 0 34px' }}>
              طبيب وخبير معتمد بخبرة تتجاوز خمسة عشر عاماً في مجاله. عمل مع كبرى العيادات والمزارع في المنطقة
              ودرّب آلاف المتعلّمين. يؤمن بأن المعرفة العملية المباشرة هي الطريق الأسرع للتطوّر، ويقدّم محتواه
              بأسلوب مبسّط وشيّق يجمع بين النظرية والتطبيق.
            </p>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 18px' }}>دورات المدرّب</h2>
            <div
              className="grid-collapse-sm"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}
            >
              {mentorCourses.map((c) => (
                <div
                  key={c.id}
                  className="hover-lift"
                  onClick={() => navigate(`/courses/${c.slug}`)}
                  style={{ border: `1px solid ${colors.line}`, borderRadius: 16, overflow: 'hidden', background: '#fff', cursor: 'pointer' }}
                >
                  <div style={{ height: 140, background: c.grad }} />
                  <div style={{ padding: 16 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.4, margin: '0 0 10px', minHeight: 44 }}>{c.title}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.muted }}>
                      <span style={{ color: colors.star, fontWeight: 800 }}>★ {c.rating}</span>
                      <span>·</span>
                      <span>{c.lessons} درس</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ border: `1px solid ${colors.line}`, borderRadius: 18, padding: 24, position: 'sticky', top: 90 }}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 16 }}>مجالات الخبرة</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
              {expertise.map((e) => (
                <span key={e} style={{ background: colors.surfaceAlt, borderRadius: 100, padding: '7px 14px', fontSize: 13, fontWeight: 700 }}>
                  {e}
                </span>
              ))}
            </div>
            <button
              onClick={() => navigate('/pricing')}
              style={{
                width: '100%',
                background: colors.accent,
                border: 'none',
                borderRadius: 12,
                color: '#fff',
                fontSize: 15,
                fontWeight: 800,
                padding: 14,
                cursor: 'pointer',
              }}
            >
              تابع كل دوراته
            </button>
          </div>
        </div>
      </Container>
    </div>
  );
}
