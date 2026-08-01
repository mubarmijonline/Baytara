import { ArrowDown, ArrowLeft, ArrowUp, Clock3, GripVertical, Plus, RefreshCw, Trash2, Upload, Video } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { catalogErrorCodes, durationLabel, localizedCatalogValue, posterFor } from '../catalog.js';
import { confirmDialog } from '../dialog.jsx';
import { useAdminLanguage } from '../i18n.jsx';
import { ErrText } from '../ui.jsx';

const COPY = {
  ar: {
    heading: 'محتوى الدورة', back: 'الدورات', loading: 'جارٍ تحميل المحتوى…', loadError: 'تعذّر تحميل محتوى الدورة.',
    upload: 'رفع وتعيين', search: 'البحث في الفيديوهات القابلة لإعادة الاستخدام', available: 'مكتبة الفيديوهات',
    assigned: 'الفيديوهات المرتبة', add: 'إضافة الفيديوهات المحددة', noAvailable: 'لا توجد فيديوهات مطابقة.',
    noAssigned: 'لا توجد فيديوهات في هذه الدورة.', moveUp: 'نقل {title} لأعلى', moveDown: 'نقل {title} لأسفل',
    remove: 'إزالة {title} من هذه الدورة', removeConfirm: 'إزالة الفيديو من هذه الدورة فقط؟ سيبقى الفيديو في المكتبة والدورات الأخرى.',
    orderConflict: 'تغيّر ترتيب الدورة في جلسة أخرى. أعد التحميل ثم حاول مجدداً.', reload: 'إعادة التحميل',
    addError: 'تعذّر تعيين الفيديوهات المحددة.', removeError: 'تعذّرت إزالة الفيديو من الدورة.', courses: 'دورات', minutes: 'د',
  },
  en: {
    heading: 'Course content', back: 'Courses', loading: 'Loading course content…', loadError: 'Unable to load course content.',
    upload: 'Upload and assign', search: 'Search reusable videos', available: 'Video library', assigned: 'Ordered videos',
    add: 'Add selected videos', noAvailable: 'No matching videos.', noAssigned: 'No videos in this course.',
    moveUp: 'Move {title} up', moveDown: 'Move {title} down', remove: 'Remove {title} from this course',
    removeConfirm: 'Remove this video from this course only? It remains in the library and other courses.',
    orderConflict: 'The course order changed in another session. Reload it and try again.', reload: 'Reload',
    addError: 'Unable to assign the selected videos.', removeError: 'Unable to remove the video from this course.', courses: 'courses', minutes: 'min',
  },
};

function label(template, title) {
  return template.replace('{title}', title);
}

export default function CourseContent({ routeParams = {} }) {
  const { language, t } = useAdminLanguage();
  const c = COPY[language];
  const courseId = Number(routeParams.courseId);
  const [course, setCourse] = useState(null);
  const [videos, setVideos] = useState([]);
  const [library, setLibrary] = useState([]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [error, setError] = useState('');
  const dragIndex = useRef(null);
  const orderSaving = useRef(false);

  async function loadCourse({ clearError = true, showLoading = true } = {}) {
    if (showLoading) setLoading(true);
    if (clearError) setError('');
    try {
      const result = await api.course(courseId);
      setCourse(result.course);
      const nextVideos = result.course.videos || [];
      setVideos(nextVideos);
      const assignedIds = new Set(nextVideos.map((video) => video.id));
      setPicked((current) => current.filter((video) => !assignedIds.has(video.id)));
      return nextVideos;
    } catch {
      if (clearError) setError(c.loadError);
      return null;
    } finally { if (showLoading) setLoading(false); }
  }

  useEffect(() => { loadCourse(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [courseId]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      api.catalogVideos({ q: query, per_page: 100 }).then((result) => {
        if (active) setLibrary(result.items || result.videos || []);
      }).catch(() => active && setLibrary([]));
    }, query ? 180 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  const assigned = useMemo(() => new Set(videos.map((video) => video.id)), [videos]);
  const available = useMemo(() => library.filter((video) => !assigned.has(video.id)), [library, assigned]);
  const pickedIds = useMemo(() => new Set(picked.map((video) => video.id)), [picked]);
  const controlsBusy = busy || ordering;

  async function persistOrder(next) {
    if (orderSaving.current) return;
    orderSaving.current = true;
    setOrdering(true);
    setVideos(next); setError('');
    try { await api.courseVideoOrder(courseId, next.map((video) => video.id)); }
    catch (apiError) {
      const codes = catalogErrorCodes(apiError);
      const message = codes.includes('video_order_membership_mismatch') ? c.orderConflict : codes.join(' ');
      await loadCourse({ clearError: false, showLoading: false });
      setError(message);
    } finally {
      orderSaving.current = false;
      setOrdering(false);
    }
  }

  function move(from, to) {
    if (orderSaving.current || to < 0 || to >= videos.length || from === to) return;
    const next = [...videos];
    const [video] = next.splice(from, 1);
    next.splice(to, 0, video);
    persistOrder(next);
  }

  async function addSelected() {
    const selected = picked.filter((video) => !assigned.has(video.id));
    if (!selected.length) return;
    setBusy(true); setError('');
    const results = await Promise.allSettled(
      selected.map((video) => api.videoCoursesAdd(video.id, [courseId])),
    );
    try {
      await loadCourse({ clearError: false, showLoading: false });
      if (results.some((result) => result.status === 'rejected')) {
        setError(c.addError);
        return;
      }
      setPicked([]);
    } finally { setBusy(false); }
  }

  async function remove(video) {
    if (!await confirmDialog(c.removeConfirm)) return;
    setBusy(true); setError('');
    try {
      await api.videoCourseRemove(video.id, courseId);
      setVideos((current) => current.filter((item) => item.id !== video.id));
    } catch { setError(c.removeError); }
    finally { setBusy(false); }
  }

  return <section className="course-content-page">
    <Link className="back-link" to="/courses"><ArrowLeft size={16} /> {c.back}</Link>
    <div className="catalog-page-header"><div><h2>{c.heading}</h2>{course && <p>{localizedCatalogValue(course, 'title', language)}</p>}</div><Link className="btn btn-filled" to={`/videos/new?course=${courseId}`}><Upload size={16} /> {c.upload}</Link></div>
    <ErrText>{error}</ErrText>
    {error === c.orderConflict && <button className="btn btn-tonal btn-sm" type="button" onClick={() => loadCourse()}><RefreshCw size={14} /> {c.reload}</button>}
    {loading ? <div className="empty">{c.loading}</div> : <div className="course-content-layout">
      <section className="catalog-panel course-order-panel"><h3>{c.assigned}</h3>
        <div className="ordered-video-list">
          {videos.map((video, index) => {
            const title = localizedCatalogValue(video, 'title', language);
            const poster = posterFor(video);
            const minutes = durationLabel(video.duration_seconds, video.duration_minutes);
            return <article key={video.id} className="ordered-video-row" draggable={!controlsBusy}
              aria-busy={ordering || undefined}
              onDragStart={() => { if (!controlsBusy) dragIndex.current = index; }} onDragOver={(event) => { if (!controlsBusy) event.preventDefault(); }}
              onDrop={() => { if (!controlsBusy && dragIndex.current !== null) move(dragIndex.current, index); dragIndex.current = null; }}>
              <GripVertical size={18} className="drag-handle" aria-hidden="true" />
              <span className="order-number">{index + 1}</span>
              <div className="ordered-video-poster">{poster ? <img src={poster} alt="" /> : <Video size={20} aria-hidden="true" />}</div>
              <div className="ordered-video-copy"><strong>{title}</strong><span>{video.category ? localizedCatalogValue(video.category, 'name', language) : '—'} · {video.assignment_count ?? 1} {c.courses}</span><div className="ordered-video-meta"><span className="chip chip-role">{t(`catalog.access.${video.access_type}`)}</span>{minutes ? <span><Clock3 size={13} aria-hidden="true" /> {minutes} {c.minutes}</span> : null}</div></div>
              <div className="ordered-video-actions">
                <button className="icon-button" type="button" title={label(c.moveUp, title)} aria-label={label(c.moveUp, title)} disabled={index === 0 || controlsBusy} onClick={() => move(index, index - 1)}><ArrowUp size={16} /></button>
                <button className="icon-button" type="button" title={label(c.moveDown, title)} aria-label={label(c.moveDown, title)} disabled={index === videos.length - 1 || controlsBusy} onClick={() => move(index, index + 1)}><ArrowDown size={16} /></button>
                <button className="btn btn-error btn-sm" type="button" aria-label={label(c.remove, title)} disabled={controlsBusy} onClick={() => remove(video)}><Trash2 size={14} /> {language === 'en' ? 'Remove from course' : 'إزالة من الدورة'}</button>
              </div>
            </article>;
          })}
          {!videos.length && <div className="empty">{c.noAssigned}</div>}
        </div>
      </section>
      <aside className="catalog-panel reusable-video-panel"><h3>{c.available}</h3>
        <input className="catalog-search" type="search" aria-label={c.search} placeholder={c.search} value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="catalog-selector">
          {available.map((video) => <label key={video.id}>
            <input type="checkbox" checked={pickedIds.has(video.id)} onChange={() => setPicked((current) => current.some((item) => item.id === video.id) ? current.filter((item) => item.id !== video.id) : [...current, video])} />
            <span><strong>{localizedCatalogValue(video, 'title', language)}</strong><small><span className="chip chip-role">{t(`catalog.access.${video.access_type}`)}</span> · {video.assignment_count ?? 0} {c.courses}</small></span>
          </label>)}
          {!available.length && <div className="empty compact">{c.noAvailable}</div>}
        </div>
        <button className="btn btn-tonal" type="button" disabled={!picked.length || controlsBusy} onClick={addSelected}><Plus size={16} /> {c.add}</button>
      </aside>
    </div>}
  </section>;
}
