import { useParams, useNavigate } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import { colors, thumbGradients } from '../theme/tokens.js';
import { webapi, mapCourse, useFetch } from '../lib/api.js';

// Public instructor profile. Everything shown here is what the admin entered in the
// Admin Portal (photo, headline, bio, expertise, section) plus counts computed from
// the instructor's published courses. No placeholder numbers.
export default function Instructor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useFetch(() => webapi.instructor(id), [id]);
  const ins = data?.instructor;
  const courses = (data?.courses || []).map(mapCourse);

  if (loading) return <Container style={{ padding: '80px 24px' }}>جارٍ التحميل…</Container>;
  if (error || !ins) return <Container style={{ padding: '80px 24px' }}>لم يتم العثور على المحاضر.</Container>;

  const grad = thumbGradients[(ins.id || 0) % thumbGradients.length];
  const hours = ins.minutes ? Math.round((ins.minutes / 60) * 10) / 10 : 0;
  const stats = [
    [ins.courses, 'دورة'],
    [ins.lessons, 'فيديو'],
    [hours, 'ساعة محتوى'],
    [ins.students, 'متعلّم'],
  ].filter(([n]) => n > 0);

  return (
    <div>
      {/* Header */}
      <div style={{ background: 'linear-gradient(120deg,#1E2A5E,#3048A0)', color: '#fff', padding: '50px 0' }}>
        <Container style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
          {ins.avatar_url ? (
            <img
              src={ins.avatar_url}
              alt={ins.name}
              style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', flex: 'none',
                border: '4px solid rgba(255,255,255,.2)' }}
            />
          ) : (
            <div
              style={{ width: 120, height: 120, borderRadius: '50%', background: grad, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 46, fontWeight: 900, flex: 'none',
                border: '4px solid rgba(255,255,255,.2)' }}
            >
              {(ins.name || '؟').trim().charAt(0)}
            </div>
          )}
          <div>
            <h1 style={{ fontSize: 34, fontWeight: 900, margin: '0 0 6px' }}>{ins.name}</h1>
            {ins.headline && <div style={{ fontSize: 17, color: '#c9c9dc', marginBottom: 10 }}>{ins.headline}</div>}
            {ins.category && (
              <span style={{ background: 'rgba(233,190,67,.22)', color: '#F5D877', fontSize: 12, fontWeight: 800,
                padding: '6px 12px', borderRadius: 100 }}>
                قسم {ins.category.name}
              </span>
            )}
            {stats.length > 0 && (
              <div style={{ display: 'flex', gap: 26, fontSize: 14, flexWrap: 'wrap', marginTop: 16 }}>
                {stats.map(([n, label]) => (
                  <span key={label}><b style={{ fontSize: 18 }}>{n}</b> {label}</span>
                ))}
              </div>
            )}
          </div>
        </Container>
      </div>

      <Container style={{ padding: '40px 24px 60px' }}>
        <div
          className="grid-collapse-2"
          style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 40, alignItems: 'start' }}
        >
          <div>
            {ins.bio && (
              <>
                <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 14px' }}>نبذة</h2>
                <p style={{ fontSize: 16, lineHeight: 1.8, color: colors.ink2, margin: '0 0 34px', whiteSpace: 'pre-line' }}>
                  {ins.bio}
                </p>
              </>
            )}
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 18px' }}>دورات المحاضر</h2>
            {courses.length === 0 ? (
              <div style={{ color: colors.muted, fontSize: 15 }}>لا دورات منشورة بعد.</div>
            ) : (
              <div
                className="grid-collapse-sm"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}
              >
                {courses.map((c, i) => (
                  <div
                    key={c.id}
                    className="hover-lift"
                    onClick={() => navigate(`/courses/${c.slug}`)}
                    style={{ border: `1px solid ${colors.line}`, borderRadius: 16, overflow: 'hidden', background: '#fff', cursor: 'pointer' }}
                  >
                    {c.image
                      ? <img src={c.image} alt={c.title} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
                      : <div style={{ height: 140, background: thumbGradients[i % thumbGradients.length] }} />}
                    <div style={{ padding: 16 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.4, margin: '0 0 10px', minHeight: 44 }}>{c.title}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.muted }}>
                        <span>{c.lessons} فيديو</span>
                        {c.hours > 0 && <><span>·</span><span>{c.hours} ساعة</span></>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ border: `1px solid ${colors.line}`, borderRadius: 18, padding: 24, position: 'sticky', top: 90 }}>
            {(ins.expertise || []).length > 0 && (
              <>
                <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 16 }}>مجالات الخبرة</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
                  {ins.expertise.map((e) => (
                    <span key={e} style={{ background: colors.surfaceAlt, borderRadius: 100, padding: '7px 14px', fontSize: 13, fontWeight: 700 }}>
                      {e}
                    </span>
                  ))}
                </div>
              </>
            )}
            <button
              onClick={() => navigate('/courses')}
              style={{ width: '100%', background: colors.accent, border: 'none', borderRadius: 12, color: '#fff',
                fontSize: 15, fontWeight: 800, padding: 14, cursor: 'pointer' }}
            >
              تصفّح كل الدورات
            </button>
          </div>
        </div>
      </Container>
    </div>
  );
}
