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
  const { t } = useAdminLanguage();
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
  const load = async (refresh = false) => {
    const sequence = ++requestSequence.current;
    setError('');
    try {
      const result = await api.videoLibrary({
        folder_id: folder, q: query, status: providerStatus, category_id: categoryId || '', access_type: access,
        publication, course_id: courseId, assignment, page, per_page: PROVIDER_PAGE_SIZE, refresh: refresh ? 1 : '',
      });
      if (sequence === requestSequence.current) setLibrary(result);
    } catch (caught) {
      if (sequence !== requestSequence.current) return;
      setError(caught.message === 'no_api_key' ? 'no_api_key' : 'load');
      setLibrary({ items: [], page: 1, pages: 1 });
    }
  };

  useEffect(() => { api.categories().then((result) => setCategories(result.categories || [])).catch(() => setCategories([])); }, []);
  useEffect(() => { api.courses({ per_page: 100 }).then((result) => setCourses(result.courses || [])).catch(() => setCourses([])); }, []);
  useEffect(() => {
    if (rawPage && String(page) !== rawPage) updateQuery({ page: page === 1 ? '' : String(page) }, false);
  }, [page, rawPage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [folder, page, providerStatus, categoryId, access, publication, courseId, assignment, query]);

  const currentPage = library?.page || page;
  const pageCount = library?.pages || 1;
  return <section className="video-library">
    <header className="video-library-header"><div><h2>{t('pages.videoLibrary')}</h2><p>{t('video.librarySubtitle')}</p></div><div className="video-library-actions"><button className="btn btn-tonal btn-sm" type="button" onClick={() => load(true)}>{t('common.refresh')}</button><button className="btn btn-filled btn-sm" type="button" onClick={() => navigate('/videos/new')}><Upload size={16} /> {t('video.uploadVideo')}</button></div></header>
    <div className="video-library-layout"><VideoFolderTree selectedId={folder} onSelect={(id) => updateQuery({ folder: id === 'root' ? '' : id })} /><div className="video-library-main"><div className="video-library-toolbar">
      <input aria-label={t('common.search')} value={query} placeholder={t('video.searchPlaceholder')} onChange={(event) => updateQuery({ q: event.target.value })} />
      <select aria-label={t('catalog.category')} value={categorySlug} onChange={(event) => updateQuery({ category: event.target.value })}><option value="">{t('video.allCategories')}</option>{categories.filter((category) => CATEGORY_KEYS.includes(category.slug)).map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}</select>
      <select aria-label={t('catalog.accessType')} value={access} onChange={(event) => updateQuery({ access: event.target.value })}><option value="">{t('video.allAccess')}</option>{ACCESS_TYPES.map((value) => <option key={value} value={value}>{t(`catalog.access.${value}`)}</option>)}</select>
      <select aria-label={t('video.providerState')} value={providerStatus} onChange={(event) => updateQuery({ status: event.target.value })}><option value="">{t('video.allProviderStatuses')}</option>{PROVIDER_STATUSES.map((value) => <option key={value} value={value}>{t(`video.providerStatus.${value}`)}</option>)}</select>
      <select aria-label={t('video.publication')} value={publication} onChange={(event) => updateQuery({ publication: event.target.value })}><option value="">{t('video.allPublications')}</option>{PUBLICATION_STATUSES.map((value) => <option key={value} value={value}>{t(`catalog.status.${value}`)}</option>)}</select>
      <select aria-label={t('video.course')} value={courseId} onChange={(event) => updateQuery({ course: event.target.value })}><option value="">{t('video.allCourses')}</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select>
      <select aria-label={t('video.assignment')} value={assignment} onChange={(event) => updateQuery({ assignment: event.target.value })}><option value="">{t('video.allAssignments')}</option><option value="assigned">{t('video.assignment.assigned')}</option><option value="unassigned">{t('video.assignment.unassigned')}</option></select>
      <VideoViewSwitcher view={view} onChange={selectView} />
    </div>{error && <div className="error-text video-error">{error === 'no_api_key' ? <>{t('video.noApiKey')} <Link to="/settings">{t('nav.settings')}</Link></> : t('errors.load')}</div>}{library === null ? <div className="video-skeletons" aria-label={t('common.loading')}><span /><span /><span /></div> : <><VideoViews view={view} videos={library.items || []} /><div className="video-pagination"><button className="btn btn-tonal btn-sm" type="button" aria-label={t('video.previousPage')} disabled={currentPage <= 1} onClick={() => updateQuery({ page: currentPage - 1 === 1 ? '' : String(currentPage - 1) }, false)}>{t('video.previousPage')}</button><span>{t('video.page')} {currentPage} / {pageCount}</span><button className="btn btn-tonal btn-sm" type="button" aria-label={t('video.nextPage')} disabled={currentPage >= pageCount} onClick={() => updateQuery({ page: String(currentPage + 1) }, false)}>{t('video.nextPage')}</button></div></>}</div></div>
  </section>;
}
