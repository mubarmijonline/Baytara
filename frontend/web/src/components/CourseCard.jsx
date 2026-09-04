import { useNavigate } from 'react-router-dom';
import { colors, gradients } from '../theme/tokens.js';
import { useI18n } from '../lib/i18n.jsx';

// Course card used in carousels and grids. Matches the Baytara design card.
export default function CourseCard({ course, isNew = false, width = 288 }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const flexBasis = width ? `0 0 ${width}px` : undefined;
  // The card predates the API: it was written for mock rows where `instructor` was a
  // name and `ini` its initial. The API sends an object, and rendering that as a child
  // takes the whole page down with React error #31. Accept both shapes.
  const instructorName = typeof course.instructor === 'string'
    ? course.instructor
    : course.instructor?.name || '';
  const initial = course.ini || instructorName.trim().charAt(0);
  // Same story for the rest of the row: mock names first, then what the API sends.
  const categoryName = course.cat || course.category?.name || '';
  const lessons = course.lessons ?? course.lessons_count ?? 0;
  const hours = course.hours ?? Math.round((course.duration_minutes || 0) / 60);
  const learners = course.learners ?? course.enrolled_count ?? 0;
  const at = course.access_type;
  const isPaid = course.is_paid ?? course.price > 0;
  const accessBadge = at === 'baytarian' ? { label: '🔒 ' + t('access.baytarian'), bg: colors.accent }
    : at === 'vet_free' ? { label: t('access.vet_free'), bg: '#2b6cb0' }
    : at === 'free' ? { label: t('access.free'), bg: '#1a7f4b' } : null;
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
      {/* A cover when there is one, the brand gradient when there is not — an unset
          `grad` left a white block with white text on it. */}
      <div style={{ height: 158, position: 'relative', overflow: 'hidden',
        background: course.image ? `center/cover url(${course.image})` : (course.grad || gradients.darkPanel) }}>
        {/* The instructor name sits on this image, so it needs something to sit on. */}
        <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(20,30,66,0) 40%, rgba(20,30,66,.62) 100%)' }} />
        {categoryName && <span
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
          {categoryName}
        </span>}
        {accessBadge ? (
          <span
            style={{
              position: 'absolute', top: 12, left: 12, background: accessBadge.bg, color: '#fff',
              fontSize: 11, fontWeight: 800, padding: '5px 10px', borderRadius: 100,
            }}
          >
            {accessBadge.label}
          </span>
        ) : isNew && (
          <span
            style={{
              position: 'absolute', top: 12, left: 12, background: colors.accent, color: '#fff',
              fontSize: 11, fontWeight: 800, padding: '5px 10px', borderRadius: 100,
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
            {initial}
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,.4)' }}>
            {instructorName}
          </span>
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.4, margin: '0 0 12px', minHeight: 45 }}>
          {course.title}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.muted, marginBottom: 12 }}>
          {course.rating && <span style={{ color: colors.star, fontWeight: 800 }}>★ {course.rating}</span>}
          {lessons > 0 && <>{course.rating && <span>·</span>}<span>{lessons} {t('course.lessonsUnit')}</span></>}
          {hours > 0 && <><span>·</span><span>{hours} {t('course.hoursUnit')}</span></>}
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
          <span style={{ fontSize: 13, color: colors.muted2 }}>
            {learners > 0 ? `${learners} ${t('home.learners')}` : ''}
          </span>
          <span style={{ fontSize: 14, fontWeight: 800, color: colors.accent }}>
            {isPaid ? `${course.price} ${course.currency || t('common.egp')}` : t('access.free')}
          </span>
        </div>
      </div>
    </div>
  );
}
