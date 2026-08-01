import { ArrowDown, ArrowLeft, ArrowUp, GripVertical, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { catalogErrorCodes, localizedCatalogValue } from '../catalog.js';
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
    addError: 'تعذّر تعيين الفيديوهات المحددة.', removeError: 'تعذّرت إزالة الفيديو من الدورة.', courses: 'دورات',
  },
  en: {
    heading: 'Course content', back: 'Courses', loading: 'Loading course content…', loadError: 'Unable to load course content.',
    upload: 'Upload and assign', search: 'Search reusable videos', available: 'Video library', assigned: 'Ordered videos',
    add: 'Add selected videos', noAvailable: 'No matching videos.', noAssigned: 'No videos in this course.',
    moveUp: 'Move {title} up', moveDown: 'Move {title} down', remove: 'Remove {title} from this course',
    removeConfirm: 'Remove this video from this course only? It remains in the library and other courses.',
    orderConflict: 'The course order changed in another session. Reload it and try again.', reload: 'Reload',
    addError: 'Unable to assign the selected videos.', removeError: 'Unable to remove the video from this course.', courses: 'courses',
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
  const [error, setError] = useState('');
  const dragIndex = useRef(null);

  async function loadCourse() {
    setLoading(true); setError('');
    try {
      const result = await api.course(courseId);
      setCourse(result.course);
      setVideos(result.course.videos || []);
    } catch { setError(c.loadError); }
    finally { setLoading(false); }
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

  async function persistOrder(next) {
    setVideos(next); setError('');
    try { await api.courseVideoOrder(courseId, next.map((video) => video.id)); }
    catch (apiError) {
      const codes = catalogErrorCodes(apiError);
      setError(codes.includes('video_order_membership_mismatch') ? c.orderConflict : codes.join(' '));
    }
  }

  function move(from, to) {
    if (to < 0 || to >= videos.length || from === to) return;
    const next = [...videos];
    const [video] = next.splice(from, 1);
    next.splice(to, 0, video);
    persistOrder(next);
  }

  async function addSelected() {
    const selected = available.filter((video) => picked.includes(video.id));
    if (!selected.length) return;
    setBusy(true); setError('');
    try {
      await Promise.all(selected.map((video) => api.videoCoursesSet(video.id, [
        ...new Set([...(video.courses || []).map((item) => item.id), courseId]),
      ])));
      setPicked([]);
      await loadCourse();
    } catch { setError(c.addError); }
    finally { setBusy(false); }
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
    {error === c.orderConflict && <button className="btn btn-tonal btn-sm" type="button" onClick={loadCourse}><RefreshCw size={14} /> {c.reload}</button>}
    {loading ? <div className="empty">{c.loading}</div> : <div className="course-content-layout">
      <section className="catalog-panel course-order-panel"><h3>{c.assigned}</h3>
        <div className="ordered-video-list">
          {videos.map((video, index) => {
            const title = localizedCatalogValue(video, 'title', language);
            return <article key={video.id} className="ordered-video-row" draggable="true"
              onDragStart={() => { dragIndex.current = index; }} onDragOver={(event) => event.preventDefault()}
              onDrop={() => { if (dragIndex.current !== null) move(dragIndex.current, index); dragIndex.current = null; }}>
              <GripVertical size={18} className="drag-handle" aria-hidden="true" />
              <span className="order-number">{index + 1}</span>
              <div className="ordered-video-copy"><strong>{title}</strong><span>{video.category ? localizedCatalogValue(video.category, 'name', language) : '—'} · {t(`catalog.access.${video.access_type}`)} · {video.assignment_count ?? 1} {c.courses}</span></div>
              <div className="ordered-video-actions">
                <button className="icon-button" type="button" title={label(c.moveUp, title)} aria-label={label(c.moveUp, title)} disabled={index === 0 || busy} onClick={() => move(index, index - 1)}><ArrowUp size={16} /></button>
                <button className="icon-button" type="button" title={label(c.moveDown, title)} aria-label={label(c.moveDown, title)} disabled={index === videos.length - 1 || busy} onClick={() => move(index, index + 1)}><ArrowDown size={16} /></button>
                <button className="btn btn-error btn-sm" type="button" aria-label={label(c.remove, title)} disabled={busy} onClick={() => remove(video)}><Trash2 size={14} /> {language === 'en' ? 'Remove from course' : 'إزالة من الدورة'}</button>
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
            <input type="checkbox" checked={picked.includes(video.id)} onChange={() => setPicked((current) => current.includes(video.id) ? current.filter((id) => id !== video.id) : [...current, video.id])} />
            <span><strong>{localizedCatalogValue(video, 'title', language)}</strong><small>{t(`catalog.access.${video.access_type}`)} · {video.assignment_count ?? 0} {c.courses}</small></span>
          </label>)}
          {!available.length && <div className="empty compact">{c.noAvailable}</div>}
        </div>
        <button className="btn btn-tonal" type="button" disabled={!picked.length || busy} onClick={addSelected}><Plus size={16} /> {c.add}</button>
      </aside>
    </div>}
  </section>;
}
