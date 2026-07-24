import { confirmDialog } from '../dialog.jsx';
import { toast } from '../toast.jsx';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, Field, ErrText, apiError } from '../ui.jsx';

const statusLabel = (s) => ({ draft: 'مسودة', published: 'منشورة', unpublished: 'غير منشورة' }[s] || s);

function BundleForm({ bundle, courses, onClose, onSaved }) {
  const editing = !!bundle;
  const [f, setF] = useState({
    title: bundle?.title || '', title_en: bundle?.title_en || '',
    description: bundle?.description || '', description_en: bundle?.description_en || '',
    price: bundle?.price ?? 0, currency: bundle?.currency || 'EGP',
    access_days: bundle?.access_days ?? '', status: bundle?.status || 'draft',
  });
  const [picked, setPicked] = useState((bundle?.courses || []).map((c) => c.id));
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function save() {
    setErr('');
    if (picked.length < 1) { setErr('اختر كورساً واحداً على الأقل.'); return; }
    const body = { ...f, price: Number(f.price),
      access_days: f.access_days === '' ? null : Number(f.access_days), course_ids: picked };
    try {
      if (editing) await api.bundleUpdate(bundle.id, body);
      else await api.bundleCreate(body);
      onSaved();
    } catch (e) { setErr(apiError(e)); }
  }

  return (
    <Modal title={editing ? 'تعديل حزمة' : 'حزمة جديدة'} onClose={onClose}>
      <Field label="العنوان (عربي)"><input value={f.title} onChange={set('title')} /></Field>
      <Field label="Title (English)"><input dir="ltr" value={f.title_en} onChange={set('title_en')} /></Field>
      <Field label="الوصف (عربي)"><input value={f.description} onChange={set('description')} /></Field>
      <Field label="Description (English)"><input dir="ltr" value={f.description_en} onChange={set('description_en')} /></Field>
      <div className="row">
        <Field label="السعر (مخفّض)"><input type="number" value={f.price} onChange={set('price')} style={{ width: 110 }} /></Field>
        <Field label="العملة"><input value={f.currency} onChange={set('currency')} style={{ width: 80 }} /></Field>
        <Field label="مدة الوصول (أيام)"><input type="number" min="0" placeholder="مدى الحياة" value={f.access_days} onChange={set('access_days')} style={{ width: 130 }} /></Field>
      </div>
      <Field label="الحالة">
        <select value={f.status} onChange={set('status')}>
          <option value="draft">مسودة</option>
          <option value="published">منشورة</option>
          <option value="unpublished">غير منشورة</option>
        </select>
      </Field>
      <Field label={`الكورسات المضمّنة (${picked.length})`}>
        <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, padding: 8 }}>
          {courses.length === 0 && <div className="empty">لا كورسات.</div>}
          {courses.map((c) => (
            <label key={c.id} className="row" style={{ gap: 8, padding: '4px 2px', cursor: 'pointer' }}>
              <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} />
              <span>{c.title} <span style={{ color: 'var(--muted)' }}>· {c.price} {c.currency}</span></span>
            </label>
          ))}
        </div>
      </Field>
      <ErrText>{err}</ErrText>
      <div className="row">
        <button className="btn btn-filled" onClick={save}>حفظ</button>
        <button className="btn btn-text" onClick={onClose}>إلغاء</button>
      </div>
    </Modal>
  );
}

export default function Bundles() {
  const [rows, setRows] = useState(null);
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(undefined);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try { setRows((await api.bundles()).bundles); }
    catch { setErr('تعذّر التحميل.'); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { api.courses({ per_page: 100 }).then((r) => setCourses(r.courses)).catch(() => {}); }, []);

  async function togglePublish(b) {
    const next = b.status === 'published' ? 'unpublished' : 'published';
    try { await api.bundleUpdate(b.id, { status: next }); load(); }
    catch (e) { toast.error(apiError(e)); }
  }
  async function del(b) {
    if (!await confirmDialog(`حذف حزمة «${b.title}»؟`)) return;
    try { await api.bundleDelete(b.id); load(); }
    catch (e) { toast.error(apiError(e)); }
  }

  return (
    <>
      <h2>الحزم التعليمية</h2>
      <div className="toolbar">
        <button className="btn btn-filled btn-sm" onClick={() => setForm(null)} disabled={!courses.length}>+ حزمة</button>
        {!courses.length && <span style={{ color: 'var(--muted)', fontSize: 13 }}>أضف كورسات أولاً</span>}
      </div>
      <ErrText>{err}</ErrText>
      {!rows ? <div className="empty">جارٍ التحميل…</div> : (
        <table className="table">
          <thead><tr><th>العنوان</th><th>الحالة</th><th>السعر</th><th>الكورسات</th><th>مدة الوصول</th><th>إجراءات</th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td>{b.title}</td>
                <td><span className={`chip chip-${b.status}`}>{statusLabel(b.status)}</span></td>
                <td>{b.price} {b.currency}</td>
                <td>{b.courses?.length || 0}</td>
                <td>{b.access_days ? `${b.access_days} يوم` : 'مدى الحياة'}</td>
                <td className="actions">
                  <button className="btn btn-tonal btn-sm" onClick={() => setForm(b)}>تعديل</button>
                  <button className="btn btn-tonal btn-sm" onClick={() => togglePublish(b)}>{b.status === 'published' ? 'إخفاء' : 'نشر'}</button>
                  <button className="btn btn-error btn-sm" onClick={() => del(b)}>حذف</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="6" className="empty">لا حزم بعد.</td></tr>}
          </tbody>
        </table>
      )}
      {form !== undefined && (
        <BundleForm bundle={form} courses={courses}
          onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); load(); }} />
      )}
    </>
  );
}
