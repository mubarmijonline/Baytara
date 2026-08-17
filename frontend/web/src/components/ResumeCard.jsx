import { Link } from 'react-router-dom';
import { colors } from '../theme/tokens.js';
import { useI18n } from '../lib/i18n.jsx';
import { useSiteSettings } from '../lib/site-settings.jsx';

const panel = {
  background: 'rgba(255,255,255,.06)',
  border: '1px solid rgba(255,255,255,.13)',
  borderRadius: 18,
  padding: 22,
};

const thumb = {
  width: 120, height: 74, borderRadius: 11, flex: 'none', overflow: 'hidden',
  background: 'repeating-linear-gradient(135deg,#1d2b5e 0 9px,#24357A 9px 18px)',
};

function Tile({ value, label }) {
  return (
    <div style={{ background: 'rgba(255,255,255,.06)', borderRadius: 11, padding: '13px 8px' }}>
      <div style={{ fontSize: 19, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: '#a7aec9' }}>{label}</div>
    </div>
  );
}

// The hero's right-hand card. With a resume point it shows the real lesson the learner
// is on; without one it falls back to the CMS-managed featured course, never to zeros.
export default function ResumeCard({ summary }) {
  const { t } = useI18n();
  const settings = useSiteSettings();
  const resume = summary?.resume;

  // Without a resume point there is nothing personal to show, so the hero carries the
  // brand photograph rather than a featured-course card the visitor has no relation to.
  if (!resume) {
    return (
      <div className="home-hero-media" style={{ borderRadius: 18, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.32)' }}>
        <img
          src={settings.hero?.image || '/images/hero.webp'}
          alt=""
          style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover', aspectRatio: '16 / 10' }}
        />
      </div>
    );
  }

  return (
    <div style={panel} className="home-hero-media">
      <div style={{ fontSize: 13, color: colors.gold, fontWeight: 700, marginBottom: 14 }}>
        {t('home.resumeLabel')}
      </div>
      <Link
        to={`/learn/${resume.course.slug}/${resume.lesson.id}`}
        style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 18, color: '#fff' }}
      >
        <div style={thumb}>
          {resume.lesson.poster && (
            <img src={resume.lesson.poster} alt={resume.lesson.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          )}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.5 }}>{resume.lesson.title}</div>
          <div style={{ fontSize: 12.5, color: '#a7aec9', marginTop: 5 }}>
            {t('home.lessonOf', { n: resume.lesson_index, total: resume.total_lessons })}
            {resume.remaining_lessons > 0 && ` · ${t('home.lessonsLeft', { n: resume.remaining_lessons })}`}
          </div>
        </div>
      </Link>

      <div style={{ height: 6, borderRadius: 100, background: 'rgba(255,255,255,.14)', overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ width: `${resume.percent}%`, height: '100%', background: colors.gold }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, textAlign: 'center' }}>
        <Tile value={summary.courses_enrolled} label={t('home.enrolledCourses')} />
        <Tile value={summary.watched_hours} label={t('home.hoursWatched')} />
        <Tile value={summary.streak_days} label={t('home.streakDays')} />
      </div>
    </div>
  );
}
