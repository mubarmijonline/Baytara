import { ArrowLeft, Eye, EyeOff, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { ACCESS_TYPES, CATALOG_STATUSES, catalogErrorCodes, localizedCatalogValue } from '../catalog.js';
import { confirmDialog } from '../dialog.jsx';
import { useAdminLanguage } from '../i18n.jsx';
import { toast } from '../toast.jsx';
import { ErrText, Field } from '../ui.jsx';

const COPY = {
  ar: {
    bundles: 'الحزم التعليمية', newBundle: 'حزمة جديدة', editBundle: 'تعديل الحزمة', loading: 'جارٍ التحميل…',
    title: 'العنوان', status: 'الحالة', access: 'الوصول', price: 'سعر الحزمة', contents: 'المحتوى', actions: 'الإجراءات',
    courses: 'الدورات', videos: 'الفيديوهات المستقلة', noBundles: 'لا توجد حزم.', edit: 'تعديل', publish: 'نشر',
    unpublish: 'إخفاء', delete: 'حذف', arabicTitle: 'العنوان العربي', englishTitle: 'العنوان الإنجليزي',
    arabicDescription: 'الوصف العربي', englishDescription: 'الوصف الإنجليزي', accessType: 'نوع الوصول',
    packagePrice: 'سعر الحزمة', currency: 'العملة', accessDays: 'مدة الوصول بالأيام', lifetime: 'مدى الحياة',
    listTotal: 'إجمالي أسعار المحتوى', save: 'حفظ الحزمة', cancel: 'إلغاء', searchCourses: 'البحث في الدورات',
    searchVideos: 'البحث في الفيديوهات', selectContent: 'اختر دورة أو فيديو واحداً على الأقل.',
    titleRequired: 'العنوان العربي مطلوب.', duplicate: '{video} مضمن بالفعل من خلال {course}.',
    courseMismatch: 'إحدى الدورات المحددة لا تناسب جمهور هذه الحزمة.', videoMismatch: 'أحد الفيديوهات المحددة لا يناسب جمهور هذه الحزمة.',
    contentRequired: 'يجب أن تحتوي الحزمة على دورة أو فيديو واحد على الأقل.', positivePrice: 'الحزمة المدفوعة تتطلب سعراً أكبر من صفر.',
    deleteConfirm: 'حذف هذه الحزمة؟', loadError: 'تعذّر تحميل بيانات الحزمة.',
  },
  en: {
    bundles: 'Bundles', newBundle: 'New bundle', editBundle: 'Edit bundle', loading: 'Loading…', title: 'Title',
    status: 'Status', access: 'Access', price: 'Package price', contents: 'Contents', actions: 'Actions', courses: 'Courses',
    videos: 'Standalone videos', noBundles: 'No bundles found.', edit: 'Edit', publish: 'Publish', unpublish: 'Unpublish',
    delete: 'Delete', arabicTitle: 'Arabic title', englishTitle: 'English title', arabicDescription: 'Arabic description',
    englishDescription: 'English description', accessType: 'Access type', packagePrice: 'Package price', currency: 'Currency',
    accessDays: 'Access duration in days', lifetime: 'Lifetime', listTotal: 'Total list price', save: 'Save bundle',
    cancel: 'Cancel', searchCourses: 'Search courses', searchVideos: 'Search videos',
    selectContent: 'Choose at least one course or standalone video.', titleRequired: 'Arabic title is required.',
    duplicate: '{video} is already included through {course}.',
    courseMismatch: 'A selected course is not compatible with this package audience.',
    videoMismatch: 'A selected video is not compatible with this package audience.',
    contentRequired: 'A bundle must contain at least one course or video.',
    positivePrice: 'Paid bundles require a positive price.', deleteConfirm: 'Delete this bundle?', loadError: 'Unable to load bundle details.',
  },
};

const emptyBundle = {
  title: '', title_en: '', description: '', description_en: '', access_type: 'general', price: '0',
  currency: 'EGP', access_days: '', status: 'draft', course_ids: [], video_ids: [],
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

function bundleForm(bundle) {
  if (!bundle) return emptyBundle;
  return {
    ...emptyBundle,
    title: bundle.title || '', title_en: bundle.title_en || '', description: bundle.description || '',
    description_en: bundle.description_en || '', access_type: bundle.access_type || 'general',
    price: String(bundle.price ?? 0), currency: bundle.currency || 'EGP', access_days: bundle.access_days ?? '',
    status: bundle.status || 'draft', course_ids: (bundle.courses || []).map((item) => item.id),
    video_ids: (bundle.videos || []).map((item) => item.id),
  };
}

function payload(form) {
  return {
    ...form,
    price: Number(form.price || 0),
    access_days: form.access_days === '' ? null : Number(form.access_days),
  };
}

function replace(template, values) {
  return Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, value), template);
}

function bundleError(error, copy) {
  const labels = {
    bundle_course_access_mismatch: copy.courseMismatch,
    bundle_video_access_mismatch: copy.videoMismatch,
    bundle_content_required: copy.contentRequired,
    positive_price_required: copy.positivePrice,
  };
  return catalogErrorCodes(error).map((code) => labels[code] || code).join(' ');
}

export function BundleEditor({ routeParams = {} }) {
  const { language, t } = useAdminLanguage();
  const c = COPY[language];
  const navigate = useNavigate();
  const bundleId = routeParams.bundleId;
  const editing = Boolean(bundleId);
  const [form, setForm] = useState(emptyBundle);
  const [courses, setCourses] = useState([]);
  const [videos, setVideos] = useState([]);
  const [courseQuery, setCourseQuery] = useState('');
  const [videoQuery, setVideoQuery] = useState('');
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const toggle = (key, id) => setForm((current) => ({
    ...current, [key]: current[key].includes(id) ? current[key].filter((value) => value !== id) : [...current[key], id],
  }));

  useEffect(() => {
    let active = true;
    Promise.all([
      loadAllPages((page) => api.courses({ page, per_page: 100 }), 'courses'),
      loadAllPages((page) => api.catalogVideos({ page, per_page: 100 }), 'items'),
      editing ? api.bundleGet(bundleId) : Promise.resolve(null),
    ]).then(([courseOptions, videoOptions, bundleResult]) => {
      if (!active) return;
      setCourses(mergeById(courseOptions, bundleResult?.bundle?.courses || []));
      setVideos(mergeById(videoOptions, bundleResult?.bundle?.videos || []));
      if (bundleResult) setForm(bundleForm(bundleResult.bundle));
    }).catch(() => active && setError(c.loadError)).finally(() => active && setLoading(false));
    return () => { active = false; };
    // Language changes update labels in place and must not replace editor state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleId, editing]);

  const selectedCourses = useMemo(() => courses.filter((course) => form.course_ids.includes(course.id)), [courses, form.course_ids]);
  const selectedVideos = useMemo(() => videos.filter((video) => form.video_ids.includes(video.id)), [videos, form.video_ids]);
  const total = useMemo(() => [...selectedCourses, ...selectedVideos].reduce((sum, item) => sum + Number(item.price || 0), 0), [selectedCourses, selectedVideos]);
  const duplicates = useMemo(() => selectedVideos.flatMap((video) => {
    const covering = (video.courses || []).find((course) => form.course_ids.includes(course.id));
    return covering ? [{ video, course: selectedCourses.find((course) => course.id === covering.id) || covering }] : [];
  }), [selectedVideos, selectedCourses, form.course_ids]);
  const filteredCourses = courses.filter((course) => matchesEitherLanguage(course, 'title', courseQuery));
  const filteredVideos = videos.filter((video) => matchesEitherLanguage(video, 'title', videoQuery));

  async function save(event) {
    event.preventDefault();
    if (!form.title.trim()) { setError(c.titleRequired); return; }
    if (!form.course_ids.length && !form.video_ids.length) { setError(c.selectContent); return; }
    setSaving(true); setError('');
    try {
      if (editing) await api.bundleUpdate(bundleId, payload(form));
      else await api.bundleCreate(payload(form));
      navigate('/bundles');
    } catch (apiError) { setError(bundleError(apiError, c)); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="empty">{c.loading}</div>;
  return <section className="catalog-editor bundle-editor">
    <Link className="back-link" to="/bundles"><ArrowLeft size={16} /> {t('common.back')}</Link>
    <div className="catalog-page-header"><h2>{editing ? c.editBundle : c.newBundle}</h2></div>
    <form onSubmit={save}>
      <section className="catalog-panel"><div className="catalog-form-grid two-columns">
        <Field label={c.arabicTitle}><input value={form.title} onChange={set('title')} /></Field>
        <Field label={c.englishTitle}><input dir="ltr" value={form.title_en} onChange={set('title_en')} /></Field>
        <Field label={c.arabicDescription}><textarea value={form.description} onChange={set('description')} /></Field>
        <Field label={c.englishDescription}><textarea dir="ltr" value={form.description_en} onChange={set('description_en')} /></Field>
      </div></section>
      <section className="catalog-panel"><div className="catalog-form-grid">
        <Field label={c.accessType}><select value={form.access_type} onChange={set('access_type')}>{ACCESS_TYPES.map((access) => <option key={access} value={access}>{t(`catalog.access.${access}`)}</option>)}</select></Field>
        <Field label={c.status}><select value={form.status} onChange={set('status')}>{CATALOG_STATUSES.map((status) => <option key={status} value={status}>{t(`catalog.status.${status}`)}</option>)}</select></Field>
        <Field label={c.packagePrice}><input type="number" min="0" value={form.price} disabled={!['baytarian', 'general'].includes(form.access_type)} onChange={set('price')} /></Field>
        <Field label={c.currency}><input dir="ltr" maxLength="3" value={form.currency} onChange={set('currency')} /></Field>
        <Field label={c.accessDays}><input type="number" min="1" placeholder={c.lifetime} value={form.access_days} onChange={set('access_days')} /></Field>
      </div></section>
      <div className="bundle-content-grid">
        <section className="catalog-panel"><h3>{c.courses}</h3><input className="catalog-search" type="search" placeholder={c.searchCourses} aria-label={c.searchCourses} value={courseQuery} onChange={(event) => setCourseQuery(event.target.value)} /><div className="catalog-selector">
          {filteredCourses.map((course) => <label key={course.id}><input type="checkbox" checked={form.course_ids.includes(course.id)} onChange={() => toggle('course_ids', course.id)} /><span><strong>{localizedCatalogValue(course, 'title', language)}</strong><small>{t(`catalog.access.${course.access_type}`)} · {course.price} {course.currency}</small></span></label>)}
        </div></section>
        <section className="catalog-panel"><h3>{c.videos}</h3><input className="catalog-search" type="search" placeholder={c.searchVideos} aria-label={c.searchVideos} value={videoQuery} onChange={(event) => setVideoQuery(event.target.value)} /><div className="catalog-selector">
          {filteredVideos.map((video) => <label key={video.id}><input type="checkbox" checked={form.video_ids.includes(video.id)} onChange={() => toggle('video_ids', video.id)} /><span><strong>{localizedCatalogValue(video, 'title', language)}</strong><small>{t(`catalog.access.${video.access_type}`)} · {video.price} {video.currency}</small></span></label>)}
        </div></section>
      </div>
      <section className="bundle-summary"><span>{c.listTotal}</span><strong>{total} {form.currency}</strong></section>
      {duplicates.map(({ video, course }) => <p className="catalog-warning" key={`${video.id}-${course.id}`}>{replace(c.duplicate, { video: localizedCatalogValue(video, 'title', language), course: localizedCatalogValue(course, 'title', language) })}</p>)}
      <ErrText>{error}</ErrText>
      <div className="catalog-form-actions"><button className="btn btn-filled" type="submit" disabled={saving}><Save size={16} /> {c.save}</button><Link className="btn btn-text" to="/bundles">{c.cancel}</Link></div>
    </form>
  </section>;
}

function BundleList() {
  const { language, t } = useAdminLanguage();
  const c = COPY[language];
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  async function load() {
    try { setRows((await api.bundles()).bundles || []); }
    catch { setError(c.loadError); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  async function togglePublish(bundle) {
    try { await api.bundleUpdate(bundle.id, { status: bundle.status === 'published' ? 'unpublished' : 'published' }); await load(); }
    catch (apiError) { toast.error(bundleError(apiError, c)); }
  }
  async function remove(bundle) {
    if (!await confirmDialog(c.deleteConfirm)) return;
    try { await api.bundleDelete(bundle.id); await load(); }
    catch (apiError) { toast.error(bundleError(apiError, c)); }
  }
  return <section><div className="catalog-page-header"><h2>{c.bundles}</h2><Link className="btn btn-filled" to="/bundles/new"><Plus size={16} /> {c.newBundle}</Link></div><ErrText>{error}</ErrText>
    {!rows ? <div className="empty">{c.loading}</div> : <div className="table-scroll"><table className="table"><thead><tr><th>{c.title}</th><th>{c.status}</th><th>{c.access}</th><th>{c.price}</th><th>{c.contents}</th><th>{c.actions}</th></tr></thead><tbody>
      {rows.map((bundle) => <tr key={bundle.id}><td>{localizedCatalogValue(bundle, 'title', language)}</td><td><span className={`chip chip-${bundle.status}`}>{t(`catalog.status.${bundle.status}`)}</span></td><td>{t(`catalog.access.${bundle.access_type}`)}</td><td>{bundle.price} {bundle.currency}</td><td>{bundle.courses?.length || 0} {c.courses} · {bundle.videos?.length || 0} {c.videos}</td><td className="actions"><Link className="btn btn-tonal btn-sm" to={`/bundles/${bundle.id}/edit`}><Pencil size={14} /> {c.edit}</Link><button className="btn btn-tonal btn-sm" type="button" onClick={() => togglePublish(bundle)}>{bundle.status === 'published' ? <EyeOff size={14} /> : <Eye size={14} />} {bundle.status === 'published' ? c.unpublish : c.publish}</button><button className="btn btn-error btn-sm" type="button" onClick={() => remove(bundle)}><Trash2 size={14} /> {c.delete}</button></td></tr>)}
      {!rows.length && <tr><td className="empty" colSpan="6">{c.noBundles}</td></tr>}
    </tbody></table></div>}
  </section>;
}

export default function Bundles({ routeParams = {} }) {
  const location = useLocation();
  if (location.pathname.endsWith('/new') || location.pathname.endsWith('/edit')) return <BundleEditor routeParams={routeParams} />;
  return <BundleList />;
}
