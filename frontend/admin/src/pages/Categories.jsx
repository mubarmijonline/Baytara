import { toast } from '../toast.jsx';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrText, apiError } from '../ui.jsx';

export default function Categories() {
  const [rows, setRows] = useState(null);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try { setRows((await api.categories()).categories); }
    catch { setErr('تعذّر التحميل.'); }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!name.trim()) return;
    try { await api.categoryCreate({ name: name.trim() }); setName(''); load(); }
    catch (e) { toast.error(apiError(e)); }
  }
  async function rename(c) {
    const n = prompt('الاسم الجديد', c.name);
    if (!n) return;
    try { await api.categoryUpdate(c.id, { name: n }); load(); }
    catch (e) { toast.error(apiError(e)); }
  }
  async function del(c) {
    if (!confirm(`حذف الفئة ${c.name}؟`)) return;
    try { await api.categoryDelete(c.id); load(); }
    catch (e) { toast.error(apiError(e) === 'category_in_use' ? 'الفئة مستخدمة في دورات.' : apiError(e)); }
  }

  return (
    <>
      <h2>الفئات</h2>
      <div className="toolbar">
        <input placeholder="اسم فئة جديدة" value={name} onChange={(e) => setName(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && create()} />
        <button className="btn btn-filled btn-sm" onClick={create}>+ إضافة</button>
      </div>
      <ErrText>{err}</ErrText>
      {!rows ? <div className="empty">جارٍ التحميل…</div> : (
        <table className="table">
          <thead><tr><th>الاسم</th><th>المعرّف (slug)</th><th>إجراءات</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td style={{ color: 'var(--muted)' }}>{c.slug}</td>
                <td className="actions">
                  <button className="btn btn-tonal btn-sm" onClick={() => rename(c)}>تعديل</button>
                  <button className="btn btn-error btn-sm" onClick={() => del(c)}>حذف</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="3" className="empty">لا فئات بعد.</td></tr>}
          </tbody>
        </table>
      )}
    </>
  );
}
