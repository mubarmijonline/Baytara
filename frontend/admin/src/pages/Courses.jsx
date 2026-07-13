import { confirmDialog, promptDialog } from '../dialog.jsx';
import { toast } from '../toast.jsx';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, Field, ErrText, apiError } from '../ui.jsx';

const STATUS = [['', 'كل الحالات'], ['draft', 'مسودة'], ['published', 'منشورة'], ['unpublished', 'غير منشورة']];
const statusLabel = (s) => ({ draft: 'مسودة', published: 'منشورة', unpublished: 'غير منشورة' }[s] || s);

function CourseForm({ course, instructors, categories, onClose, onSaved }) {
  const editing = !!course;
  const [f, setF] = useState({
    title: course?.title || '', description: course?.description || '',
    price: course?.price ?? 0, currency: course?.currency || 'EGP',
    instructor_id: course?.instructor?.id || instructors[0]?.id || '',
    category_id: course?.category?.id || '', status: course?.status || 'draft',
  });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setErr('');
    const body = { ...f, price: Number(f.price), instructor_id: Number(f.instructor_id),
      category_id: f.category_id ? Number(f.category_id) : null };
    try {
      if (editing) await api.courseUpdate(course.id, body);
      else await api.courseCreate(body);
      onSaved();
    } catch (e) { setErr(apiError(e) === 'valid_instructor_required' ? 'اختر مدرّباً صحيحاً.' : apiError(e)); }
  }

  return (
    <Modal title={editing ? 'تعديل دورة' : 'دورة جديدة'} onClose={onClose}>
      <Field label="العنوان"><input value={f.title} onChange={set('title')} /></Field>
      <Field label="الوصف"><input value={f.description} onChange={set('description')} /></Field>
      <div className="row">
        <Field label="السعر"><input type="number" value={f.price} onChange={set('price')} style={{ width: 100 }} /></Field>
        <Field label="العملة"><input value={f.currency} onChange={set('currency')} style={{ width: 80 }} /></Field>
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

function CourseContent({ courseId, onClose }) {
  const [course, setCourse] = useState(null);
  const [err, setErr] = useState('');

  async function load() {
    try { setCourse((await api.course(courseId)).course); }
    catch { setErr('تعذّر التحميل.'); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [courseId]);

  async function addModule() {
    const title = await promptDialog('عنوان الوحدة');
    if (!title) return;
    await api.moduleCreate(courseId, { title, position: (course.modules?.length || 0) });
    load();
  }
  async function editModule(m) { const t = await promptDialog('عنوان الوحدة', m.title); if (t) { await api.moduleUpdate(m.id, { title: t }); load(); } }
  async function delModule(m) { if (await confirmDialog('حذف الوحدة ودروسها؟')) { await api.moduleDelete(m.id); load(); } }
  async function addLesson(m) {
    const title = await promptDialog('عنوان الدرس');
    if (!title) return;
    await api.lessonCreate(m.id, { title, position: (m.lessons?.length || 0) });
    load();
  }
  async function editLesson(l) { const t = await promptDialog('عنوان الدرس', l.title); if (t) { await api.lessonUpdate(l.id, { title: t }); load(); } }
  async function delLesson(l) { if (await confirmDialog('حذف الدرس؟')) { await api.lessonDelete(l.id); load(); } }

  return (
    <Modal title={course ? `محتوى: ${course.title}` : 'المحتوى'} onClose={onClose}>
      <ErrText>{err}</ErrText>
      {!course ? <div className="empty">جارٍ التحميل…</div> : (
        <>
          <button className="btn btn-tonal btn-sm" onClick={addModule} style={{ marginBottom: 12 }}>+ وحدة</button>
          {course.modules.length === 0 && <div className="empty">لا وحدات بعد.</div>}
          {course.modules.map((m) => (
            <div key={m.id} className="card" style={{ padding: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b>{m.title}</b>
                <div className="actions">
                  <button className="btn btn-tonal btn-sm" onClick={() => addLesson(m)}>+ درس</button>
                  <button className="btn btn-tonal btn-sm" onClick={() => editModule(m)}>✎</button>
                  <button className="btn btn-error btn-sm" onClick={() => delModule(m)}>حذف</button>
                </div>
              </div>
              {m.lessons.map((l) => (
                <div key={l.id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                  <span>• {l.title} {l.duration_minutes ? `(${l.duration_minutes}د)` : ''}</span>
                  <div className="actions">
                    <button className="btn btn-text btn-sm" onClick={() => editLesson(l)}>✎</button>
                    <button className="btn btn-text btn-sm" style={{ color: 'var(--error)' }} onClick={() => delLesson(l)}>حذف</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
      <div className="row" style={{ marginTop: 8 }}><button className="btn btn-filled" onClick={onClose}>تم</button></div>
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
          <thead><tr><th>العنوان</th><th>الحالة</th><th>السعر</th><th>المدرّب</th><th>مسجّلون</th><th>إجراءات</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.title}</td>
                <td><span className={`chip chip-${c.status}`}>{statusLabel(c.status)}</span></td>
                <td>{c.price} {c.currency}</td>
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
            {rows.length === 0 && <tr><td colSpan="6" className="empty">لا دورات.</td></tr>}
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
