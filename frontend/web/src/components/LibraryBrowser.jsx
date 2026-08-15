import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { colors } from '../theme/tokens.js';
import { webapi } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { categoryImages } from '../lib/category-images.js';

const KINDS = ['all', 'courses', 'videos'];
const CATEGORY_SLUGS = Object.keys(categoryImages);

function Row({ to, title, meta, badge }) {
  return (
    <Link to={to} style={{ display: 'flex', gap: 10, border: `1px solid ${colors.line2}`, borderRadius: 11, padding: 9, color: 'inherit' }}>
      <span style={{ width: 66, height: 44, borderRadius: 8, background: colors.surfaceAlt, flex: 'none', display: 'grid', placeItems: 'center', color: colors.utilityBar, fontSize: 12 }}>
        <span aria-hidden="true">▶</span>
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: colors.ink, lineHeight: 1.45 }}>{title}</span>
        <span style={{ display: 'flex', gap: 5, marginTop: 6 }}>
          {meta && <span style={{ background: colors.surfaceAlt, borderRadius: 6, padding: '3px 7px', fontSize: 10.5, color: colors.muted, fontWeight: 600 }}>{meta}</span>}
          {badge && <span style={{ background: colors.accentSoft, color: colors.accent, borderRadius: 6, padding: '3px 7px', fontSize: 10.5, fontWeight: 700 }}>{badge}</span>}
        </span>
      </span>
    </Link>
  );
}

// The player sidebar's «كل المحتوى» tab: search and filter the catalogue without
// leaving the lesson. Backed by the existing listing endpoints, which already take
// `q` and `category`.
export default function LibraryBrowser({ defaultCategory = '' }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [category, setCategory] = useState(defaultCategory);
  const [results, setResults] = useState({ courses: [], videos: [] });

  useEffect(() => {
    let alive = true;
    // Debounced so a typed query is one request, not one per keystroke.
    const timer = setTimeout(() => {
      const params = { per_page: 5, ...(query ? { q: query } : {}), ...(category ? { category } : {}) };
      const wantCourses = kind !== 'videos';
      const wantVideos = kind !== 'courses';
      Promise.all([
        wantCourses ? webapi.courses(params).catch(() => null) : Promise.resolve(null),
        wantVideos ? webapi.videos(params).catch(() => null) : Promise.resolve(null),
      ]).then(([courseResult, videoResult]) => {
        if (!alive) return;
        setResults({ courses: courseResult?.courses || [], videos: videoResult?.videos || [] });
      });
    }, query ? 250 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, kind, category]);

  const chip = (active) => ({
    background: active ? colors.accentSoft : colors.surfaceAlt,
    color: active ? colors.accent : colors.muted,
    borderRadius: 7, padding: '6px 10px', fontSize: 11.5, fontWeight: 600,
    border: 'none', cursor: 'pointer',
  });

  const empty = !results.courses.length && !results.videos.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('learn.searchPlaceholder')}
        aria-label={t('learn.searchPlaceholder')}
        style={{ background: colors.surfaceAlt, border: `1px solid ${colors.line}`, borderRadius: 10, padding: '0 12px', height: 40, fontSize: 13, color: colors.ink }}
      />

      <div style={{ display: 'flex', gap: 6 }}>
        {KINDS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
            style={{
              flex: 1, textAlign: 'center', borderRadius: 8, padding: '8px 0', border: 'none',
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              background: kind === value ? colors.utilityBar : colors.surfaceAlt,
              color: kind === value ? '#fff' : colors.ink,
            }}
          >
            {t(`learn.filter${value[0].toUpperCase()}${value.slice(1)}`)}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {CATEGORY_SLUGS.map((slug) => (
          <button key={slug} type="button" aria-pressed={category === slug}
            onClick={() => setCategory((current) => (current === slug ? '' : slug))}
            style={chip(category === slug)}>
            {t(`category.${slug}`)}
          </button>
        ))}
      </div>

      {empty && <div style={{ fontSize: 12.5, color: colors.muted2 }}>{t('learn.noResults')}</div>}

      {results.courses.map((course) => (
        <Row key={`c-${course.id}`} to={`/courses/${course.slug}`} title={course.title}
          meta={`${course.lessons_count} ${t('course.lessonsUnit')}`}
          badge={course.access_type === 'free' ? t('common.free') : null} />
      ))}
      {results.videos.map((video) => (
        <Row key={`v-${video.id}`} to={`/videos/${video.id}`} title={video.title}
          meta={video.duration_minutes ? `${video.duration_minutes} ${t('common.minutesShort')}` : ''}
          badge={video.access_type === 'free' ? t('common.free') : null} />
      ))}
    </div>
  );
}
