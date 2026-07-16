import { useParams, useNavigate } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import { colors, gradients, layout } from '../theme/tokens.js';
import { rawCourses, learnPoints, curriculum, includes, reviews } from '../data/mock.js';
import { webapi, mapCourse, useFetch } from '../lib/api.js';

export default function CourseDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { data } = useFetch(() => webapi.course(slug).catch(() => null), [slug]);
  const mockCourse = rawCourses.find((c) => c.slug === slug) || rawCourses[0];
  const course = data?.course ? mapCourse(data.course) : mockCourse;

  return (
    <div>
      {/* Dark header */}
      <div style={{ background: gradients.darkPanel, color: '#fff', padding: '44px 0 130px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ fontSize: 13, color: '#b6b6cc', marginBottom: 14 }}>
            <span onClick={() => navigate('/courses')} style={{ cursor: 'pointer' }}>
              الدورات
            </span>{' '}
            › {course.cat}
          </div>
          <span
            style={{
              background: 'rgba(233,190,67,.22)',
              color: '#F5D877',
              fontSize: 12,
              fontWeight: 800,
              padding: '6px 12px',
              borderRadius: 100,
            }}
          >
            {course.cat}
          </span>
          <h1 style={{ fontSize: 40, fontWeight: 900, margin: '16px 0 14px', lineHeight: 1.2 }}>{course.title}</h1>
          <p style={{ fontSize: 18, color: '#c9c9dc', lineHeight: 1.7, margin: '0 0 20px' }}>
            دورة شاملة تأخذك خطوة بخطوة من الأساسيات حتى الاحتراف، مع حالات سريرية عملية وأمثلة من الواقع.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 14, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: colors.star, fontSize: 16 }}>★</span> <b>{course.rating}</b> ({course.learners} تقييم)
            </span>
            <span>{course.lessons} درس</span>
            <span>{course.hours} ساعة محتوى</span>
            <span>شهادة إتمام</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: course.grad,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
              }}
            >
              {course.ini}
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#b6b6cc' }}>المدرّب</div>
              <div
                onClick={() => navigate(`/instructors/${course.mentorIdx}`)}
                style={{ fontSize: 15, fontWeight: 800, cursor: 'pointer' }}
              >
                {course.instructor}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Container
        className="grid-collapse-2"
        style={{ padding: '0 24px 60px', display: 'grid', gridTemplateColumns: '1fr 360px', gap: 34, alignItems: 'start', marginTop: -90 }}
      >
        {/* Left content */}
        <div
          style={{
            background: '#fff',
            border: `1px solid ${colors.line}`,
            borderRadius: 20,
            padding: 34,
            boxShadow: '0 20px 50px rgba(20,20,43,.06)',
          }}
        >
          <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 18px' }}>ماذا ستتعلّم</h2>
          <div
            className="grid-collapse-sm"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 36 }}
          >
            {learnPoints.map((p) => (
              <div key={p} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 15, lineHeight: 1.5 }}>
                <span style={{ color: colors.accent, fontWeight: 900, flex: 'none' }}>✓</span> {p}
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 18px' }}>محتوى الدورة</h2>
          <div style={{ border: `1px solid ${colors.line}`, borderRadius: 14, overflow: 'hidden' }}>
            {curriculum.map((mod, mi) => (
              <div key={mi} style={{ borderBottom: `1px solid ${colors.line2}` }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 18px',
                    background: '#fafafc',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{mod.title}</div>
                  <div style={{ fontSize: 13, color: colors.muted2 }}>{mod.count} دروس</div>
                </div>
                {mod.lessons.map((ls, li) => (
                  <div
                    key={li}
                    onClick={() => navigate(`/learn/${course.id}/${mi}-${li}`)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 18px',
                      fontSize: 14,
                      color: colors.ink2,
                      borderTop: '1px solid #f5f5f8',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: '#f0f0f4',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 'none',
                      }}
                    >
                      <span
                        style={{
                          width: 0,
                          height: 0,
                          borderTop: '5px solid transparent',
                          borderBottom: '5px solid transparent',
                          borderRight: '8px solid #9a9aac',
                        }}
                      />
                    </span>
                    <span style={{ flex: 1 }}>{ls.name}</span>
                    <span style={{ color: colors.muted2 }}>{ls.dur}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 900, margin: '36px 0 18px' }}>المدرّب</h2>
          <div
            onClick={() => navigate(`/instructors/${course.mentorIdx}`)}
            style={{ display: 'flex', gap: 18, alignItems: 'center', cursor: 'pointer' }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: course.grad,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 28,
                fontWeight: 900,
                flex: 'none',
              }}
            >
              {course.ini}
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{course.instructor}</div>
              <div style={{ fontSize: 14, color: colors.muted, marginBottom: 6 }}>طبيب وخبير معتمد</div>
              <div style={{ fontSize: 13, color: colors.muted2 }}>★ 4.8 تقييم · 12 دورة · 84k متعلّم</div>
            </div>
          </div>

          <h2 style={{ fontSize: 22, fontWeight: 900, margin: '36px 0 18px' }}>تقييمات المتعلّمين</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {reviews.map((rv) => (
              <div key={rv.name} style={{ border: `1px solid ${colors.line}`, borderRadius: 14, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: rv.grad,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontWeight: 800,
                    }}
                  >
                    {rv.ini}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{rv.name}</div>
                    <div style={{ color: colors.star, fontSize: 12 }}>★★★★★</div>
                  </div>
                </div>
                <p style={{ fontSize: 14, color: colors.ink2, lineHeight: 1.6, margin: 0 }}>{rv.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Sticky enroll card */}
        <div
          style={{
            position: 'sticky',
            top: 90,
            background: '#fff',
            border: `1px solid ${colors.line}`,
            borderRadius: 20,
            overflow: 'hidden',
            boxShadow: '0 20px 50px rgba(20,20,43,.1)',
          }}
        >
          <div style={{ height: 180, background: course.grad, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div
              style={{
                width: 64,
                height: 64,
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
                  borderTop: '10px solid transparent',
                  borderBottom: '10px solid transparent',
                  borderRight: '16px solid #1E2A5E',
                  marginRight: -3,
                }}
              />
            </div>
          </div>
          <div style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: colors.accent }}>ضمن الاشتراك</span>
            </div>
            <div style={{ fontSize: 13, color: colors.muted2, marginBottom: 18 }}>وصول كامل لكل الدورات باشتراك واحد</div>
            <button
              onClick={() => navigate(`/buy/${slug}`)}
              style={{
                width: '100%',
                background: colors.accent,
                border: 'none',
                borderRadius: 12,
                color: '#fff',
                fontSize: 16,
                fontWeight: 800,
                padding: 15,
                cursor: 'pointer',
                marginBottom: 10,
              }}
            >
              {course.price > 0 ? 'اشترِ الدورة الآن' : 'التسجيل المجاني'}
            </button>
            <button
              style={{
                width: '100%',
                background: '#fff',
                border: '1.5px solid #ddd',
                borderRadius: 12,
                color: colors.ink,
                fontSize: 15,
                fontWeight: 700,
                padding: 13,
                cursor: 'pointer',
              }}
            >
              أضف إلى قائمتي
            </button>
            <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${colors.line2}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {includes.map((inc) => (
                <div key={inc} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: colors.ink2 }}>
                  <span style={{ color: colors.accent, fontWeight: 900 }}>✓</span> {inc}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
