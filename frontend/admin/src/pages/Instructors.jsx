// Instructors: the full public profile an admin controls (photo, headline, bio,
// expertise, section) plus the video permission flags. Everything here is what the
// main website renders on /instructors/<id>.
import { useEffect, useRef, useState } from 'react';
import { confirmDialog } from '../dialog.jsx';
import { toast } from '../toast.jsx';
import { api } from '../api.js';
import { Modal, Field, ErrText, apiError } from '../ui.jsx';
import { useAdminLanguage } from '../i18n.jsx';
import { pageCopy } from '../page-copy.js';

function Avatar({ url, name, size = 40 }) {
  const s = { width: size, height: size, borderRadius: '50%', objectFit: 'cover', flex: 'none' };
  if (url) return <img src={url} alt={name} style={s} />;
  return (
    <div style={{ ...s, background: 'var(--surface-alt, #e6e6ef)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontWeight: 800 }}>
      {(name || '?').trim().charAt(0)}
    </div>
  );
}

function InstructorForm({ user, categories, onClose, onSaved }) {
  const { language } = useAdminLanguage();
  const copy = pageCopy('instructors', language);
  const common = pageCopy('common', language);
  const editing = !!user;
  const fileRef = useRef(null);
  const [f, setF] = useState({
    name: user?.name || '', email: user?.email || '', password: '', phone: user?.phone || '',
    headline: user?.headline || '', bio: user?.bio || '',
    expertise: (user?.expertise || []).join('، '),
    category_id: user?.category_id || '', avatar_url: user?.avatar_url || '',
    is_active: user?.is_active ?? true,
    can_add_video: user?.can_add_video ?? true,
    can_edit_video: user?.can_edit_video ?? false,
    can_delete_video: user?.can_delete_video ?? false,
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    try {
      const { url } = await api.uploadImage(file);
      setF((p) => ({ ...p, avatar_url: url }));
    } catch (ex) {
      setErr(apiError(ex, copy.uploadError));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function save() {
    setErr(''); setBusy(true);
    const body = {
      name: f.name, phone: f.phone || null, headline: f.headline, bio: f.bio,
      expertise: f.expertise.split(/[،,]/).map((x) => x.trim()).filter(Boolean),
      category_id: f.category_id || null, avatar_url: f.avatar_url || null,
      can_add_video: f.can_add_video, can_edit_video: f.can_edit_video, can_delete_video: f.can_delete_video,
    };
    try {
      if (editing) {
        if (f.password) body.password = f.password;
        body.is_active = f.is_active;
        await api.userUpdate(user.id, body);
      } else {
        await api.userCreate({ ...body, email: f.email, password: f.password, role: 'instructor' });
      }
      onSaved();
    } catch (e) { setErr(apiError(e, common.loadError)); setBusy(false); }
  }

  return (
    <Modal title={editing ? copy.edit(user.name) : copy.new} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <Avatar url={f.avatar_url} name={f.name} size={72} />
        <div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickPhoto} />
          <div style={{ fontSize: 12, color: 'var(--muted, #6b6b80)', marginTop: 4 }}>{copy.photoHint}</div>
          {f.avatar_url && (
            <button className="btn btn-text btn-sm" onClick={() => setF({ ...f, avatar_url: '' })}>{copy.removePhoto}</button>
          )}
        </div>
      </div>
      <Field label={copy.name}><input value={f.name} onChange={set('name')} /></Field>
      {!editing && <Field label={copy.email}><input type="email" value={f.email} onChange={set('email')} /></Field>}
      <Field label={editing ? copy.newPassword : copy.password}>
        <input type="password" value={f.password} onChange={set('password')} />
      </Field>
      <Field label={copy.phone}><input value={f.phone} onChange={set('phone')} /></Field>
      <Field label={copy.headline}>
        <input value={f.headline} onChange={set('headline')} placeholder={copy.headlinePlaceholder} />
      </Field>
      <Field label={copy.section}>
        <select value={f.category_id} onChange={set('category_id')}>
          <option value="">{copy.noSection}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label={copy.bio}>
        <textarea value={f.bio} onChange={set('bio')} rows={5}
          style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, font: 'inherit', resize: 'vertical' }} />
      </Field>
      <Field label={copy.expertise}>
        <input value={f.expertise} onChange={set('expertise')} placeholder={copy.expertisePlaceholder} />
      </Field>
      {editing && (
        <label style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input type="checkbox" checked={f.is_active} onChange={set('is_active')} /> {copy.activeAccount}
        </label>
      )}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{copy.permissions}</div>
        <label style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <input type="checkbox" checked={f.can_add_video} onChange={set('can_add_video')} /> {copy.canAdd}
        </label>
        <label style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <input type="checkbox" checked={f.can_edit_video} onChange={set('can_edit_video')} /> {copy.canEdit}
        </label>
        <label style={{ display: 'flex', gap: 8 }}>
          <input type="checkbox" checked={f.can_delete_video} onChange={set('can_delete_video')} /> {copy.canDelete}
        </label>
      </div>
      <ErrText>{err}</ErrText>
      <div className="row">
        <button className="btn btn-filled" disabled={busy} onClick={save}>{common.save}</button>
        <button className="btn btn-text" onClick={onClose}>{common.cancel}</button>
      </div>
    </Modal>
  );
}

export default function Instructors() {
  const { language } = useAdminLanguage();
  const copy = pageCopy('instructors', language);
  const common = pageCopy('common', language);
  const [rows, setRows] = useState(null);
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(undefined); // undefined=closed, null=new, obj=edit
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try { setRows((await api.users({ role: 'instructor', q })).users); }
    catch { setErr(common.loadError); }
  }
  useEffect(() => {
    load();
    api.categories().then((r) => setCategories(r.categories || [])).catch(() => {});
    /* eslint-disable-next-line */
  }, []);

  async function del(u) {
    if (!await confirmDialog(copy.deleteConfirm(u.name))) return;
    try { await api.userDelete(u.id); load(); }
    catch (e) { toast.error(apiError(e, common.loadError)); }
  }

  const missing = (u) => [
    !u.avatar_url && copy.missing.photo,
    !u.headline && copy.missing.headline,
    !u.bio && copy.missing.bio,
    !(u.expertise || []).length && copy.missing.expertise,
    !u.category_id && copy.missing.section,
  ].filter(Boolean);

  return (
    <>
      <h2>{copy.heading}</h2>
      <div className="toolbar">
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
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar url={u.avatar_url} name={u.name} />
                    <div>
                      <div style={{ fontWeight: 700 }}>{u.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted, #6b6b80)' }}>{u.headline || u.email}</div>
                    </div>
                  </div>
                </td>
                <td>{u.category?.name || '—'}</td>
                <td>{u.courses_count}</td>
                <td>
                  {missing(u).length
                    ? <span className="chip chip-off">{missing(u).join(' · ')}</span>
                    : <span className="chip chip-on">{copy.complete}</span>}
                </td>
                <td><span className={`chip ${u.is_active ? 'chip-on' : 'chip-off'}`}>{u.is_active ? copy.active : copy.inactive}</span></td>
                <td className="actions">
                  <button className="btn btn-tonal btn-sm" onClick={() => setEditing(u)}>{common.edit}</button>
                  <button className="btn btn-error btn-sm" onClick={() => del(u)}>{common.delete}</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="6" className="empty">{copy.empty}</td></tr>}
          </tbody>
        </table>
      )}
      {editing !== undefined && (
        <InstructorForm user={editing} categories={categories}
          onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); load(); }} />
      )}
    </>
  );
}
