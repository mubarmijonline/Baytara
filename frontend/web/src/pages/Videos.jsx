import { useState } from 'react';
import VideoCard from '../components/VideoCard.jsx';
import { Container } from '../components/Primitives.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useFetch, webapi } from '../lib/api.js';
import { colors } from '../theme/tokens.js';

export default function Videos() {
  const { t } = useI18n();
  const [category, setCategory] = useState('');
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
        <div aria-label={t('video.categories')} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
          <button type="button" onClick={() => { setCategory(''); setPage(1); }} style={filterStyle(!category)}>{t('video.allCategories')}</button>
          {(categories.data?.categories || []).map((item) => <button type="button" key={item.slug} onClick={() => { setCategory(item.slug); setPage(1); }} style={filterStyle(category === item.slug)}>{item.name}</button>)}
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

function filterStyle(active) {
  return { border: `1px solid ${active ? colors.accent : colors.line}`, borderRadius: 6, background: active ? colors.accent : '#fff', color: active ? '#fff' : colors.ink, padding: '9px 13px', fontSize: 14, fontWeight: 800, cursor: 'pointer' };
}

const pageStyle = { border: `1px solid ${colors.line}`, borderRadius: 6, background: '#fff', color: colors.ink, padding: '9px 14px', fontWeight: 800, cursor: 'pointer' };
