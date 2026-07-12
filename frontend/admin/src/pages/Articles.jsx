import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, Field, ErrText, apiError } from '../ui.jsx';

const TYPES = [['', 'الكل'], ['blog', 'مدوّنة'], ['content', 'محتوى مجاني']];
const typeLabel = (t) => ({ blog: 'مدوّنة', content: 'محتوى مجاني' }[t] || t);

function ArticleForm({ article, onClose, onSaved }) {
  const editing = !!article;
  const [f, setF] = useState({
    type: article?.type || 'blog', title: article?.title || '', excerpt: article?.excerpt || '',
    body: article?.body || '', cover: article?.cover || '', status: article?.status || 'draft',
  });
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(!editing);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    if (editing) api.articleGet(article.id).then((r) => { setF((s) => ({ ...s, ...r.article })); setLoaded(true); }).catch(() => setLoaded(true));
  }, [editing, article]);

  async function save() {
    setErr('');
    try {
      if (editing) await api.articleUpdate(article.id, f); else await api.articleCreate(f);
      onSaved();
    } catch (e) { setErr(apiError(e)); }
  }

  return (
    <Modal title={editing ? 'تعديل مقال' : 'مقال جديد'} onClose={onClose}>
      {!loaded ? <div className="empty">جارٍ التحميل…</div> : (
        <>
          <Field label="النوع">
            <select value={f.type} onChange={set('type')}>
              <option value="blog">مدوّنة</option>
              <option value="content">محتوى مجاني</option>
            </select>
          </Field>
          <Field label="العنوان"><input value={f.title} onChange={set('title')} /></Field>
          <Field label="مقتطف"><input value={f.excerpt} onChange={set('excerpt')} /></Field>
          <Field label="رابط صورة الغلاف"><input value={f.cover} onChange={set('cover')} dir="ltr" /></Field>
          <Field label="المحتوى">
            <textarea value={f.body} onChange={set('body')} rows={8}
              style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, font: 'inherit', resize: 'vertical' }} />
          </Field>
          <Field label="الحالة">
            <select value={f.status} onChange={set('status')}>
              <option value="draft">مسودة</option>
              <option value="published">منشور</option>
            </select>
          </Field>
          <ErrText>{err}</ErrText>
          <div className="row">
            <button className="btn btn-filled" onClick={save}>حفظ</button>
            <button className="btn btn-text" onClick={onClose}>إلغاء</button>
          </div>
        </>
      )}
    </Modal>
  );
}

export default function Articles() {
  const [rows, setRows] = useState(null);
  const [type, setType] = useState('');
  const [form, setForm] = useState(undefined);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try { setRows((await api.articlesAdmin({ type })).articles); }
    catch { setErr('تعذّر التحميل.'); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [type]);

  async function togglePublish(a) {
    try { await api.articleUpdate(a.id, { status: a.status === 'published' ? 'draft' : 'published' }); load(); }
    catch (e) { alert(apiError(e)); }
  }
  async function del(a) {
    if (!confirm(`حذف «${a.title}»؟`)) return;
    try { await api.articleDelete(a.id); load(); } catch (e) { alert(apiError(e)); }
  }

  return (
    <>
      <h2>المحتوى والمدوّنة</h2>
      <div className="toolbar">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="btn btn-filled btn-sm" onClick={() => setForm(null)}>+ مقال</button>
      </div>
      <ErrText>{err}</ErrText>
      {!rows ? <div className="empty">جارٍ التحميل…</div> : (
        <table className="table">
          <thead><tr><th>العنوان</th><th>النوع</th><th>الحالة</th><th>إجراءات</th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>{a.title}</td>
                <td><span className="chip chip-role">{typeLabel(a.type)}</span></td>
                <td><span className={`chip chip-${a.status === 'published' ? 'published' : 'draft'}`}>{a.status === 'published' ? 'منشور' : 'مسودة'}</span></td>
                <td className="actions">
                  <button className="btn btn-tonal btn-sm" onClick={() => setForm(a)}>تعديل</button>
                  <button className="btn btn-tonal btn-sm" onClick={() => togglePublish(a)}>{a.status === 'published' ? 'إخفاء' : 'نشر'}</button>
                  <button className="btn btn-error btn-sm" onClick={() => del(a)}>حذف</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="4" className="empty">لا مقالات.</td></tr>}
          </tbody>
        </table>
      )}
      {form !== undefined && <ArticleForm article={form} onClose={() => setForm(undefined)} onSaved={() => { setForm(undefined); load(); }} />}
    </>
  );
}
