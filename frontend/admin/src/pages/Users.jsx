import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, Field, ErrText, apiError } from '../ui.jsx';

const ROLES = [['', 'كل الأدوار'], ['student', 'طالب'], ['instructor', 'مدرّب'], ['admin', 'مسؤول']];
const roleLabel = (r) => ({ student: 'طالب', instructor: 'مدرّب', admin: 'مسؤول' }[r] || r);

function UserForm({ user, onClose, onSaved }) {
  const editing = !!user;
  const [f, setF] = useState({
    name: user?.name || '', email: user?.email || '', password: '',
    role: user?.role || 'student', is_active: user?.is_active ?? true,
    headline: user?.headline || '', bio: user?.bio || '',
    expertise: (user?.expertise || []).join('، '),
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save() {
    setErr(''); setBusy(true);
    const expertise = f.expertise.split(/[،,]/).map((x) => x.trim()).filter(Boolean);
    try {
      if (editing) {
        const body = { name: f.name, role: f.role, is_active: f.is_active };
        if (f.password) body.password = f.password;
        if (f.role === 'instructor') Object.assign(body, { headline: f.headline, bio: f.bio, expertise });
        await api.userUpdate(user.id, body);
      } else {
        await api.userCreate({ name: f.name, email: f.email, password: f.password, role: f.role });
      }
      onSaved();
    } catch (e) { setErr(apiError(e)); setBusy(false); }
  }

  return (
    <Modal title={editing ? 'تعديل مستخدم' : 'مستخدم جديد'} onClose={onClose}>
      <Field label="الاسم"><input value={f.name} onChange={set('name')} /></Field>
      {!editing && <Field label="البريد"><input type="email" value={f.email} onChange={set('email')} /></Field>}
      <Field label={editing ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور'}>
        <input type="password" value={f.password} onChange={set('password')} />
      </Field>
      <Field label="الدور">
        <select value={f.role} onChange={set('role')}>
          <option value="student">طالب</option>
          <option value="instructor">مدرّب</option>
          <option value="admin">مسؤول</option>
        </select>
      </Field>
      {editing && (
        <label style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input type="checkbox" checked={f.is_active} onChange={set('is_active')} /> الحساب مفعّل
        </label>
      )}
      {editing && f.role === 'instructor' && (
        <>
          <Field label="المسمّى المهني (يظهر بالموقع)"><input value={f.headline} onChange={set('headline')} /></Field>
          <Field label="نبذة"><textarea value={f.bio} onChange={set('bio')} rows={3}
            style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, font: 'inherit', resize: 'vertical' }} /></Field>
          <Field label="مجالات الخبرة (افصل بفاصلة)"><input value={f.expertise} onChange={set('expertise')} /></Field>
        </>
      )}
      <ErrText>{err}</ErrText>
      <div className="row">
        <button className="btn btn-filled" disabled={busy} onClick={save}>حفظ</button>
        <button className="btn btn-text" onClick={onClose}>إلغاء</button>
      </div>
    </Modal>
  );
}

export default function Users() {
  const [rows, setRows] = useState(null);
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(undefined); // undefined=closed, null=new, obj=edit
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try { setRows((await api.users({ role, q })).users); }
    catch { setErr('تعذّر التحميل.'); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [role]);

  async function toggleActive(u) {
    try { await api.userUpdate(u.id, { is_active: !u.is_active }); load(); }
    catch (e) { alert(apiError(e)); }
  }
  async function del(u) {
    if (!confirm(`حذف ${u.name}؟`)) return;
    try { await api.userDelete(u.id); load(); }
    catch (e) { alert(apiError(e)); }
  }

  return (
    <>
      <h2>المستخدمون</h2>
      <div className="toolbar">
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input placeholder="بحث بالاسم/البريد" value={q} onChange={(e) => setQ(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && load()} />
        <button className="btn btn-tonal btn-sm" onClick={load}>بحث</button>
        <button className="btn btn-filled btn-sm" onClick={() => setEditing(null)}>+ مستخدم</button>
      </div>
      <ErrText>{err}</ErrText>
      {!rows ? <div className="empty">جارٍ التحميل…</div> : (
        <table className="table">
          <thead><tr><th>الاسم</th><th>البريد</th><th>الدور</th><th>الحالة</th><th>إجراءات</th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td><span className="chip chip-role">{roleLabel(u.role)}</span></td>
                <td><span className={`chip ${u.is_active ? 'chip-on' : 'chip-off'}`}>{u.is_active ? 'مفعّل' : 'معطّل'}</span></td>
                <td className="actions">
                  <button className="btn btn-tonal btn-sm" onClick={() => setEditing(u)}>تعديل</button>
                  <button className="btn btn-tonal btn-sm" onClick={() => toggleActive(u)}>{u.is_active ? 'تعطيل' : 'تفعيل'}</button>
                  <button className="btn btn-error btn-sm" onClick={() => del(u)}>حذف</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="5" className="empty">لا نتائج.</td></tr>}
          </tbody>
        </table>
      )}
      {editing !== undefined && (
        <UserForm user={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); load(); }} />
      )}
    </>
  );
}
