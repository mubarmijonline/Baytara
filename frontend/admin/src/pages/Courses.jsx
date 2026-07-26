import { confirmDialog, promptDialog } from '../dialog.jsx';
import { toast } from '../toast.jsx';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, Field, ErrText, apiError } from '../ui.jsx';

const STATUS = [['', 'كل الحالات'], ['draft', 'مسودة'], ['published', 'منشورة'], ['unpublished', 'غير منشورة']];
const statusLabel = (s) => ({ draft: 'مسودة', published: 'منشورة', unpublished: 'غير منشورة' }[s] || s);
const ACCESS_TYPES = [
  ['free', 'مجاني — للجميع'],
  ['vet_free', 'مجاني — للأطباء المحاضرين فقط'],
  ['baytarian', 'مدفوع — للأطباء الموثّقين (بيطريّ) فقط'],
  ['general', 'مدفوع — عام للجميع'],
];
const accessLabel = (t) => (ACCESS_TYPES.find(([v]) => v === t) || [t, t])[1];
const isPaidType = (t) => t === 'baytarian' || t === 'general';

function CourseForm({ course, instructors, categories, onClose, onSaved }) {
  const editing = !!course;
  const [f, setF] = useState({
    title: course?.title || '', title_en: course?.title_en || '',
    description: course?.description || '', description_en: course?.description_en || '',
    price: course?.price ?? 0, currency: course?.currency || 'EGP',
    access_type: course?.access_type || 'general',
    access_days: course?.access_days ?? '',
    instructor_id: course?.instructor?.id || instructors[0]?.id || '',
    category_id: course?.category?.id || '', status: course?.status || 'draft',
  });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setErr('');
    const body = { ...f, price: Number(f.price), instructor_id: Number(f.instructor_id),
      category_id: f.category_id ? Number(f.category_id) : null,
      access_days: f.access_days === '' ? null : Number(f.access_days) };
    try {
      if (editing) await api.courseUpdate(course.id, body);
      else await api.courseCreate(body);
      onSaved();
    } catch (e) { setErr(apiError(e) === 'valid_instructor_required' ? 'اختر مدرّباً صحيحاً.' : apiError(e)); }
  }

  return (
    <Modal title={editing ? 'تعديل دورة' : 'دورة جديدة'} onClose={onClose}>
      <Field label="العنوان (عربي)"><input value={f.title} onChange={set('title')} /></Field>
      <Field label="Title (English)"><input dir="ltr" value={f.title_en} onChange={set('title_en')} /></Field>
      <Field label="الوصف (عربي)"><input value={f.description} onChange={set('description')} /></Field>
      <Field label="Description (English)"><input dir="ltr" value={f.description_en} onChange={set('description_en')} /></Field>
      <Field label="نوع الوصول">
        <select value={f.access_type} onChange={set('access_type')}>
          {ACCESS_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <div className="row">
        {isPaidType(f.access_type) && (
          <>
            <Field label="السعر"><input type="number" value={f.price} onChange={set('price')} style={{ width: 100 }} /></Field>
            <Field label="العملة"><input value={f.currency} onChange={set('currency')} style={{ width: 80 }} /></Field>
          </>
        )}
        <Field label="مدة الوصول (أيام)"><input type="number" min="0" placeholder="مدى الحياة" value={f.access_days} onChange={set('access_days')} style={{ width: 130 }} /></Field>
      </div>
      <Field label="المدرّب">
        <select value={f.instructor_id} onChange={set('instructor_id')}>
          <option value="">— اختر —</option>
          {instructors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </Field>
      <Field label="الفئة">
        <select value={f.category_id} onChange={set('category_id')}>
          <option value="">— بدون —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="الحالة">
        <select value={f.status} onChange={set('status')}>
          <option value="draft">مسودة</option>
          <option value="published">منشورة</option>
          <option value="unpublished">غير منشورة</option>
        </select>
      </Field>
      <ErrText>{err}</ErrText>
      <div className="row">
        <button className="btn btn-filled" onClick={save}>حفظ</button>
        <button className="btn btn-text" onClick={onClose}>إلغاء</button>
      </div>
    </Modal>
  );
}

function VideoForm({ courseId, video, onClose, onSaved }) {
  const editing = !!video;
  const [f, setF] = useState({
    title: video?.title || '', title_en: video?.title_en || '',
    vdocipher_video_id: video?.vdocipher_video_id || '', duration_minutes: video?.duration_minutes ?? '',
    is_protected: video?.is_protected ?? true,
  });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setErr('');
    if (!f.title.trim()) { setErr('العنوان مطلوب.'); return; }
    const body = { ...f, duration_minutes: f.duration_minutes === '' ? null : Number(f.duration_minutes) };
    try {
      if (editing) await api.videoUpdate(video.id, body);
      else await api.videoCreate({ ...body, course_id: courseId });
      onSaved();
    } catch (e) { setErr(apiError(e)); }
  }

  return (
    <Modal title={editing ? 'تعديل فيديو' : 'فيديو جديد'} onClose={onClose}>
      <Field label="العنوان (عربي)"><input value={f.title} onChange={set('title')} /></Field>
      <Field label="Title (English)"><input dir="ltr" value={f.title_en} onChange={set('title_en')} /></Field>
      <Field label="VdoCipher Video ID"><input dir="ltr" value={f.vdocipher_video_id} onChange={set('vdocipher_video_id')} placeholder="مُعرّف الفيديو في VdoCipher" /></Field>
      <div className="row">
        <Field label="المدة (دقائق)"><input type="number" min="0" value={f.duration_minutes} onChange={set('duration_minutes')} style={{ width: 120 }} /></Field>
        <Field label="محمي (DRM)">
          <select value={f.is_protected ? '1' : '0'} onChange={(e) => setF({ ...f, is_protected: e.target.value === '1' })}>
            <option value="1">نعم</option><option value="0">لا</option>
          </select>
        </Field>
      </div>
      <ErrText>{err}</ErrText>
      <div className="row"><button className="btn btn-filled" onClick={save}>حفظ</button><button className="btn btn-text" onClick={onClose}>إلغاء</button></div>
    </Modal>
  );
}

function CourseContent({ courseId, onClose }) {
  const [course, setCourse] = useState(null);
  const [vids, setVids] = useState([]);
  const [form, setForm] = useState(undefined); // undefined=closed, null=new, obj=edit
  const [err, setErr] = useState('');

  async function load() {
    try {
      const cr = await api.course(courseId);
      setCourse(cr.course);
      setVids((cr.course.videos || []).slice());
    } catch { setErr('تعذّر التحميل.'); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [courseId]);

  async function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= vids.length) return;
    const next = vids.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setVids(next);  // optimistic
    try { await api.videosReorder(courseId, next.map((v) => v.id)); }
    catch (e) { toast.error(apiError(e)); load(); }
  }
  async function del(v) { if (await confirmDialog('حذف الفيديو؟')) { try { await api.videoDelete(v.id); load(); } catch (e) { toast.error(apiError(e)); } } }

  return (
    <Modal title={course ? `فيديوهات: ${course.title}` : 'الفيديوهات'} onClose={onClose}>
      <ErrText>{err}</ErrText>
      {!course ? <div className="empty">جارٍ التحميل…</div> : (
        <>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>رتّب الفيديوهات بالأسهم ↑ ↓</span>
            <button className="btn btn-filled btn-sm" onClick={() => setForm(null)}>+ فيديو</button>
          </div>
          {vids.length === 0 && <div className="empty">لا فيديوهات بعد.</div>}
          {vids.map((v, i) => (
            <div key={v.id} className="row" style={{ justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <span>
                <b style={{ color: 'var(--muted)' }}>{i + 1}.</b> {v.title}
                {v.duration_minutes ? ` (${v.duration_minutes}د)` : ''}
                {v.has_video ? '' : ' ⚠️ بدون فيديو'}
              </span>
              <div className="actions">
                <button className="btn btn-tonal btn-sm" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="btn btn-tonal btn-sm" disabled={i === vids.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button className="btn btn-tonal btn-sm" onClick={() => setForm(v)}>✎</button>
                <button className="btn btn-error btn-sm" onClick={() => del(v)}>حذف</button>
              </div>
            </div>
          ))}
        </>
      )}
      {form !== undefined && (
        <VideoForm courseId={courseId} video={form} onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); load(); }} />
      )}
      <div className="row" style={{ marginTop: 14 }}><button className="btn btn-filled" onClick={onClose}>تم</button></div>
    </Modal>
  );
}

export default function Courses() {
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [instructors, setInstructors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(undefined); // undefined=closed, null=new, obj=edit
  const [content, setContent] = useState(null); // courseId or null
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try { setRows((await api.courses({ status, q })).courses); }
    catch { setErr('تعذّر التحميل.'); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);
  useEffect(() => {
    api.users({ role: 'instructor' }).then((r) => setInstructors(r.users)).catch(() => {});
    api.categories().then((r) => setCategories(r.categories)).catch(() => {});
  }, []);

  async function togglePublish(c) {
    const next = c.status === 'published' ? 'unpublished' : 'published';
    try { await api.courseUpdate(c.id, { status: next }); load(); }
    catch (e) { toast.error(apiError(e)); }
  }
  async function del(c) {
    if (!await confirmDialog(`حذف «${c.title}» وكل محتواها؟`)) return;
    try { await api.courseDelete(c.id); load(); }
    catch (e) { toast.error(apiError(e)); }
  }

  return (
    <>
      <h2>الدورات</h2>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input placeholder="بحث بالعنوان" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
        <button className="btn btn-tonal btn-sm" onClick={load}>بحث</button>
        <button className="btn btn-filled btn-sm" onClick={() => setForm(null)} disabled={!instructors.length}>+ دورة</button>
        {!instructors.length && <span style={{ color: 'var(--muted)', fontSize: 13 }}>أضف مدرّباً أولاً</span>}
      </div>
      <ErrText>{err}</ErrText>
      {!rows ? <div className="empty">جارٍ التحميل…</div> : (
        <table className="table">
          <thead><tr><th>العنوان</th><th>الحالة</th><th>النوع</th><th>السعر</th><th>المدرّب</th><th>مسجّلون</th><th>إجراءات</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.title}</td>
                <td><span className={`chip chip-${c.status}`}>{statusLabel(c.status)}</span></td>
                <td style={{ fontSize: 12 }}>{accessLabel(c.access_type)}</td>
                <td>{c.is_paid ? `${c.price} ${c.currency}` : '—'}</td>
                <td>{c.instructor?.name || '—'}</td>
                <td>{c.enrolled_count}</td>
                <td className="actions">
                  <button className="btn btn-tonal btn-sm" onClick={() => setContent(c.id)}>المحتوى</button>
                  <button className="btn btn-tonal btn-sm" onClick={() => setForm(c)}>تعديل</button>
                  <button className="btn btn-tonal btn-sm" onClick={() => togglePublish(c)}>{c.status === 'published' ? 'إخفاء' : 'نشر'}</button>
                  <button className="btn btn-error btn-sm" onClick={() => del(c)}>حذف</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="7" className="empty">لا دورات.</td></tr>}
          </tbody>
        </table>
      )}
      {form !== undefined && (
        <CourseForm course={form} instructors={instructors} categories={categories}
          onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); load(); }} />
      )}
      {content && <CourseContent courseId={content} onClose={() => { setContent(null); load(); }} />}
    </>
  );
}
