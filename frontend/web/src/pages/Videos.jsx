import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import VideoCard from '../components/VideoCard.jsx';
import { Container } from '../components/Primitives.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useFetch, webapi } from '../lib/api.js';
import { colors } from '../theme/tokens.js';
import { categoryImage } from '../lib/category-images.js';

export default function Videos() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [category, setCategory] = useState(params.get('category') || '');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const categories = useFetch(() => webapi.categories(), []);
  const catalog = useFetch(() => webapi.videos({ category, q: search, page, per_page: 24 }), [category, search, page]);
  const items = catalog.data?.videos || [];

  const submit = (event) => {
    event.preventDefault();
    setPage(1);
    setSearch(query.trim());
  };

  const selectCategory = (slug) => {
    setCategory(slug);
    setPage(1);
    const next = new URLSearchParams(params);
    if (slug) next.set('category', slug);
    else next.delete('category');
    setParams(next, { replace: true });
  };

  return (
    <main style={{ background: colors.surfaceMuted, minHeight: '70vh', padding: '48px 0 72px' }}>
      <Container>
        <div style={{ maxWidth: 720, marginBottom: 30 }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 38, lineHeight: 1.25, fontWeight: 900 }}>{t('video.libraryTitle')}</h1>
          <p style={{ margin: 0, color: colors.muted, fontSize: 17, lineHeight: 1.7 }}>{t('video.librarySubtitle')}</p>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', gap: 8, maxWidth: 600, marginBottom: 20 }}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('video.searchPlaceholder')} aria-label={t('video.searchPlaceholder')} style={{ flex: 1, minWidth: 0, height: 44, border: `1px solid ${colors.line}`, borderRadius: 6, padding: '0 14px', fontSize: 15 }} />
          <button type="submit" style={{ height: 44, border: 0, borderRadius: 6, background: colors.accent, color: '#fff', padding: '0 20px', fontWeight: 800, cursor: 'pointer' }}>{t('video.search')}</button>
        </form>
        <div aria-label={t('video.categories')} className="video-category-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 28 }}>
          <CategoryFilterCard title={t('video.allCategories')} label={t('video.allVideos')} active={!category} onClick={() => selectCategory('')} />
          {(categories.data?.categories || []).map((item, index) => (
            <CategoryFilterCard key={item.slug} title={item.name} label={t('video.specialty')} active={category === item.slug} index={index} image={categoryImage(item.slug)} onClick={() => selectCategory(item.slug)} />
          ))}
        </div>
        {catalog.loading ? <p>{t('common.loading')}</p> : catalog.error ? <p style={{ color: '#9b2626' }}>{t('video.loadError')}</p> : items.length ? (
          <>
            <div className="video-grid">{items.map((video) => <VideoCard key={video.id} video={video} />)}</div>
            {catalog.data.pages > 1 && <nav aria-label={t('video.pagination')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 32 }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} style={pageStyle}>{t('video.previous')}</button>
              <span>{t('video.page')} {page} / {catalog.data.pages}</span>
              <button type="button" disabled={page >= catalog.data.pages} onClick={() => setPage((current) => current + 1)} style={pageStyle}>{t('video.next')}</button>
            </nav>}
          </>
        ) : <p style={{ color: colors.muted }}>{t('video.empty')}</p>}
      </Container>
    </main>
  );
}

function CategoryFilterCard({ title, label, active, index = 0, image = '', onClick }) {
  const colorsByIndex = ['#3048A0', '#1E2A5E', '#8a6d1f', '#176b45', '#9b6526', '#4356A6'];
  const marker = colorsByIndex[index % colorsByIndex.length];
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        minHeight: 88,
        textAlign: 'inherit',
        border: `1px solid ${active ? colors.accent : colors.line}`,
        borderRadius: 8,
        background: active ? colors.accentSoft : '#fff',
        color: colors.ink,
        padding: 14,
        cursor: 'pointer',
        boxShadow: active ? '0 12px 26px rgba(48,72,160,.13)' : '0 8px 20px rgba(20,30,66,.04)',
      }}
    >
      {image ? (
        <img src={image} alt="" loading="lazy" aria-hidden="true" style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 6, marginBottom: 12 }} />
      ) : (
        <span aria-hidden="true" style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', borderRadius: 6, marginBottom: 12, background: `linear-gradient(135deg, ${colors.accentSoft}, #fff)`, border: `1px solid ${colors.line}` }} />
      )}
      <span style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 4, background: marker, boxShadow: active ? `0 0 0 4px ${colors.accentSoft}` : 'none', flex: '0 0 auto' }} />
        <span style={{ fontSize: 12, fontWeight: 900, color: active ? colors.accent : colors.muted }}>{label}</span>
      </span>
      <span style={{ display: 'block', fontSize: 16, lineHeight: 1.35, fontWeight: 900 }}>{title}</span>
    </button>
  );
}

const pageStyle = { border: `1px solid ${colors.line}`, borderRadius: 6, background: '#fff', color: colors.ink, padding: '9px 14px', fontWeight: 800, cursor: 'pointer' };
