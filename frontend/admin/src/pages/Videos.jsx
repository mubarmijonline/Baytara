import { Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { ACCESS_TYPES, CATEGORY_KEYS, VIDEO_VIEWS } from '../catalog.js';
import VideoFolderTree from '../components/VideoFolderTree.jsx';
import VideoViews, { VideoViewSwitcher } from '../components/VideoViews.jsx';
import { useAdminLanguage } from '../i18n.jsx';

const VIEW_STORAGE_KEY = 'baytara_admin_video_view';
const PROVIDER_PAGE_SIZE = 40;
const SEARCH_DEBOUNCE_MS = 300;
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

function positivePage(value) {
  const page = Number(value);
  return Number.isFinite(page) && Number.isInteger(page) && page > 0 ? page : 1;
}

export default function Videos({ searchParams, setSearchParams }) {
  const { language, t } = useAdminLanguage();
  const navigate = useNavigate();
  const folder = searchParams.get('folder') || 'root';
  const rawPage = searchParams.get('page');
  const page = positivePage(rawPage || 1);
  const providerStatus = searchParams.get('status') || '';
  const publication = searchParams.get('publication') || '';
  const courseId = searchParams.get('course') || '';
  const assignment = searchParams.get('assignment') || '';
  const explicitView = searchParams.get('view');
  const [remembered, setRemembered] = useState(rememberedView);
  const view = VIDEO_VIEWS.includes(explicitView) ? explicitView : remembered;
  const [library, setLibrary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [courses, setCourses] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchPending, setSearchPending] = useState(false);
  const requestSequence = useRef(0);
  const requestController = useRef(null);
  const loadingRef = useRef(false);
  const previousQuery = useRef(searchParams.get('q') || '');
  const categorySlug = searchParams.get('category') || '';
  const categoryId = categories.find((category) => category.slug === categorySlug)?.id;
  const query = searchParams.get('q') || '';
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [searchRevision, setSearchRevision] = useState(0);
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
  const load = (refresh = false) => {
    if (refresh && (loadingRef.current || searchPending)) return null;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    const sequence = ++requestSequence.current;
    loadingRef.current = true;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const result = await api.videoLibrary({
          folder_id: folder, q: debouncedQuery, status: providerStatus, category_id: categoryId || '', access_type: access,
          publication, course_id: courseId, assignment, page, per_page: PROVIDER_PAGE_SIZE, refresh: refresh ? 1 : '',
        }, { signal: controller.signal });
        if (sequence !== requestSequence.current) return;
        setLibrary(result);
        const serverPage = positivePage(result.page);
        if (serverPage !== page) updateQuery({ page: serverPage === 1 ? '' : String(serverPage) }, false);
      } catch (caught) {
        if (caught.name === 'AbortError' || sequence !== requestSequence.current) return;
        setError(caught.message === 'no_api_key' ? 'no_api_key' : 'load');
        setLibrary({ items: [], page: 1, pages: 1 });
      } finally {
        if (sequence === requestSequence.current) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    })();
    return controller;
  };

  useEffect(() => {
    api.categories()
      .then((result) => setCategories(result.categories || []))
      .catch(() => setCategories([]))
      .finally(() => setCategoriesLoaded(true));
  }, []);
  useEffect(() => { api.courses({ per_page: 100 }).then((result) => setCourses(result.courses || [])).catch(() => setCourses([])); }, []);
  useEffect(() => {
    if (rawPage && String(page) !== rawPage) updateQuery({ page: page === 1 ? '' : String(page) }, false);
  }, [page, rawPage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (categoriesLoaded && categorySlug && !categoryId) updateQuery({ category: '' });
  }, [categoriesLoaded, categorySlug, categoryId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (query === previousQuery.current) return undefined;
    previousQuery.current = query;
    requestController.current?.abort();
    requestSequence.current += 1;
    loadingRef.current = false;
    setLoading(false);
    setSearchPending(true);
    const timeout = setTimeout(() => {
      setDebouncedQuery(query);
      setSearchRevision((revision) => revision + 1);
      setSearchPending(false);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);
  useEffect(() => {
    if (!categoriesLoaded || (categorySlug && !categoryId)) return undefined;
    const controller = load();
    return () => controller?.abort();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [folder, page, providerStatus, categoryId, access, publication, courseId, assignment, debouncedQuery, searchRevision, categoriesLoaded]);

  const currentPage = library?.page || page;
  const pageCount = library?.pages || 1;
  return <section className="video-library">
    <header className="video-library-header"><div><h2>{t('pages.videoLibrary')}</h2><p>{t('video.librarySubtitle')}</p></div><div className="video-library-actions"><button className="btn btn-tonal btn-sm" type="button" disabled={loading || searchPending} onClick={() => load(true)}>{t('common.refresh')}</button><button className="btn btn-filled btn-sm" type="button" onClick={() => navigate('/videos/new')}><Upload size={16} /> {t('video.uploadVideo')}</button></div></header>
    <div className="video-library-layout"><VideoFolderTree selectedId={folder} onSelect={(id) => updateQuery({ folder: id === 'root' ? '' : id })} /><div className="video-library-main"><div className="video-library-toolbar">
      <input aria-label={t('common.search')} value={query} placeholder={t('video.searchPlaceholder')} onChange={(event) => updateQuery({ q: event.target.value })} />
      <select aria-label={t('catalog.category')} value={categorySlug} onChange={(event) => updateQuery({ category: event.target.value })}><option value="">{t('video.allCategories')}</option>{categories.filter((category) => CATEGORY_KEYS.includes(category.slug)).map((category) => <option key={category.id} value={category.slug}>{language === 'en' ? category.name_en || category.name : category.name || category.name_en}</option>)}</select>
      <select aria-label={t('catalog.accessType')} value={access} onChange={(event) => updateQuery({ access: event.target.value })}><option value="">{t('video.allAccess')}</option>{ACCESS_TYPES.map((value) => <option key={value} value={value}>{t(`catalog.access.${value}`)}</option>)}</select>
      <select aria-label={t('video.providerState')} value={providerStatus} onChange={(event) => updateQuery({ status: event.target.value })}><option value="">{t('video.allProviderStatuses')}</option>{PROVIDER_STATUSES.map((value) => <option key={value} value={value}>{t(`video.providerStatus.${value}`)}</option>)}</select>
      <select aria-label={t('video.publication')} value={publication} onChange={(event) => updateQuery({ publication: event.target.value })}><option value="">{t('video.allPublications')}</option>{PUBLICATION_STATUSES.map((value) => <option key={value} value={value}>{t(`catalog.status.${value}`)}</option>)}</select>
      <select aria-label={t('video.course')} value={courseId} onChange={(event) => updateQuery({ course: event.target.value })}><option value="">{t('video.allCourses')}</option>{courses.map((course) => <option key={course.id} value={course.id}>{language === 'en' ? course.title_en || course.title : course.title || course.title_en}</option>)}</select>
      <select aria-label={t('video.assignment')} value={assignment} onChange={(event) => updateQuery({ assignment: event.target.value })}><option value="">{t('video.allAssignments')}</option><option value="assigned">{t('video.assignment.assigned')}</option><option value="unassigned">{t('video.assignment.unassigned')}</option></select>
      <VideoViewSwitcher view={view} onChange={selectView} />
    </div>{error && <div className="error-text video-error">{error === 'no_api_key' ? <>{t('video.noApiKey')} <Link to="/settings">{t('nav.settings')}</Link></> : t('errors.load')}</div>}{library === null ? <div className="video-skeletons" aria-label={t('common.loading')}><span /><span /><span /></div> : <><VideoViews view={view} videos={library.items || []} /><div className="video-pagination"><button className="btn btn-tonal btn-sm" type="button" aria-label={t('video.previousPage')} disabled={currentPage <= 1} onClick={() => updateQuery({ page: currentPage - 1 === 1 ? '' : String(currentPage - 1) }, false)}>{t('video.previousPage')}</button><span>{t('video.page')} {currentPage} / {pageCount}</span><button className="btn btn-tonal btn-sm" type="button" aria-label={t('video.nextPage')} disabled={currentPage >= pageCount} onClick={() => updateQuery({ page: String(currentPage + 1) }, false)}>{t('video.nextPage')}</button></div></>}</div></div>
  </section>;
}
