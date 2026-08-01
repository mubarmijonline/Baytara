import { Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { ACCESS_TYPES, CATEGORY_KEYS, VIDEO_VIEWS } from '../catalog.js';
import VideoFolderTree from '../components/VideoFolderTree.jsx';
import VideoViews, { VideoViewSwitcher } from '../components/VideoViews.jsx';
import { useAdminLanguage } from '../i18n.jsx';

const VIEW_STORAGE_KEY = 'baytara_admin_video_view';

function rememberedView() {
  try {
    const value = localStorage.getItem(VIEW_STORAGE_KEY);
    return VIDEO_VIEWS.includes(value) ? value : 'grid';
  } catch {
    return 'grid';
  }
}

export default function Videos({ searchParams, setSearchParams }) {
  const { t } = useAdminLanguage();
  const navigate = useNavigate();
  const folder = searchParams.get('folder') || 'root';
  const explicitView = searchParams.get('view');
  const [remembered, setRemembered] = useState(rememberedView);
  const view = VIDEO_VIEWS.includes(explicitView) ? explicitView : remembered;
  const [providerVideos, setProviderVideos] = useState(null);
  const [catalogVideos, setCatalogVideos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);

  const categorySlug = searchParams.get('category') || '';
  const categoryId = categories.find((category) => category.slug === categorySlug)?.id;

  const updateQuery = (updates) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    setSearchParams(next);
  };
  const selectView = (nextView) => {
    try { localStorage.setItem(VIEW_STORAGE_KEY, nextView); } catch { /* session state is enough */ }
    setRemembered(nextView);
    updateQuery({ view: nextView });
  };
  const load = async () => {
    const sequence = ++requestSequence.current;
    setError('');
    try {
      const [provider, catalog] = await Promise.all([
        api.vdocipherVideos({ folder_id: folder, q: searchParams.get('q') || '', limit: 40 }),
        api.videos({
          category_id: categoryId || '',
          access_type: searchParams.get('access') || '',
          status: searchParams.get('status') || '',
          q: searchParams.get('q') || '',
          per_page: 100,
        }),
      ]);
      if (sequence !== requestSequence.current) return;
      setProviderVideos(provider.videos || []);
      setCatalogVideos(catalog.items || catalog.videos || []);
    } catch (caught) {
      if (sequence !== requestSequence.current) return;
      setError(caught.message === 'no_api_key' ? 'no_api_key' : 'load');
      setProviderVideos([]);
      setCatalogVideos([]);
    }
  };

  useEffect(() => { api.categories().then((result) => setCategories(result.categories || [])).catch(() => setCategories([])); }, []);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [folder, categoryId, searchParams.get('access'), searchParams.get('status'), searchParams.get('q')]);

  const videos = useMemo(() => {
    const byProviderId = new Map(catalogVideos.filter((video) => video.vdocipher_video_id).map((video) => [video.vdocipher_video_id, video]));
    const hasLocalFilters = Boolean(categorySlug || searchParams.get('access') || searchParams.get('status'));
    const provider = (providerVideos || []).map((video) => ({ ...video, catalog: byProviderId.get(video.id) })).filter((video) => !hasLocalFilters || video.catalog);
    const localOnly = catalogVideos.filter((video) => !video.vdocipher_video_id).map((video) => ({
      id: `catalog-${video.id}`, title: video.title, status: video.status, catalog: video,
    }));
    return [...provider, ...localOnly];
  }, [catalogVideos, providerVideos, categorySlug, searchParams]);

  return <section className="video-library">
    <header className="video-library-header">
      <div><h2>{t('pages.videoLibrary')}</h2><p>{t('video.librarySubtitle')}</p></div>
      <div className="video-library-actions">
        <button className="btn btn-tonal btn-sm" type="button" onClick={load}>{t('common.refresh')}</button>
        <button className="btn btn-filled btn-sm" type="button" onClick={() => navigate('/videos/new')}><Upload size={16} /> {t('video.uploadVideo')}</button>
      </div>
    </header>
    <div className="video-library-layout">
      <VideoFolderTree selectedId={folder} onSelect={(id) => updateQuery({ folder: id === 'root' ? '' : id })} />
      <div className="video-library-main">
        <div className="video-library-toolbar">
          <input aria-label={t('common.search')} value={searchParams.get('q') || ''} placeholder={t('video.searchPlaceholder')} onChange={(event) => updateQuery({ q: event.target.value })} />
          <select aria-label={t('catalog.category')} value={categorySlug} onChange={(event) => updateQuery({ category: event.target.value })}>
            <option value="">{t('video.allCategories')}</option>
            {categories.filter((category) => CATEGORY_KEYS.includes(category.slug)).map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}
          </select>
          <select aria-label={t('catalog.accessType')} value={searchParams.get('access') || ''} onChange={(event) => updateQuery({ access: event.target.value })}>
            <option value="">{t('video.allAccess')}</option>
            {ACCESS_TYPES.map((access) => <option key={access} value={access}>{t(`catalog.access.${access}`)}</option>)}
          </select>
          <select aria-label={t('catalog.status')} value={searchParams.get('status') || ''} onChange={(event) => updateQuery({ status: event.target.value })}>
            <option value="">{t('video.allStatuses')}</option>
            {['draft', 'published', 'unpublished'].map((status) => <option key={status} value={status}>{t(`catalog.status.${status}`)}</option>)}
          </select>
          <VideoViewSwitcher view={view} onChange={selectView} />
        </div>
        {error && <div className="error-text video-error">{error === 'no_api_key' ? <>{t('video.noApiKey')} <Link to="/settings">{t('nav.settings')}</Link></> : t('errors.load')}</div>}
        {providerVideos === null ? <div className="video-skeletons" aria-label={t('common.loading')}><span /><span /><span /></div> : <VideoViews view={view} videos={videos} />}
      </div>
    </div>
  </section>;
}
