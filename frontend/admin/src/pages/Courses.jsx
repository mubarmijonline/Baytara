import { ArrowLeft, Eye, EyeOff, ListVideo, Pencil, Plus, Save, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import {
  ACCESS_TYPES, CATALOG_STATUSES, catalogErrorCodes, localizedCatalogValue, orderedCategories,
} from '../catalog.js';
import { confirmDialog } from '../dialog.jsx';
import { useAdminLanguage } from '../i18n.jsx';
import { toast } from '../toast.jsx';
import { ErrText, Field } from '../ui.jsx';

const COPY = {
  ar: {
    courses: 'الدورات', newCourse: 'دورة جديدة', editCourse: 'تعديل الدورة', search: 'بحث في الدورات',
    allStatuses: 'كل الحالات', title: 'العنوان', instructor: 'المدرّب', category: 'الفئة', access: 'الوصول',
    price: 'السعر', enrolled: 'المسجّلون', actions: 'الإجراءات', noCourses: 'لا توجد دورات.', loading: 'جارٍ التحميل…',
    content: 'المحتوى', edit: 'تعديل', publish: 'نشر', unpublish: 'إخفاء', delete: 'حذف',
    arabicTitle: 'العنوان العربي', englishTitle: 'العنوان الإنجليزي', arabicDescription: 'الوصف العربي',
    englishDescription: 'الوصف الإنجليزي', chooseInstructor: 'اختر المدرّب', chooseCategory: 'اختر الفئة',
    status: 'الحالة', accessType: 'نوع الوصول', currency: 'العملة', accessDays: 'مدة الوصول بالأيام',
    lifetime: 'مدى الحياة', save: 'حفظ الدورة', cancel: 'إلغاء', titleRequired: 'العنوان العربي مطلوب.',
    instructorRequired: 'اختر مدرّباً.', categoryPublished: 'الفئة مطلوبة قبل نشر الدورة.',
    deleteConfirm: 'حذف هذه الدورة؟', loadError: 'تعذّر تحميل بيانات الدورة.',
  },
  en: {
    courses: 'Courses', newCourse: 'New course', editCourse: 'Edit course', search: 'Search courses',
    allStatuses: 'All statuses', title: 'Title', instructor: 'Instructor', category: 'Category', access: 'Access',
    price: 'Price', enrolled: 'Enrolled', actions: 'Actions', noCourses: 'No courses found.', loading: 'Loading…',
    content: 'Content', edit: 'Edit', publish: 'Publish', unpublish: 'Unpublish', delete: 'Delete',
    arabicTitle: 'Arabic title', englishTitle: 'English title', arabicDescription: 'Arabic description',
    englishDescription: 'English description', chooseInstructor: 'Choose instructor', chooseCategory: 'Choose category',
    status: 'Status', accessType: 'Access type', currency: 'Currency', accessDays: 'Access duration in days',
    lifetime: 'Lifetime', save: 'Save course', cancel: 'Cancel', titleRequired: 'Arabic title is required.',
    instructorRequired: 'Choose an instructor.', categoryPublished: 'Choose a category before publishing.',
    deleteConfirm: 'Delete this course?', loadError: 'Unable to load course details.',
  },
};

const emptyCourse = {
  title: '', title_en: '', description: '', description_en: '', instructor_id: '', category_id: '',
  access_type: 'general', price: '0', currency: 'EGP', access_days: '', status: 'draft',
};

function courseForm(course) {
  if (!course) return emptyCourse;
  return {
    ...emptyCourse,
    title: course.title || '', title_en: course.title_en || '',
    description: course.description || '', description_en: course.description_en || '',
    instructor_id: course.instructor?.id || '', category_id: course.category?.id || '',
    access_type: course.access_type || 'general', price: String(course.price ?? 0),
    currency: course.currency || 'EGP', access_days: course.access_days ?? '', status: course.status || 'draft',
  };
}

function payload(form) {
  return {
    ...form,
    instructor_id: Number(form.instructor_id),
    category_id: form.category_id ? Number(form.category_id) : null,
    price: Number(form.price || 0),
    access_days: form.access_days === '' ? null : Number(form.access_days),
  };
}

function errorMessage(error, language) {
  const labels = {
    title_required: language === 'en' ? 'Arabic title is required.' : 'العنوان العربي مطلوب.',
    valid_instructor_required: language === 'en' ? 'Choose a valid instructor.' : 'اختر مدرّباً صحيحاً.',
    category_required: language === 'en' ? 'Choose a category before publishing.' : 'اختر الفئة قبل النشر.',
    positive_price_required: language === 'en' ? 'Paid access requires a positive price.' : 'الوصول المدفوع يتطلب سعراً أكبر من صفر.',
  };
  return catalogErrorCodes(error).map((code) => labels[code] || code).join(' ');
}

export function CourseEditor({ routeParams = {} }) {
  const { language, t } = useAdminLanguage();
  const c = COPY[language];
  const navigate = useNavigate();
  const courseId = routeParams.courseId;
  const editing = Boolean(courseId);
  const [form, setForm] = useState(emptyCourse);
  const [instructors, setInstructors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  useEffect(() => {
    let active = true;
    Promise.all([
      api.users({ role: 'instructor' }),
      api.categories(),
      editing ? api.course(courseId) : Promise.resolve(null),
    ]).then(([usersResult, categoryResult, courseResult]) => {
      if (!active) return;
      const nextInstructors = usersResult.users || [];
      setInstructors(nextInstructors);
      setCategories(orderedCategories(categoryResult.categories || []));
      setForm(courseResult ? courseForm(courseResult.course) : {
        ...emptyCourse, instructor_id: nextInstructors[0]?.id || '',
      });
    }).catch(() => active && setError(c.loadError)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [courseId, editing]);

  async function save(event) {
    event.preventDefault();
    if (!form.title.trim()) { setError(c.titleRequired); return; }
    if (!form.instructor_id) { setError(c.instructorRequired); return; }
    if (form.status === 'published' && !form.category_id) { setError(c.categoryPublished); return; }
    setSaving(true); setError('');
    try {
      if (editing) {
        await api.courseUpdate(courseId, payload(form));
        navigate('/courses');
      } else {
        const result = await api.courseCreate(payload(form));
        navigate(`/courses/${result.course.id}/content`);
      }
    } catch (apiError) { setError(errorMessage(apiError, language)); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="empty">{c.loading}</div>;
  return <section className="catalog-editor">
    <Link className="back-link" to="/courses"><ArrowLeft size={16} /> {t('common.back')}</Link>
    <div className="catalog-page-header"><div><h2>{editing ? c.editCourse : c.newCourse}</h2></div></div>
    <form onSubmit={save}>
      <section className="catalog-panel">
        <div className="catalog-form-grid two-columns">
          <Field label={c.arabicTitle}><input value={form.title} onChange={set('title')} /></Field>
          <Field label={c.englishTitle}><input dir="ltr" value={form.title_en} onChange={set('title_en')} /></Field>
          <Field label={c.arabicDescription}><textarea value={form.description} onChange={set('description')} /></Field>
          <Field label={c.englishDescription}><textarea dir="ltr" value={form.description_en} onChange={set('description_en')} /></Field>
        </div>
      </section>
      <section className="catalog-panel">
        <div className="catalog-form-grid">
          <Field label={c.instructor}><select value={form.instructor_id} onChange={set('instructor_id')}><option value="">{c.chooseInstructor}</option>{instructors.map((instructor) => <option key={instructor.id} value={instructor.id}>{instructor.name}</option>)}</select></Field>
          <Field label={c.category}><select value={form.category_id} onChange={set('category_id')}><option value="">{c.chooseCategory}</option>{categories.map((category) => <option key={category.id} value={category.id}>{localizedCatalogValue(category, 'name', language)}</option>)}</select></Field>
          <Field label={c.accessType}><select value={form.access_type} onChange={set('access_type')}>{ACCESS_TYPES.map((access) => <option key={access} value={access}>{t(`catalog.access.${access}`)}</option>)}</select></Field>
          <Field label={c.status}><select value={form.status} onChange={set('status')}>{CATALOG_STATUSES.map((status) => <option key={status} value={status}>{t(`catalog.status.${status}`)}</option>)}</select></Field>
          <Field label={c.price}><input type="number" min="0" value={form.price} disabled={!['baytarian', 'general'].includes(form.access_type)} onChange={set('price')} /></Field>
          <Field label={c.currency}><input dir="ltr" maxLength="3" value={form.currency} onChange={set('currency')} /></Field>
          <Field label={c.accessDays}><input type="number" min="1" placeholder={c.lifetime} value={form.access_days} onChange={set('access_days')} /></Field>
        </div>
      </section>
      <ErrText>{error}</ErrText>
      <div className="catalog-form-actions">
        <button className="btn btn-filled" type="submit" disabled={saving}><Save size={16} /> {c.save}</button>
        <Link className="btn btn-text" to="/courses">{c.cancel}</Link>
      </div>
    </form>
  </section>;
}

function CourseList() {
  const { language, t } = useAdminLanguage();
  const c = COPY[language];
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const visibleRows = useMemo(() => rows || [], [rows]);

  async function load() {
    setError('');
    try { setRows((await api.courses({ status, q: query })).courses || []); }
    catch { setError(language === 'en' ? 'Unable to load courses.' : 'تعذّر تحميل الدورات.'); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  async function togglePublish(course) {
    try { await api.courseUpdate(course.id, { status: course.status === 'published' ? 'unpublished' : 'published' }); await load(); }
    catch (error) { toast.error(errorMessage(error, language)); }
  }
  async function remove(course) {
    if (!await confirmDialog(c.deleteConfirm)) return;
    try { await api.courseDelete(course.id); await load(); }
    catch (error) { toast.error(errorMessage(error, language)); }
  }

  return <section>
    <div className="catalog-page-header"><h2>{c.courses}</h2><Link className="btn btn-filled" to="/courses/new"><Plus size={16} /> {c.newCourse}</Link></div>
    <div className="toolbar">
      <select aria-label={c.allStatuses} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">{c.allStatuses}</option>{CATALOG_STATUSES.map((item) => <option key={item} value={item}>{t(`catalog.status.${item}`)}</option>)}</select>
      <input type="search" aria-label={c.search} placeholder={c.search} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && load()} />
      <button className="btn btn-tonal btn-sm" type="button" onClick={load}><Search size={15} /> {t('common.search')}</button>
    </div>
    <ErrText>{error}</ErrText>
    {!rows ? <div className="empty">{c.loading}</div> : <div className="table-scroll"><table className="table"><thead><tr><th>{c.title}</th><th>{c.category}</th><th>{c.access}</th><th>{c.price}</th><th>{c.instructor}</th><th>{c.enrolled}</th><th>{c.actions}</th></tr></thead><tbody>
      {visibleRows.map((course) => <tr key={course.id}>
        <td><strong>{localizedCatalogValue(course, 'title', language)}</strong><br /><span className={`chip chip-${course.status}`}>{t(`catalog.status.${course.status}`)}</span></td>
        <td>{localizedCatalogValue(course.category, 'name', language) || '—'}</td>
        <td>{t(`catalog.access.${course.access_type}`)}</td>
        <td>{course.is_paid ? `${course.price} ${course.currency}` : '—'}</td>
        <td>{course.instructor?.name || '—'}</td><td>{course.enrolled_count ?? 0}</td>
        <td className="actions">
          <Link className="btn btn-tonal btn-sm" to={`/courses/${course.id}/content`}><ListVideo size={14} /> {c.content}</Link>
          <Link className="btn btn-tonal btn-sm" to={`/courses/${course.id}/edit`}><Pencil size={14} /> {c.edit}</Link>
          <button className="btn btn-tonal btn-sm" type="button" onClick={() => togglePublish(course)}>{course.status === 'published' ? <EyeOff size={14} /> : <Eye size={14} />} {course.status === 'published' ? c.unpublish : c.publish}</button>
          <button className="btn btn-error btn-sm" type="button" onClick={() => remove(course)}><Trash2 size={14} /> {c.delete}</button>
        </td>
      </tr>)}
      {!visibleRows.length && <tr><td colSpan="7" className="empty">{c.noCourses}</td></tr>}
    </tbody></table></div>}
  </section>;
}

export default function Courses({ routeParams = {} }) {
  const location = useLocation();
  if (location.pathname.endsWith('/new') || location.pathname.endsWith('/edit')) {
    return <CourseEditor routeParams={routeParams} />;
  }
  return <CourseList />;
}
