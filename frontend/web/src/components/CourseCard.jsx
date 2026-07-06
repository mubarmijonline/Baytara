import { useNavigate } from 'react-router-dom';
import { colors } from '../theme/tokens.js';

// Course card used in carousels and grids. Matches the Baytara design card.
export default function CourseCard({ course, isNew = false, width = 288 }) {
  const navigate = useNavigate();
  const flexBasis = width ? `0 0 ${width}px` : undefined;
  return (
    <div
      className="hover-lift"
      onClick={() => navigate(`/courses/${course.slug}`)}
      style={{
        flex: flexBasis,
        border: `1px solid ${colors.line}`,
        borderRadius: 16,
        overflow: 'hidden',
        background: '#fff',
        cursor: 'pointer',
      }}
    >
      <div style={{ height: 158, background: course.grad, position: 'relative' }}>
        <span
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'rgba(0,0,0,.55)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            padding: '5px 10px',
            borderRadius: 100,
          }}
        >
          {course.cat}
        </span>
        {isNew && (
          <span
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              background: colors.accent,
              color: '#fff',
              fontSize: 11,
              fontWeight: 800,
              padding: '5px 10px',
              borderRadius: 100,
            }}
          >
            جديد
          </span>
        )}
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            right: 14,
            left: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            color: '#fff',
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'rgba(255,255,255,.25)',
              border: '1.5px solid rgba(255,255,255,.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            {course.ini}
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,.4)' }}>
            {course.instructor}
          </span>
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.4, margin: '0 0 12px', minHeight: 45 }}>
          {course.title}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.muted, marginBottom: 12 }}>
          <span style={{ color: colors.star, fontWeight: 800 }}>★ {course.rating}</span>
          <span>·</span>
          <span>{course.lessons} درس</span>
          <span>·</span>
          <span>{course.hours} ساعة</span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 12,
            borderTop: `1px solid ${colors.line2}`,
          }}
        >
          <span style={{ fontSize: 13, color: colors.muted2 }}>{course.learners} متعلّم</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: colors.accent }}>ضمن الاشتراك</span>
        </div>
      </div>
    </div>
  );
}
