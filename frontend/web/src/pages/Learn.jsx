import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { colors, layout } from '../theme/tokens.js';
import { rawCourses, curriculum } from '../data/mock.js';

// Video lesson watch page (mock).
// In Phase 5 the placeholder player is replaced by the VdoCipher DRM player:
// backend validates enrollment → issues a short-lived OTP → player consumes it.
export default function Learn() {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();
  const course = rawCourses[Number(courseId)] || rawCourses[0];

  // flat list of lessons with module/lesson index keys "mi-li"
  const flat = [];
  curriculum.forEach((mod, mi) => mod.lessons.forEach((ls, li) => flat.push({ ...ls, key: `${mi}-${li}`, mod: mod.title })));
  const [active, setActive] = useState(flat.find((l) => l.key === lessonId)?.key || flat[0].key);
  const activeLesson = flat.find((l) => l.key === active) || flat[0];

  return (
    <div style={{ background: '#0a1730', minHeight: '100vh', color: '#fff' }}>
      <div
        style={{
          maxWidth: layout.maxWidth,
          margin: '0 auto',
          padding: '24px',
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          gap: 24,
          alignItems: 'start',
        }}
        className="grid-collapse-2"
      >
        {/* Player + info */}
        <div>
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16 / 9',
              borderRadius: 16,
              background: course.grad,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: '50%',
                background: 'rgba(255,255,255,.92)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 12px 34px rgba(0,0,0,.35)',
              }}
            >
              <span
                style={{
                  width: 0,
                  height: 0,
                  borderTop: '14px solid transparent',
                  borderBottom: '14px solid transparent',
                  borderRight: '22px solid #14142b',
                  marginRight: -4,
                }}
              />
            </div>
            {/* Dynamic-watermark placeholder (VdoCipher provides the real one in Phase 5) */}
            <span style={{ position: 'absolute', top: 14, left: 16, fontSize: 12, color: 'rgba(255,255,255,.6)' }}>
              محمود · baytara — معاينة محمية
            </span>
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, color: '#b6b6cc', marginBottom: 6 }}>
              {course.cat} · {course.instructor}
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 6px' }}>{activeLesson.name}</h1>
            <div style={{ fontSize: 14, color: '#9a9aac' }}>
              {activeLesson.mod} · {activeLesson.dur}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <button
                onClick={() => navigate(`/courses/${course.slug}`)}
                style={{
                  background: 'rgba(255,255,255,.1)',
                  border: '1px solid rgba(255,255,255,.2)',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '11px 20px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ← صفحة الدورة
              </button>
              <button
                style={{
                  background: colors.accent,
                  border: 'none',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '11px 20px',
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                الدرس التالي
              </button>
            </div>
          </div>
        </div>

        {/* Playlist */}
        <aside style={{ background: '#171730', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '18px 18px 12px', fontSize: 16, fontWeight: 900 }}>محتوى الدورة</div>
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {flat.map((l, i) => {
              const isActive = l.key === active;
              return (
                <div
                  key={l.key}
                  onClick={() => {
                    setActive(l.key);
                    navigate(`/learn/${course.id}/${l.key}`);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 18px',
                    cursor: 'pointer',
                    background: isActive ? 'rgba(225,27,34,.14)' : 'transparent',
                    borderRight: isActive ? `3px solid ${colors.accent}` : '3px solid transparent',
                  }}
                >
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: isActive ? colors.accent : 'rgba(255,255,255,.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 800,
                      flex: 'none',
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ flex: 1, fontSize: 14, color: isActive ? '#fff' : '#c9c9dc' }}>{l.name}</span>
                  <span style={{ fontSize: 12, color: '#9a9aac' }}>{l.dur}</span>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
