import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { colors, layout } from '../theme/tokens.js';
import { rawCourses, curriculum } from '../data/mock.js';
import { webapi, mapCourse, auth, isAuthed } from '../lib/api.js';

// Video lesson watch page. Real course content + progress tracking.
// In Phase 5 the placeholder player is replaced by the VdoCipher DRM player:
// backend validates enrollment → issues a short-lived OTP → player consumes it.
export default function Learn() {
  const { courseId, lessonId } = useParams(); // courseId carries the course slug
  const navigate = useNavigate();
  const [apiCourse, setApiCourse] = useState(null);
  const [active, setActive] = useState(null);
  const [doneIds, setDoneIds] = useState({});

  useEffect(() => {
    webapi.course(courseId).then((r) => setApiCourse(r.course)).catch(() => {});
  }, [courseId]);

  const useApi = !!apiCourse;
  const course = useApi
    ? mapCourse(apiCourse)
    : rawCourses.find((c) => c.slug === courseId) || rawCourses[Number(courseId)] || rawCourses[0];

  // flat lesson list: real modules->lessons, else the mock curriculum
  const flat = [];
  if (useApi) {
    (apiCourse.modules || []).forEach((m) =>
      (m.lessons || []).forEach((ls) =>
        flat.push({ id: ls.id, key: String(ls.id), name: ls.title, mod: m.title,
          dur: ls.duration_minutes ? `${ls.duration_minutes} د` : '' })));
  } else {
    curriculum.forEach((mod, mi) => mod.lessons.forEach((ls, li) => flat.push({ ...ls, key: `${mi}-${li}`, mod: mod.title })));
  }
  const safeFlat = flat.length ? flat : [{ key: 'x', name: 'لا دروس بعد', dur: '', mod: '' }];
  const activeKey = active || safeFlat.find((l) => l.key === lessonId)?.key || safeFlat[0].key;
  const activeLesson = safeFlat.find((l) => l.key === activeKey) || safeFlat[0];

  async function completeAndNext() {
    if (useApi && activeLesson.id && isAuthed()) {
      try { await auth.progress({ lesson_id: activeLesson.id, completed: true }); setDoneIds((d) => ({ ...d, [activeLesson.id]: true })); } catch { /* ignore */ }
    }
    const i = safeFlat.findIndex((l) => l.key === activeKey);
    const next = safeFlat[i + 1];
    if (next) { setActive(next.key); navigate(`/learn/${courseId}/${next.key}`); }
  }

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
                onClick={completeAndNext}
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
                إتمام والتالي
              </button>
            </div>
          </div>
        </div>

        {/* Playlist */}
        <aside style={{ background: '#171730', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '18px 18px 12px', fontSize: 16, fontWeight: 900 }}>محتوى الدورة</div>
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {safeFlat.map((l, i) => {
              const isActive = l.key === activeKey;
              return (
                <div
                  key={l.key}
                  onClick={() => {
                    setActive(l.key);
                    navigate(`/learn/${courseId}/${l.key}`);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 18px',
                    cursor: 'pointer',
                    background: isActive ? 'rgba(18,40,90,.14)' : 'transparent',
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
                    {doneIds[l.id] ? '✓' : i + 1}
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
