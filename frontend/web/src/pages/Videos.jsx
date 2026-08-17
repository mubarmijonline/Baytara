import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import VideoCard from '../components/VideoCard.jsx';
import { Container } from '../components/Primitives.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useFetch, webapi } from '../lib/api.js';
import { colors } from '../theme/tokens.js';
import { categoryImage } from '../lib/category-images.js';

const PER_PAGE = 24;

// Only what the API actually filters on. There is no view counter anywhere, so the
// design's "4.1k مشاهدة" chip has no honest source and is not rendered.
const ACCESS_OPTIONS = ['', 'free', 'vet_free', 'baytarian', 'general'];
const DURATION_OPTIONS = ['', 'short', 'medium', 'long'];
const SORT_OPTIONS = ['newest', 'oldest', 'longest', 'shortest'];

const selectStyle = {
  border: `1px solid #dfe2ec`, borderRadius: 10, padding: '8px 13px',
  fontSize: 13, fontWeight: 600, color: colors.ink, background: colors.surface,
};

function Chip({ active, image, label, count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, flex: 'none', cursor: 'pointer',
        background: active ? colors.utilityBar : colors.surfaceAlt,
        color: active ? '#fff' : colors.ink,
        border: 'none', borderRadius: 100,
        padding: image ? '6px 12px 6px 6px' : '8px 14px',
        fontSize: 13.5, fontWeight: 600,
      }}
    >
      {image && (
        <img src={image} alt="" aria-hidden="true"
          style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />
      )}
      {label}
      {count != null && (
        <span style={{ fontWeight: 500, opacity: active ? 0.75 : 1, color: active ? '#fff' : '#8189a6' }}>{count}</span>
      )}
    </button>
  );
}

export default function Videos() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();

  const [category, setCategory] = useState(params.get('category') || '');
  const [access, setAccess] = useState(params.get('access_type') || '');
  const [duration, setDuration] = useState('');
  const [sort, setSort] = useState('newest');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const categories = useFetch(() => webapi.categories(), []);
  const catalog = useFetch(
    () => webapi.videos({
      category, access_type: access, duration,
      sort: sort === 'newest' ? '' : sort,
      q: search, page, per_page: PER_PAGE,
    }),
    [category, access, duration, sort, search, page],
  );
  const items = catalog.data?.videos || [];
  const pages = catalog.data?.pages || 1;
  const total = catalog.data?.total ?? 0;
  const filtered = !!(category || access || duration || search);

  function submit(event) {
    event.preventDefault();
    setPage(1);
    setSearch(query.trim());
  }

  function selectCategory(slug) {
    setCategory(slug);
    setPage(1);
    const next = new URLSearchParams(params);
    if (slug) next.set('category', slug); else next.delete('category');
    setParams(next, { replace: true });
  }

  function clearFilters() {
    setCategory('');
    setAccess('');
    setDuration('');
    setQuery('');
    setSearch('');
    setPage(1);
    const next = new URLSearchParams(params);
    next.delete('category');
    setParams(next, { replace: true });
  }

  const reset = (setter) => (event) => { setter(event.target.value); setPage(1); };

  return (
    <main className="videos-page" style={{ background: colors.surface, minHeight: '70vh' }}>
      {/* slim head: title and search, not a wall of image cards */}
      <div style={{ borderBottom: `1px solid ${colors.line}` }}>
        <Container className="videos-page-header" style={{ padding: '24px 24px 20px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 28, flexWrap: 'wrap' }}>
          <div>
            <h1 className="videos-page-title" style={{ margin: '0 0 6px', fontSize: 27, fontWeight: 700, color: colors.utilityBar, letterSpacing: '-.5px' }}>
              {t('video.libraryTitle')}
            </h1>
            <p className="videos-page-copy" style={{ margin: 0, fontSize: 14.5, color: colors.muted }}>
              {t('video.librarySubtitle')}
            </p>
          </div>
          <form className="videos-search-form" onSubmit={submit} style={{ display: 'flex', gap: 8, width: 420, maxWidth: '100%' }}>
            <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: '0 14px', border: '1px solid #dfe2ec', borderRadius: 11, background: '#fafbfd' }}>
              <Search size={16} aria-hidden="true" style={{ color: '#8189a6', flex: 'none' }} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={t('video.searchPlaceholder')}
                placeholder={t('video.searchPlaceholder')}
                style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 14, color: colors.ink }}
              />
            </span>
            <button type="submit" style={{ background: colors.accent, color: '#fff', fontSize: 14.5, fontWeight: 700, padding: '0 22px', height: 46, borderRadius: 11, border: 'none', cursor: 'pointer' }}>
              {t('video.search')}
            </button>
          </form>
        </Container>
      </div>

      {/* compact sticky filter bar */}
      <div style={{ background: colors.surface, borderBottom: `1px solid ${colors.line}`, position: 'sticky', top: 0, zIndex: 3 }}>
        <Container className="videos-filter-bar" style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="videos-chip-row" aria-label={t('video.categories')}
            style={{ display: 'flex', gap: 7, alignItems: 'center', flex: 1, overflowX: 'auto' }}>
            <Chip active={!category} label={t('video.allCategories')} onClick={() => selectCategory('')} />
            {(categories.data?.categories || []).map((item) => (
              <Chip
                key={item.id}
                active={category === item.slug}
                image={categoryImage(item.slug)}
                label={item.name}
                count={item.video_count}
                onClick={() => selectCategory(item.slug)}
              />
            ))}
          </div>

          <span className="hide-md" style={{ width: 1, height: 26, background: colors.line, flex: 'none' }} />

          <div className="hide-md" style={{ display: 'flex', gap: 8, flex: 'none' }}>
            <select aria-label={t('video.access')} value={access} onChange={reset(setAccess)} style={selectStyle}>
              {ACCESS_OPTIONS.map((value) => (
                <option key={value || 'any'} value={value}>{value ? t(`access.${value}`) : t('video.allAccess')}</option>
              ))}
            </select>
            <select aria-label={t('video.duration')} value={duration} onChange={reset(setDuration)} style={selectStyle}>
              {DURATION_OPTIONS.map((value) => (
                <option key={value || 'any'} value={value}>{value ? t(`video.duration.${value}`) : t('video.anyDuration')}</option>
              ))}
            </select>
            <select aria-label={t('video.sort')} value={sort} onChange={reset(setSort)} style={selectStyle}>
              {SORT_OPTIONS.map((value) => (
                <option key={value} value={value}>{t(`video.sort.${value}`)}</option>
              ))}
            </select>
          </div>
        </Container>
      </div>

      <Container style={{ padding: '20px 24px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: colors.muted, flexWrap: 'wrap' }}>
            <span>{t('video.resultCount', { n: total })}</span>
            {access && (
              <button type="button" onClick={() => { setAccess(''); setPage(1); }}
                style={{ background: colors.accentSoft, color: colors.accent, fontWeight: 700, padding: '6px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {t(`access.${access}`)} <X size={13} aria-hidden="true" />
              </button>
            )}
          </div>
          {filtered && (
            <button type="button" onClick={clearFilters}
              style={{ background: 'none', border: 'none', fontSize: 13, color: colors.accent, fontWeight: 700, cursor: 'pointer' }}>
              {t('video.clearFilters')}
            </button>
          )}
        </div>

        {catalog.loading ? (
          <div style={{ color: colors.muted }}>{t('common.loading')}</div>
        ) : catalog.error ? (
          <div style={{ color: '#9b2626' }}>{t('video.loadError')}</div>
        ) : !items.length ? (
          <div style={{ color: colors.muted }}>{t('video.empty')}</div>
        ) : (
          <div className="video-grid videos-grid">
            {items.map((video) => <VideoCard key={video.id} video={video} />)}
          </div>
        )}

        {pages > 1 && (
          <nav aria-label={t('video.pagination')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 30 }}>
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={pageStyle(false, page <= 1)}>
              {t('video.previous')}
            </button>
            {Array.from({ length: pages }, (_, i) => i + 1)
              // Long libraries would otherwise print a hundred buttons.
              .filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1)
              .map((n, i, list) => (
                <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
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
      </Container>
    </main>
  );
}

function pageStyle(active, disabled = false) {
  return {
    border: active ? 'none' : '1px solid #dfe2ec',
    background: active ? colors.accent : colors.surface,
    color: active ? '#fff' : disabled ? '#a7aec9' : colors.ink,
    borderRadius: 9, padding: '9px 15px', fontSize: 13.5, fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
  };
}
