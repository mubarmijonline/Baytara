import { confirmDialog, promptDialog } from '../dialog.jsx';
import { toast } from '../toast.jsx';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, Field, ErrText, apiError } from '../ui.jsx';
import { useAdminLanguage } from '../i18n.jsx';
import { pageCopy } from '../page-copy.js';

function UserForm({ user, onClose, onSaved }) {
  const { language } = useAdminLanguage();
  const copy = pageCopy('users', language);
  const common = pageCopy('common', language);
  const editing = !!user;
  const [f, setF] = useState({
    name: user?.name || '', email: user?.email || '', password: '',
    role: user?.role || 'student', is_active: user?.is_active ?? true,
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save() {
    setErr(''); setBusy(true);
    try {
      if (editing) {
        const body = { name: f.name, role: f.role, is_active: f.is_active };
        if (f.password) body.password = f.password;
        await api.userUpdate(user.id, body);
      } else {
        await api.userCreate({ name: f.name, email: f.email, password: f.password, role: f.role });
      }
      onSaved();
    } catch (e) { setErr(apiError(e, common.loadError)); setBusy(false); }
  }

  return (
    <Modal title={editing ? copy.edit : copy.new} onClose={onClose}>
      <Field label={copy.name}><input value={f.name} onChange={set('name')} /></Field>
      {!editing && <Field label={copy.email}><input type="email" value={f.email} onChange={set('email')} /></Field>}
      <Field label={editing ? copy.newPassword : copy.password}>
        <input type="password" value={f.password} onChange={set('password')} />
      </Field>
      <Field label={copy.role}>
        <select value={f.role} onChange={set('role')}>
          <option value="student">{copy.roles.student}</option>
          <option value="instructor">{copy.roles.instructor}</option>
          <option value="admin">{copy.roles.admin}</option>
        </select>
      </Field>
      {editing && (
        <label style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input type="checkbox" checked={f.is_active} onChange={set('is_active')} /> {copy.activeAccount}
        </label>
      )}
      {editing && f.role === 'instructor' && (
        <div style={{ fontSize: 13, color: 'var(--muted, #6b6b80)', marginBottom: 12 }}>{copy.instructorProfileHint}</div>
      )}
      <ErrText>{err}</ErrText>
      <div className="row">
        <button className="btn btn-filled" disabled={busy} onClick={save}>{common.save}</button>
        <button className="btn btn-text" onClick={onClose}>{common.cancel}</button>
      </div>
    </Modal>
  );
}

export default function Users() {
  const { language } = useAdminLanguage();
  const copy = pageCopy('users', language);
  const common = pageCopy('common', language);
  const [rows, setRows] = useState(null);
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(undefined); // undefined=closed, null=new, obj=edit
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try { setRows((await api.users({ role, q })).users); }
    catch { setErr(common.loadError); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [role]);

  async function toggleActive(u) {
    try { await api.userUpdate(u.id, { is_active: !u.is_active }); load(); }
    catch (e) { toast.error(apiError(e, common.loadError)); }
  }
  async function del(u) {
    if (!await confirmDialog(copy.deleteConfirm(u.name))) return;
    try { await api.userDelete(u.id); load(); }
    catch (e) { toast.error(apiError(e, common.loadError)); }
  }

  return (
    <>
      <h2>{copy.heading}</h2>
      <div className="toolbar">
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {copy.filters.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input placeholder={copy.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && load()} />
        <button className="btn btn-tonal btn-sm" onClick={load}>{copy.search}</button>
        <button className="btn btn-filled btn-sm" onClick={() => setEditing(null)}>{copy.new}</button>
      </div>
      <ErrText>{err}</ErrText>
      {!rows ? <div className="empty">{common.loading}</div> : (
        <table className="table">
          <thead><tr>{copy.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td><span className="chip chip-role">{copy.roles[u.role] || u.role}</span></td>
                <td><span className={`chip ${u.is_active ? 'chip-on' : 'chip-off'}`}>{u.is_active ? copy.active : copy.inactive}</span></td>
                <td className="actions">
                  <button className="btn btn-tonal btn-sm" onClick={() => setEditing(u)}>{common.edit}</button>
                  <button className="btn btn-tonal btn-sm" onClick={() => toggleActive(u)}>{u.is_active ? copy.deactivate : copy.activate}</button>
                  <button className="btn btn-error btn-sm" onClick={() => del(u)}>{common.delete}</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="5" className="empty">{copy.empty}</td></tr>}
          </tbody>
        </table>
      )}
      {editing !== undefined && (
        <UserForm user={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); load(); }} />
      )}
    </>
  );
}
