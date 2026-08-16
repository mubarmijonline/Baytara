import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, Star, X } from 'lucide-react';
import VideoCard from '../components/VideoCard.jsx';
import { Container, SectionHeading } from '../components/Primitives.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useSiteSettings } from '../lib/site-settings.jsx';
import { compact, mapCourse, useFetch, webapi } from '../lib/api.js';
import { colors, gradients, thumbGradients } from '../theme/tokens.js';

const PER_PAGE = 12;
const VIDEO_PREVIEW = 3;

const LEVELS = ['beginner', 'intermediate', 'advanced', 'breeders'];
const ACCESS_TYPES = ['free', 'vet_free', 'baytarian', 'general'];
const DURATIONS = ['short', 'medium', 'long'];
const RATINGS = [4.5, 4, 3.5];
const SORTS = ['popular', 'newest', 'rating', 'price_asc', 'price_desc'];

// Every access type gets the colour the design gives it; `general` is an unbadged
// paid course, so it stays plain.
const ACCESS_BADGE = { free: '#1a7f4b', vet_free: '#2b6cb0', baytarian: colors.accent };

export default function Courses() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const settings = useSiteSettings();
  const [params, setParams] = useSearchParams();

  const [category, setCategory] = useState(params.get('category') || '');
  const [level, setLevel] = useState('');
  const [access, setAccess] = useState('');
  const [duration, setDuration] = useState('');
  const [minRating, setMinRating] = useState('');
  const [sort, setSort] = useState('popular');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);

  const categories = useFetch(() => webapi.categories(), []);
  const catalog = useFetch(
    () => webapi.courses({
      category, level, access_type: access, duration,
      min_rating: minRating, sort, q: search, page, per_page: PER_PAGE,
    }),
    [category, level, access, duration, minRating, sort, search, page],
  );
  // Videos matching the same search, shown under the course results.
  const videos = useFetch(
    () => webapi.videos({ category, q: search, per_page: VIDEO_PREVIEW }),
    [category, search],
  );
  // Catalogue-wide totals for the tab strip and the hero line. The main query's total
  // is the filtered count, which is a different number and belongs above the results.
  const allCourses = useFetch(() => webapi.courses({ per_page: 1 }), []);
  const allVideos = useFetch(() => webapi.videos({ per_page: 1 }), []);
  const allBundles = useFetch(() => webapi.bundles(), []);

  const courses = (catalog.data?.courses || []).map(mapCourse);
  const total = catalog.data?.total ?? 0;
  const pages = catalog.data?.pages || 1;
  const facets = catalog.data?.facets || { level: {}, access_type: {} };
  const catList = categories.data?.categories || [];
  const activeCategory = catList.find((c) => c.slug === category);
  const filtered = !!(category || level || access || duration || minRating || search);
  const activeCount = [category, level, access, duration, minRating].filter(Boolean).length;

  function reset(setter) {
    return (value) => { setter(value); setPage(1); };
  }

  function selectCategory(slug) {
    setCategory(slug);
    setPage(1);
    const next = new URLSearchParams(params);
    if (slug) next.set('category', slug); else next.delete('category');
    setParams(next, { replace: true });
  }

  function clearAll() {
    setCategory('');
    setLevel('');
    setAccess('');
    setDuration('');
    setMinRating('');
    setQuery('');
    setSearch('');
    setPage(1);
    const next = new URLSearchParams(params);
    next.delete('category');
    setParams(next, { replace: true });
  }

  function submit(event) {
    event.preventDefault();
    setPage(1);
    setSearch(query.trim());
  }

  // One toggle for every single-choice filter group: clicking the active value clears it.
  const toggle = (value, current, setter) => reset(setter)(current === value ? '' : value);

  const filterPanel = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink }}>{t('catalog.filters')}</div>
        {filtered && (
          <button type="button" onClick={clearAll} style={linkButton}>{t('catalog.clearAll')}</button>
        )}
      </div>

      <FilterGroup title={t('catalog.level')} first>
        {LEVELS.map((value) => (
          <Check key={value} checked={level === value} count={facets.level?.[value]}
            label={t(`level.${value}`)} onClick={() => toggle(value, level, setLevel)} />
        ))}
      </FilterGroup>

      <FilterGroup title={t('catalog.access')}>
        {ACCESS_TYPES.map((value) => (
          <Check key={value} checked={access === value} count={facets.access_type?.[value]}
            label={t(`access.${value}`)} onClick={() => toggle(value, access, setAccess)} />
        ))}
      </FilterGroup>

      <FilterGroup title={t('catalog.duration')}>
        {DURATIONS.map((value) => (
          <Check key={value} checked={duration === value} label={t(`catalog.duration.${value}`)}
            onClick={() => toggle(value, duration, setDuration)} />
        ))}
      </FilterGroup>

      <FilterGroup title={t('catalog.rating')}>
        {RATINGS.map((value) => (
          <Check key={value} round checked={minRating === String(value)}
            label={<><Star size={13} fill={colors.star} color={colors.star} aria-hidden="true" /> {t('catalog.ratingMin', { n: value })}</>}
            onClick={() => toggle(String(value), minRating, setMinRating)} />
        ))}
      </FilterGroup>
    </>
  );

  return (
    <main style={{ background: colors.surface }}>
      {/* Dark search hero */}
      <div style={{ background: gradients.darkPanel, color: '#fff', padding: '44px 0 38px' }}>
        <Container style={{ maxWidth: 900, textAlign: 'center' }}>
          <h1 style={{ margin: '0 0 10px', fontSize: 32, fontWeight: 700, letterSpacing: '-.7px' }}>
            {settings.courses?.title}
          </h1>
          <p style={{ margin: '0 0 24px', fontSize: 15, color: '#b9bfd6' }}>
            {allCourses.data?.total != null && catList.length > 0 && (
              <>{t('catalog.stats', { n: allCourses.data.total, c: catList.length })} · </>
            )}
            {settings.courses?.subtitle}
          </p>
          <form onSubmit={submit} className="catalog-search"
            style={{ display: 'flex', gap: 10, background: '#fff', borderRadius: 14, padding: 8, boxShadow: '0 18px 44px rgba(0,0,0,.28)' }}>
            <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 11, padding: '0 16px', minWidth: 0 }}>
              <Search size={16} aria-hidden="true" style={{ color: colors.muted2, flex: 'none' }} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={t('catalog.search')}
                placeholder={t('catalog.searchPlaceholder')}
                style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontSize: 15, color: colors.ink }}
              />
            </span>
            <button type="submit" style={{ background: colors.accent, color: '#fff', fontSize: 15, fontWeight: 700, padding: '14px 30px', borderRadius: 10, border: 'none', cursor: 'pointer', flex: 'none' }}>
              {t('catalog.search')}
            </button>
          </form>
        </Container>
      </div>

      {/* Catalogue tabs */}
      <div style={{ borderBottom: `1px solid ${colors.line}` }}>
        <Container style={{ display: 'flex', gap: 26, fontSize: 15, fontWeight: 700 }}>
          <span style={{ padding: '16px 0', color: colors.utilityBar, borderBottom: `3px solid ${colors.accent}` }}>
            {t('catalog.tabCourses')} <Count value={allCourses.data?.total} lang={lang} />
          </span>
          <Link to="/videos" style={{ padding: '16px 0', color: colors.muted2, textDecoration: 'none' }}>
            {t('catalog.tabVideos')} <Count value={allVideos.data?.total} lang={lang} />
          </Link>
          <Link to="/bundles" style={{ padding: '16px 0', color: colors.muted2, textDecoration: 'none' }}>
            {t('catalog.tabBundles')} <Count value={allBundles.data?.bundles?.length} lang={lang} />
          </Link>
        </Container>
      </div>

      {/* Category rail */}
      <div style={{ borderBottom: `1px solid ${colors.line}` }}>
        <Container className="videos-chip-row" aria-label={t('catalog.categories')}
          style={{ padding: '14px 24px', display: 'flex', gap: 10, overflowX: 'auto' }}>
          <Pill active={!category} label={t('catalog.allCategories')} onClick={() => selectCategory('')} />
          {catList.map((item) => (
            <Pill key={item.id} active={category === item.slug} label={item.name} onClick={() => selectCategory(item.slug)} />
          ))}
        </Container>
      </div>

      <Container className="grid-collapse-2"
        style={{ padding: '26px 24px 70px', display: 'grid', gridTemplateColumns: '244px 1fr', gap: 30, alignItems: 'start' }}>
        <aside className="hide-md" style={{ border: `1px solid ${colors.line}`, borderRadius: 14, padding: 20, position: 'sticky', top: 20 }}>
          {filterPanel}
        </aside>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={pillStat}>{t('catalog.resultCount', { n: total })}</span>
              <span style={pillStat}>
                {t('catalog.resultsFor', { name: activeCategory ? activeCategory.name : t('catalog.allCategories') })}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
              <button type="button" className="show-md" onClick={() => setSheetOpen((open) => !open)}
                style={{ ...outlineButton, alignItems: 'center', gap: 7, borderColor: activeCount ? colors.accent : colors.line, color: activeCount ? colors.accent : colors.ink }}>
                <SlidersHorizontal size={14} aria-hidden="true" />
                {sheetOpen ? t('catalog.hideFilters') : t('catalog.showFilters')}{activeCount ? ` · ${activeCount}` : ''}
              </button>
              <select value={sort} onChange={(event) => reset(setSort)(event.target.value)}
                aria-label={t('catalog.sort', { name: t(`catalog.sort.${sort}`) })} style={outlineButton}>
                {SORTS.map((value) => (
                  <option key={value} value={value}>{t(`catalog.sort.${value}`)}</option>
                ))}
              </select>
            </div>
          </div>

          {sheetOpen && (
            <div className="show-md" style={{ flexDirection: 'column', border: `1px solid ${colors.line}`, borderRadius: 14, padding: 20, marginBottom: 18 }}>
              {filterPanel}
            </div>
          )}

          {catalog.loading ? (
            <div style={{ color: colors.muted }}>{t('common.loading')}</div>
          ) : catalog.error ? (
            <div style={{ color: '#9b2626' }}>{t('catalog.loadError')}</div>
          ) : !courses.length ? (
            <div style={{ color: colors.muted }}>{t('catalog.empty')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {courses.map((course, index) => (
                <CourseRow key={course.id} course={course} index={index} t={t} lang={lang}
                  onOpen={() => navigate(`/courses/${course.slug}`)} />
              ))}
            </div>
          )}

          {videos.data?.videos?.length > 0 && (
            <div style={{ marginTop: 36, paddingTop: 28, borderTop: `1px solid ${colors.line}` }}>
              <SectionHeading
                title={t('catalog.videosTitle')}
                subtitle={t('catalog.videosSubtitle')}
                action={<Link to="/videos" style={{ fontSize: 13.5, fontWeight: 700, color: colors.accent, textDecoration: 'none' }}>{t('video.allVideos')} ←</Link>}
              />
              <div className="video-grid">
                {videos.data.videos.map((video) => <VideoCard key={video.id} video={video} />)}
              </div>
            </div>
          )}

          {pages > 1 && (
            <nav aria-label={t('catalog.pagination')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 32 }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={pageStyle(false, page <= 1)}>
                {t('video.previous')}
              </button>
              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1)
                .map((n, i, list) => (
                  <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {i > 0 && n - list[i - 1] > 1 && <span style={{ color: colors.muted2 }}>…</span>}
                    <button type="button" onClick={() => setPage(n)} aria-current={n === page ? 'page' : undefined} style={pageStyle(n === page)}>
                      {n}
                    </button>
                  </span>
                ))}
              <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} style={pageStyle(false, page >= pages)}>
                {t('video.next')}
              </button>
            </nav>
          )}
        </div>
      </Container>

      {/* Pay-per-course bar */}
      <div style={{ background: colors.utilityBar, color: '#fff' }}>
        <Container className="catalog-bar" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{settings.courses?.bar_title}</span>
            <span style={{ fontSize: 13.5, color: '#a7aec9' }}>{settings.courses?.bar_subtitle}</span>
          </div>
          <Link to="/bundles" style={{ background: colors.gold, color: colors.utilityBar, fontSize: 14.5, fontWeight: 700, padding: '12px 24px', borderRadius: 10, textDecoration: 'none' }}>
            {settings.courses?.bar_cta}
          </Link>
        </Container>
      </div>
    </main>
  );
}

function CourseRow({ course, index, t, lang, onOpen }) {
  const badge = ACCESS_BADGE[course.access_type];
  const chips = [
    course.rating != null && { key: 'rating', gold: true, label: `★ ${course.rating}` },
    course.lessons > 0 && { key: 'lessons', label: t('catalog.lessonsCount', { n: course.lessons }) },
    course.hours > 0 && { key: 'hours', label: t('catalog.hoursCount', { n: course.hours }) },
    Number(course.learners) > 0 && { key: 'learners', label: t('catalog.learnersCount', { n: compact(Number(course.learners), lang) }) },
  ].filter(Boolean);

  return (
    <article className="catalog-row" style={{ display: 'flex', gap: 16, border: `1px solid ${colors.line}`, borderRadius: 14, padding: 14, background: '#fff' }}>
      <button type="button" onClick={onOpen} aria-label={course.title}
        style={{ width: 196, height: 118, flex: 'none', border: 0, padding: 0, cursor: 'pointer', borderRadius: 10, overflow: 'hidden', background: course.image ? colors.surfaceAlt : thumbGradients[index % thumbGradients.length] }}>
        {course.image && <img src={course.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: colors.ink, lineHeight: 1.4 }}>
          <Link to={`/courses/${course.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>{course.title}</Link>
        </h3>
        <div style={{ fontSize: 13.5, color: colors.muted, marginBottom: 9 }}>
          {course.instructor}{course.instructorHeadline ? ` · ${course.instructorHeadline}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 11, flexWrap: 'wrap' }}>
          {chips.map((chip) => (
            <span key={chip.key} style={{
              background: chip.gold ? '#fdf5e0' : colors.surfaceAlt,
              color: chip.gold ? '#8a6d1f' : colors.muted,
              fontSize: 12.5, fontWeight: chip.gold ? 700 : 600, padding: '6px 11px', borderRadius: 8,
            }}>{chip.label}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ background: badge || colors.surfaceAlt, color: badge ? '#fff' : colors.muted, ...tagStyle }}>
            {t(`access.${course.access_type}`)}
          </span>
          <span style={{ background: colors.surfaceAlt, color: colors.muted, ...tagStyle }}>{t(`level.${course.level}`)}</span>
          {course.cat && <span style={{ background: colors.surfaceAlt, color: colors.muted, ...tagStyle }}>{course.cat}</span>}
        </div>
      </div>

      <div className="catalog-row-side" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, flex: 'none' }}>
        <span style={{ border: `1px solid ${colors.line}`, borderRadius: 9, padding: '7px 11px', fontSize: 12.5, color: colors.muted, whiteSpace: 'nowrap' }}>
          {course.is_paid
            ? <b style={{ color: colors.utilityBar }}>{course.price} {course.currency || t('common.egp')}</b>
            : t('access.free')}
        </span>
        <Link to={`/courses/${course.slug}`}
          style={{ background: colors.accent, color: '#fff', fontSize: 14, fontWeight: 700, padding: '11px 20px', borderRadius: 10, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          {t('catalog.start')}
        </Link>
      </div>
    </article>
  );
}

function FilterGroup({ title, first, children }) {
  return (
    <div style={{ marginBottom: 20, paddingTop: first ? 0 : 16, borderTop: first ? 'none' : `1px solid ${colors.line2}` }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink, marginBottom: 11 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  );
}

function Check({ checked, label, count, round, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={checked}
      style={{ display: 'flex', gap: 9, alignItems: 'center', background: 'none', border: 'none', padding: 0,
        font: 'inherit', fontSize: 13.5, color: colors.muted, cursor: 'pointer', textAlign: 'start' }}>
      <span aria-hidden="true" style={{
        width: 16, height: 16, flex: 'none', borderRadius: round ? '50%' : 4,
        display: 'grid', placeItems: 'center', fontSize: 10, color: '#fff',
        background: checked ? colors.accent : 'transparent',
        border: checked ? 'none' : '1.5px solid #d6d9e4',
      }}>{checked ? '✓' : ''}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{label}</span>
      {count != null && <span style={{ marginInlineStart: 'auto', color: '#9aa1b8' }}>{count}</span>}
    </button>
  );
}

function Pill({ active, label, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      style={{ flex: 'none', border: 'none', cursor: 'pointer', borderRadius: 100, padding: '9px 16px',
        fontSize: 13.5, fontWeight: 600,
        background: active ? colors.utilityBar : colors.surfaceAlt, color: active ? '#fff' : colors.ink }}>
      {label}
    </button>
  );
}

// A count the API has not answered yet renders as nothing rather than as a zero.
function Count({ value, lang }) {
  if (value == null) return null;
  return <span style={{ fontWeight: 500, color: colors.muted2 }}>{compact(value, lang)}</span>;
}

const tagStyle = { fontSize: 11.5, fontWeight: 700, padding: '5px 11px', borderRadius: 8 };

const pillStat = {
  background: colors.surfaceAlt, borderRadius: 8, padding: '8px 13px',
  fontSize: 13, color: colors.muted, fontWeight: 600,
};

const outlineButton = {
  display: 'inline-flex', border: `1px solid ${colors.line}`, borderRadius: 9, padding: '9px 14px',
  fontSize: 13.5, color: colors.ink, fontWeight: 600, background: colors.surface, cursor: 'pointer',
};

const linkButton = {
  background: 'none', border: 'none', padding: 0, fontSize: 12.5,
  color: colors.accent, fontWeight: 600, cursor: 'pointer',
};

function pageStyle(active, disabled = false) {
  return {
    border: active ? 'none' : `1px solid ${colors.line}`,
    background: active ? colors.accent : colors.surface,
    color: active ? '#fff' : disabled ? '#a7aec9' : colors.ink,
    borderRadius: 9, padding: '9px 15px', fontSize: 13.5, fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
  };
}
