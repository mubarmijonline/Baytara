import { ArrowDown, ArrowLeft, ArrowUp, Eye, EyeOff, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { CATALOG_STATUSES, PATH_LEVELS, catalogErrorCodes, localizedCatalogValue } from '../catalog.js';
import { confirmDialog } from '../dialog.jsx';
import { useAdminLanguage } from '../i18n.jsx';
import { toast } from '../toast.jsx';
import { ErrText, Field } from '../ui.jsx';

const COPY = {
  ar: {
    paths: 'المسارات التعليمية', newPath: 'مسار جديد', editPath: 'تعديل المسار', loading: 'جارٍ التحميل…',
    title: 'العنوان', status: 'الحالة', level: 'المستوى', steps: 'الخطوات', order: 'الترتيب', actions: 'الإجراءات',
    noPaths: 'لا توجد مسارات.', edit: 'تعديل', publish: 'نشر', unpublish: 'إخفاء', delete: 'حذف',
    arabicTitle: 'العنوان العربي', englishTitle: 'العنوان الإنجليزي', arabicDescription: 'الوصف العربي',
    englishDescription: 'الوصف الإنجليزي', sortOrder: 'ترتيب العرض', courses: 'الدورات',
    searchCourses: 'البحث في الدورات', selectedSteps: 'خطوات المسار بالترتيب', moveUp: 'لأعلى', moveDown: 'لأسفل',
    save: 'حفظ المسار', cancel: 'إلغاء', titleRequired: 'العنوان العربي مطلوب.',
    stepsRequired: 'اختر دورة واحدة على الأقل.', draftNote: 'الدورات غير المنشورة لا تُحتسب في بطاقة المسار.',
    deleteConfirm: 'حذف هذا المسار؟', loadError: 'تعذّر تحميل بيانات المسار.',
    badLevel: 'مستوى غير معروف.', badStatus: 'حالة غير معروفة.', courseNotFound: 'إحدى الدورات المحددة غير موجودة.',
    stepsCount: '{count} دورة · {minutes} دقيقة',
  },
  en: {
    paths: 'Learning paths', newPath: 'New path', editPath: 'Edit path', loading: 'Loading…',
    title: 'Title', status: 'Status', level: 'Level', steps: 'Steps', order: 'Order', actions: 'Actions',
    noPaths: 'No paths found.', edit: 'Edit', publish: 'Publish', unpublish: 'Unpublish', delete: 'Delete',
    arabicTitle: 'Arabic title', englishTitle: 'English title', arabicDescription: 'Arabic description',
    englishDescription: 'English description', sortOrder: 'Display order', courses: 'Courses',
    searchCourses: 'Search courses', selectedSteps: 'Path steps, in order', moveUp: 'Move up', moveDown: 'Move down',
    save: 'Save path', cancel: 'Cancel', titleRequired: 'Arabic title is required.',
    stepsRequired: 'Choose at least one course.', draftNote: 'Unpublished courses do not count towards the path card.',
    deleteConfirm: 'Delete this path?', loadError: 'Unable to load path details.',
    badLevel: 'Unknown level.', badStatus: 'Unknown status.', courseNotFound: 'One of the selected courses no longer exists.',
    stepsCount: '{count} courses · {minutes} min',
  },
};

const emptyPath = {
  title: '', title_en: '', description: '', description_en: '',
  level: 'beginner', status: 'draft', sort_order: 0, course_ids: [],
};

const MAX_OPTION_PAGES = 25;

function mergeById(...groups) {
  const merged = new Map();
  groups.flat().forEach((item) => { if (item?.id != null) merged.set(item.id, item); });
  return [...merged.values()];
}

async function loadAllPages(loadPage, itemKey) {
  const first = await loadPage(1);
  const pageCount = Math.min(Math.max(Number(first.pages) || 1, 1), MAX_OPTION_PAGES);
  const remaining = await Promise.all(Array.from(
    { length: pageCount - 1 }, (_, index) => loadPage(index + 2),
  ));
  return mergeById(first[itemKey] || [], ...remaining.map((result) => result[itemKey] || []));
}

function matchesEitherLanguage(item, field, query) {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return true;
  return [item?.[field], item?.[`${field}_en`]].some((value) => (
    String(value || '').toLocaleLowerCase().includes(search)
  ));
}

function replace(template, values) {
  return Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, value), template);
}

function pathForm(path) {
  if (!path) return emptyPath;
  return {
    ...emptyPath,
    title: path.title || '', title_en: path.title_en || '', description: path.description || '',
    description_en: path.description_en || '', level: path.level || 'beginner',
    status: path.status || 'draft', sort_order: path.sort_order ?? 0,
    // steps are the published courses only; the editor needs every assigned course, so
    // fall back to steps when the detail payload has nothing richer.
    course_ids: (path.steps || []).map((item) => item.id),
  };
}

function pathError(error, c) {
  const labels = { bad_level: c.badLevel, bad_status: c.badStatus, course_not_found: c.courseNotFound };
  return catalogErrorCodes(error).map((code) => labels[code] || code).join(' ');
}

export function PathEditor({ routeParams = {} }) {
  const { language, t } = useAdminLanguage();
  const c = COPY[language];
  const navigate = useNavigate();
  const pathId = routeParams.pathId;
  const editing = Boolean(pathId);
  const [form, setForm] = useState(emptyPath);
  const [courses, setCourses] = useState([]);
  const [courseQuery, setCourseQuery] = useState('');
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  // Selection order is step order — appending on tick is what numbers the steps ١٢٣.
  const toggle = (id) => setForm((current) => ({
    ...current,
    course_ids: current.course_ids.includes(id)
      ? current.course_ids.filter((value) => value !== id)
      : [...current.course_ids, id],
  }));

  const move = (index, delta) => setForm((current) => {
    const next = [...current.course_ids];
    const target = index + delta;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return { ...current, course_ids: next };
  });

  useEffect(() => {
    let active = true;
    Promise.all([
      loadAllPages((page) => api.courses({ page, per_page: 100 }), 'courses'),
      editing ? api.pathGet(pathId) : Promise.resolve(null),
    ]).then(([courseOptions, pathResult]) => {
      if (!active) return;
      setCourses(mergeById(courseOptions, pathResult?.path?.steps || []));
      if (pathResult) setForm(pathForm(pathResult.path));
    }).catch(() => active && setError(c.loadError)).finally(() => active && setLoading(false));
    return () => { active = false; };
    // Language changes update labels in place and must not replace editor state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathId, editing]);

  const byId = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);
  const selected = form.course_ids.map((id) => byId.get(id)).filter(Boolean);
  const filteredCourses = courses.filter((course) => matchesEitherLanguage(course, 'title', courseQuery));

  async function save(event) {
    event.preventDefault();
    if (!form.title.trim()) { setError(c.titleRequired); return; }
    if (!form.course_ids.length) { setError(c.stepsRequired); return; }
    setSaving(true); setError('');
    const body = { ...form, sort_order: Number(form.sort_order || 0) };
    try {
      if (editing) await api.pathUpdate(pathId, body);
      else await api.pathCreate(body);
      navigate('/paths');
    } catch (apiError) { setError(pathError(apiError, c)); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="empty">{c.loading}</div>;
  return <section className="catalog-editor">
    <Link className="back-link" to="/paths"><ArrowLeft size={16} /> {t('common.back')}</Link>
    <div className="catalog-page-header"><h2>{editing ? c.editPath : c.newPath}</h2></div>
    <form onSubmit={save}>
      <section className="catalog-panel"><div className="catalog-form-grid two-columns">
        <Field label={c.arabicTitle}><input value={form.title} onChange={set('title')} /></Field>
        <Field label={c.englishTitle}><input dir="ltr" value={form.title_en} onChange={set('title_en')} /></Field>
        <Field label={c.arabicDescription}><textarea value={form.description} onChange={set('description')} /></Field>
        <Field label={c.englishDescription}><textarea dir="ltr" value={form.description_en} onChange={set('description_en')} /></Field>
      </div></section>
      <section className="catalog-panel"><div className="catalog-form-grid">
        <Field label={c.level}><select value={form.level} onChange={set('level')}>{PATH_LEVELS.map((level) => <option key={level} value={level}>{t(`paths.level.${level}`)}</option>)}</select></Field>
        <Field label={c.status}><select value={form.status} onChange={set('status')}>{CATALOG_STATUSES.map((status) => <option key={status} value={status}>{t(`catalog.status.${status}`)}</option>)}</select></Field>
        <Field label={c.sortOrder}><input type="number" min="0" value={form.sort_order} onChange={set('sort_order')} /></Field>
      </div></section>
      <div className="bundle-content-grid">
        <section className="catalog-panel"><h3>{c.courses}</h3>
          <input className="catalog-search" type="search" placeholder={c.searchCourses} aria-label={c.searchCourses} value={courseQuery} onChange={(event) => setCourseQuery(event.target.value)} />
          <div className="catalog-selector">
            {filteredCourses.map((course) => <label key={course.id}>
              <input type="checkbox" checked={form.course_ids.includes(course.id)} onChange={() => toggle(course.id)} />
              <span><strong>{localizedCatalogValue(course, 'title', language)}</strong><small>{t(`catalog.status.${course.status}`)}</small></span>
            </label>)}
          </div>
        </section>
        <section className="catalog-panel"><h3>{c.selectedSteps}</h3>
          <ol className="catalog-selector">
            {selected.map((course, index) => <li key={course.id}>
              <span><strong>{index + 1}. {localizedCatalogValue(course, 'title', language)}</strong></span>
              <button className="btn btn-tonal btn-sm" type="button" aria-label={c.moveUp} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
              <button className="btn btn-tonal btn-sm" type="button" aria-label={c.moveDown} disabled={index === selected.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
            </li>)}
            {!selected.length && <li className="empty">{c.stepsRequired}</li>}
          </ol>
          <p className="catalog-warning">{c.draftNote}</p>
        </section>
      </div>
      <ErrText>{error}</ErrText>
      <div className="catalog-form-actions"><button className="btn btn-filled" type="submit" disabled={saving}><Save size={16} /> {c.save}</button><Link className="btn btn-text" to="/paths">{c.cancel}</Link></div>
    </form>
  </section>;
}

function PathList() {
  const { language, t } = useAdminLanguage();
  const c = COPY[language];
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  async function load() {
    try { setRows((await api.paths()).paths || []); }
    catch { setError(c.loadError); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  async function togglePublish(path) {
    try { await api.pathUpdate(path.id, { status: path.status === 'published' ? 'unpublished' : 'published' }); await load(); }
    catch (apiError) { toast.error(pathError(apiError, c)); }
  }
  async function remove(path) {
    if (!await confirmDialog(c.deleteConfirm)) return;
    try { await api.pathDelete(path.id); await load(); }
    catch (apiError) { toast.error(pathError(apiError, c)); }
  }
  return <section>
    <div className="catalog-page-header"><h2>{c.paths}</h2><Link className="btn btn-filled" to="/paths/new"><Plus size={16} /> {c.newPath}</Link></div>
    <ErrText>{error}</ErrText>
    {!rows ? <div className="empty">{c.loading}</div> : <div className="table-scroll"><table className="table">
      <thead><tr><th>{c.title}</th><th>{c.status}</th><th>{c.level}</th><th>{c.steps}</th><th>{c.order}</th><th>{c.actions}</th></tr></thead>
      <tbody>
        {rows.map((path) => <tr key={path.id}>
          <td>{localizedCatalogValue(path, 'title', language)}</td>
          <td><span className={`chip chip-${path.status}`}>{t(`catalog.status.${path.status}`)}</span></td>
          <td>{t(`paths.level.${path.level}`)}</td>
          <td>{replace(c.stepsCount, { count: path.courses_count, minutes: path.total_minutes })}</td>
          <td>{path.sort_order}</td>
          <td className="actions">
            <Link className="btn btn-tonal btn-sm" to={`/paths/${path.id}/edit`}><Pencil size={14} /> {c.edit}</Link>
            <button className="btn btn-tonal btn-sm" type="button" onClick={() => togglePublish(path)}>{path.status === 'published' ? <EyeOff size={14} /> : <Eye size={14} />} {path.status === 'published' ? c.unpublish : c.publish}</button>
            <button className="btn btn-error btn-sm" type="button" onClick={() => remove(path)}><Trash2 size={14} /> {c.delete}</button>
          </td>
        </tr>)}
        {!rows.length && <tr><td className="empty" colSpan="6">{c.noPaths}</td></tr>}
      </tbody>
    </table></div>}
  </section>;
}

export default function Paths({ routeParams = {} }) {
  const location = useLocation();
  if (location.pathname.endsWith('/new') || location.pathname.endsWith('/edit')) return <PathEditor routeParams={routeParams} />;
  return <PathList />;
}
