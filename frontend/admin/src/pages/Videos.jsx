import { Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { ACCESS_TYPES, CATEGORY_KEYS, VIDEO_VIEWS } from '../catalog.js';
import VideoFolderTree from '../components/VideoFolderTree.jsx';
import VideoViews, { VideoViewSwitcher } from '../components/VideoViews.jsx';
import { useAdminLanguage } from '../i18n.jsx';

const VIEW_STORAGE_KEY = 'baytara_admin_video_view';
const PROVIDER_PAGE_SIZE = 40;
const PROVIDER_STATUSES = ['ready', 'preparing', 'queued', 'failed'];
const PUBLICATION_STATUSES = ['draft', 'published', 'unpublished'];

function rememberedView() {
  try {
    const value = localStorage.getItem(VIEW_STORAGE_KEY);
    return VIDEO_VIEWS.includes(value) ? value : 'grid';
  } catch {
    return 'grid';
  }
}

function hasAssignments(video) {
  return (video.catalog?.courses || []).length > 0;
}

export default function Videos({ searchParams, setSearchParams }) {
  const { t } = useAdminLanguage();
  const navigate = useNavigate();
  const folder = searchParams.get('folder') || 'root';
  const page = Math.max(Number(searchParams.get('page') || 1), 1);
  const providerStatus = searchParams.get('status') || '';
  const publication = searchParams.get('publication') || '';
  const courseId = searchParams.get('course') || '';
  const assignment = searchParams.get('assignment') || '';
  const explicitView = searchParams.get('view');
  const [remembered, setRemembered] = useState(rememberedView);
  const view = VIDEO_VIEWS.includes(explicitView) ? explicitView : remembered;
  const [providerResult, setProviderResult] = useState(null);
  const [catalogVideos, setCatalogVideos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [courses, setCourses] = useState([]);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);

  const categorySlug = searchParams.get('category') || '';
  const categoryId = categories.find((category) => category.slug === categorySlug)?.id;
  const query = searchParams.get('q') || '';
  const access = searchParams.get('access') || '';

  const updateQuery = (updates, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    if (resetPage) next.delete('page');
    setSearchParams(next);
  };
  const selectView = (nextView) => {
    try { localStorage.setItem(VIEW_STORAGE_KEY, nextView); } catch { /* session state is enough */ }
    setRemembered(nextView);
    updateQuery({ view: nextView }, false);
  };
  const load = async () => {
    const sequence = ++requestSequence.current;
    setError('');
    try {
      const [provider, catalog] = await Promise.all([
        api.vdocipherVideos({ folder_id: folder, q: query, page, limit: PROVIDER_PAGE_SIZE }),
        api.videos({
          category_id: categoryId || '', access_type: access, status: publication,
          course_id: courseId, q: query, per_page: 100,
        }),
      ]);
      if (sequence !== requestSequence.current) return;
      setProviderResult({ videos: provider.videos || [], count: Number(provider.count || 0) });
      setCatalogVideos(catalog.items || catalog.videos || []);
    } catch (caught) {
      if (sequence !== requestSequence.current) return;
      setError(caught.message === 'no_api_key' ? 'no_api_key' : 'load');
      setProviderResult({ videos: [], count: 0 });
      setCatalogVideos([]);
    }
  };

  useEffect(() => { api.categories().then((result) => setCategories(result.categories || [])).catch(() => setCategories([])); }, []);
  useEffect(() => { api.courses({ per_page: 100 }).then((result) => setCourses(result.courses || [])).catch(() => setCourses([])); }, []);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [folder, page, categoryId, access, publication, courseId, query]);

  const videos = useMemo(() => {
    const byProviderId = new Map(catalogVideos.filter((video) => video.vdocipher_video_id).map((video) => [video.vdocipher_video_id, video]));
    const localFilterActive = Boolean(categorySlug || access || publication || courseId || assignment === 'assigned');
    const matchesAssignment = (video) => assignment === 'assigned' ? hasAssignments(video) : assignment === 'unassigned' ? !hasAssignments(video) : true;
    const provider = (providerResult?.videos || []).map((video) => ({ ...video, catalog: byProviderId.get(video.id) }))
      .filter((video) => !providerStatus || video.status === providerStatus)
      .filter((video) => !localFilterActive || video.catalog)
      .filter(matchesAssignment);
    if (folder !== 'root') return provider;

    const providerIds = new Set(providerResult?.videos?.map((video) => video.id));
    const fallback = !providerStatus ? catalogVideos
      .filter((video) => video.vdocipher_video_id && !providerIds.has(video.vdocipher_video_id))
      .map((catalog) => ({ id: catalog.vdocipher_video_id, title: catalog.title, status: '', catalog, fallback: true })) : [];
    const localOnly = catalogVideos.filter((video) => !video.vdocipher_video_id).map((catalog) => ({
      id: `catalog-${catalog.id}`, title: catalog.title, status: '', catalog,
    })).filter(matchesAssignment);
    return [...provider, ...fallback.filter(matchesAssignment), ...localOnly];
  }, [access, assignment, catalogVideos, categorySlug, courseId, folder, providerResult, providerStatus, publication]);

  const pageCount = Math.max(1, Math.ceil((providerResult?.count || 0) / PROVIDER_PAGE_SIZE));
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
          <input aria-label={t('common.search')} value={query} placeholder={t('video.searchPlaceholder')} onChange={(event) => updateQuery({ q: event.target.value })} />
          <select aria-label={t('catalog.category')} value={categorySlug} onChange={(event) => updateQuery({ category: event.target.value })}><option value="">{t('video.allCategories')}</option>{categories.filter((category) => CATEGORY_KEYS.includes(category.slug)).map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}</select>
          <select aria-label={t('catalog.accessType')} value={access} onChange={(event) => updateQuery({ access: event.target.value })}><option value="">{t('video.allAccess')}</option>{ACCESS_TYPES.map((value) => <option key={value} value={value}>{t(`catalog.access.${value}`)}</option>)}</select>
          <select aria-label={t('video.providerState')} value={providerStatus} onChange={(event) => updateQuery({ status: event.target.value })}><option value="">{t('video.allProviderStatuses')}</option>{PROVIDER_STATUSES.map((value) => <option key={value} value={value}>{t(`video.providerStatus.${value}`)}</option>)}</select>
          <select aria-label={t('video.publication')} value={publication} onChange={(event) => updateQuery({ publication: event.target.value })}><option value="">{t('video.allPublications')}</option>{PUBLICATION_STATUSES.map((value) => <option key={value} value={value}>{t(`catalog.status.${value}`)}</option>)}</select>
          <select aria-label={t('video.course')} value={courseId} onChange={(event) => updateQuery({ course: event.target.value })}><option value="">{t('video.allCourses')}</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select>
          <select aria-label={t('video.assignment')} value={assignment} onChange={(event) => updateQuery({ assignment: event.target.value })}><option value="">{t('video.allAssignments')}</option><option value="assigned">{t('video.assignment.assigned')}</option><option value="unassigned">{t('video.assignment.unassigned')}</option></select>
          <VideoViewSwitcher view={view} onChange={selectView} />
        </div>
        {error && <div className="error-text video-error">{error === 'no_api_key' ? <>{t('video.noApiKey')} <Link to="/settings">{t('nav.settings')}</Link></> : t('errors.load')}</div>}
        {providerResult === null ? <div className="video-skeletons" aria-label={t('common.loading')}><span /><span /><span /></div> : <><VideoViews view={view} videos={videos} /><div className="video-pagination"><button className="btn btn-tonal btn-sm" type="button" aria-label={t('video.previousPage')} disabled={page <= 1} onClick={() => updateQuery({ page: page - 1 === 1 ? '' : String(page - 1) }, false)}>{t('video.previousPage')}</button><span>{t('video.page')} {page} / {pageCount}</span><button className="btn btn-tonal btn-sm" type="button" aria-label={t('video.nextPage')} disabled={page >= pageCount} onClick={() => updateQuery({ page: String(page + 1) }, false)}>{t('video.nextPage')}</button></div></>}
      </div>
    </div>
  </section>;
}
