import { toast } from '../toast.jsx';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, Field, ErrText, apiError } from '../ui.jsx';

const statusLabel = (s) => ({ draft: 'مسودة', published: 'منشورة', unpublished: 'غير منشورة' }[s] || s);

function CourseForm({ course, categories, onClose, onSaved }) {
  const editing = !!course;
  const [f, setF] = useState({
    title: course?.title || '', description: course?.description || '', price: course?.price ?? 0,
    currency: course?.currency || 'EGP', category_id: course?.category?.id || '', status: course?.status || 'draft',
  });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setErr('');
    const body = { ...f, price: Number(f.price), category_id: f.category_id ? Number(f.category_id) : null };
    try { editing ? await api.courseUpdate(course.id, body) : await api.courseCreate(body); onSaved(); }
    catch (e) { setErr(apiError(e)); }
  }
  return (
    <Modal title={editing ? 'تعديل دورة' : 'دورة جديدة'} onClose={onClose}>
      <Field label="العنوان"><input value={f.title} onChange={set('title')} /></Field>
      <Field label="الوصف"><input value={f.description} onChange={set('description')} /></Field>
      <div className="row">
        <Field label="السعر"><input type="number" value={f.price} onChange={set('price')} style={{ width: 100 }} /></Field>
        <Field label="العملة"><input value={f.currency} onChange={set('currency')} style={{ width: 80 }} /></Field>
      </div>
      <Field label="الفئة">
        <select value={f.category_id} onChange={set('category_id')}>
          <option value="">— بدون —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="الحالة">
        <select value={f.status} onChange={set('status')}>
          <option value="draft">مسودة</option><option value="published">منشورة</option><option value="unpublished">غير منشورة</option>
        </select>
      </Field>
      <ErrText>{err}</ErrText>
      <div className="row"><button className="btn btn-filled" onClick={save}>حفظ</button><button className="btn btn-text" onClick={onClose}>إلغاء</button></div>
    </Modal>
  );
}

function CourseContent({ courseId, perms, onClose }) {
  const [course, setCourse] = useState(null);
  const [err, setErr] = useState('');
  const load = () => api.course(courseId).then((r) => setCourse(r.course)).catch(() => setErr('تعذّر التحميل.'));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [courseId]);

  async function addModule() { const t = prompt('عنوان الوحدة'); if (t) { await api.moduleCreate(courseId, { title: t }); load(); } }
  async function delModule(m) { if (confirm('حذف الوحدة؟')) { await api.moduleDelete(m.id); load(); } }
  async function addLesson(m) { const t = prompt('عنوان الدرس'); if (t) { await api.lessonCreate(m.id, { title: t }); load(); } }
  async function delLesson(l) { if (confirm('حذف الدرس؟')) { await api.lessonDelete(l.id); load(); } }
  async function setVideo(l) {
    const v = prompt('معرّف فيديو VdoCipher', l.has_video ? '(موجود)' : '');
    if (v === null) return;
    try { await api.lessonUpdate(l.id, { vdocipher_video_id: v || null }); load(); }
    catch (e) {
      const er = apiError(e);
      toast.error(er === 'video_add_forbidden' ? 'غير مصرّح لك بإضافة فيديو.'
        : er === 'video_edit_forbidden' ? 'غير مصرّح لك بتعديل الفيديو.'
        : er === 'video_delete_forbidden' ? 'غير مصرّح لك بحذف الفيديو.' : er);
    }
  }

  return (
    <Modal title={course ? `محتوى: ${course.title}` : 'المحتوى'} onClose={onClose}>
      <ErrText>{err}</ErrText>
      {!course ? <div className="empty">جارٍ التحميل…</div> : (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className="btn btn-tonal btn-sm" onClick={addModule}>+ وحدة</button>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              الصلاحيات: إضافة {perms.can_add_video ? '✓' : '✗'} · تعديل {perms.can_edit_video ? '✓' : '✗'} · حذف {perms.can_delete_video ? '✓' : '✗'}
            </span>
          </div>
          {course.modules.length === 0 && <div className="empty">لا وحدات بعد.</div>}
          {course.modules.map((m) => (
            <div key={m.id} className="card" style={{ padding: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b>{m.title}</b>
                <div className="actions">
                  <button className="btn btn-tonal btn-sm" onClick={() => addLesson(m)}>+ درس</button>
                  <button className="btn btn-error btn-sm" onClick={() => delModule(m)}>حذف</button>
                </div>
              </div>
              {m.lessons.map((l) => (
                <div key={l.id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                  <span>• {l.title} {l.has_video ? <span className="chip chip-ok">فيديو</span> : ''}</span>
                  <div className="actions">
                    <button className="btn btn-text btn-sm" onClick={() => setVideo(l)}>🎬 فيديو</button>
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
  const [categories, setCategories] = useState([]);
  const [perms, setPerms] = useState({});
  const [form, setForm] = useState(undefined);
  const [content, setContent] = useState(null);
  const [err, setErr] = useState('');

  const load = () => api.courses().then((r) => setRows(r.courses)).catch(() => setErr('تعذّر التحميل.'));
  useEffect(() => {
    load();
    api.categories().then((r) => setCategories(r.categories)).catch(() => {});
    api.permissions().then(setPerms).catch(() => {});
  }, []);

  async function togglePublish(c) {
    try { await api.courseUpdate(c.id, { status: c.status === 'published' ? 'unpublished' : 'published' }); load(); }
    catch (e) { toast.error(apiError(e)); }
  }
  async function del(c) { if (confirm(`حذف «${c.title}»؟`)) { try { await api.courseDelete(c.id); load(); } catch (e) { toast.error(apiError(e)); } } }

  return (
    <>
      <h2>دوراتي</h2>
      <div className="toolbar"><button className="btn btn-filled btn-sm" onClick={() => setForm(null)}>+ دورة</button></div>
      <ErrText>{err}</ErrText>
      {!rows ? <div className="empty">جارٍ التحميل…</div> : (
        <table className="table">
          <thead><tr><th>العنوان</th><th>الحالة</th><th>السعر</th><th>مسجّلون</th><th>إجراءات</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.title}</td>
                <td><span className={`chip chip-${c.status}`}>{statusLabel(c.status)}</span></td>
                <td>{c.price} {c.currency}</td>
                <td>{c.enrolled_count}</td>
                <td className="actions">
                  <button className="btn btn-tonal btn-sm" onClick={() => setContent(c.id)}>المحتوى</button>
                  <button className="btn btn-tonal btn-sm" onClick={() => setForm(c)}>تعديل</button>
                  <button className="btn btn-tonal btn-sm" onClick={() => togglePublish(c)}>{c.status === 'published' ? 'إخفاء' : 'نشر'}</button>
                  <button className="btn btn-error btn-sm" onClick={() => del(c)}>حذف</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="5" className="empty">لا دورات بعد.</td></tr>}
          </tbody>
        </table>
      )}
      {form !== undefined && <CourseForm course={form} categories={categories} onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); load(); }} />}
      {content && <CourseContent courseId={content} perms={perms} onClose={() => { setContent(null); load(); }} />}
    </>
  );
}
