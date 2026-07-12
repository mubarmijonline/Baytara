import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, Field, ErrText, apiError } from '../ui.jsx';

function AccountForm({ account, onClose, onSaved }) {
  const editing = !!account;
  const [f, setF] = useState({
    account_name: account?.account_name || '', number: account?.number || '',
    url: account?.url || '', active: account?.active ?? true,
  });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save() {
    setErr('');
    try {
      if (editing) await api.accountUpdate(account.account_id, f);
      else await api.accountCreate(f);
      onSaved();
    } catch (e) { setErr(apiError(e) === 'number_or_url_required' ? 'أدخل الرقم أو الرابط.' : apiError(e)); }
  }

  return (
    <Modal title={editing ? 'تعديل حساب' : 'حساب إنستاباي جديد'} onClose={onClose}>
      <Field label="اسم الحساب"><input value={f.account_name} onChange={set('account_name')} /></Field>
      <Field label="رقم الموبايل"><input value={f.number} onChange={set('number')} placeholder="01xxxxxxxxx" /></Field>
      <Field label="رابط/معرّف إنستاباي">
        <input value={f.url} onChange={set('url')} placeholder="name/instapay (بصيغة / )" />
      </Field>
      <label style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input type="checkbox" checked={f.active} onChange={set('active')} /> مُفعّل
      </label>
      <ErrText>{err}</ErrText>
      <div className="row">
        <button className="btn btn-filled" onClick={save}>حفظ</button>
        <button className="btn btn-text" onClick={onClose}>إلغاء</button>
      </div>
    </Modal>
  );
}

export default function Accounts() {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(undefined);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try { setRows((await api.accounts()).accounts); }
    catch { setErr('تعذّر التحميل.'); }
  }
  useEffect(() => { load(); }, []);

  return (
    <>
      <h2>حسابات إنستاباي (المستقبِلة)</h2>
      <p style={{ color: 'var(--muted)', marginTop: -8 }}>
        القائمة البيضاء لحسابات المركز. بدونها لن يُقبل أي إيصال (المستقبِل «غير موثّق»). خزّن الرابط بصيغة «/» لا «@».
      </p>
      <div className="toolbar">
        <button className="btn btn-filled btn-sm" onClick={() => setEditing(null)}>+ حساب</button>
      </div>
      <ErrText>{err}</ErrText>
      {!rows ? <div className="empty">جارٍ التحميل…</div> : (
        <table className="table">
          <thead><tr><th>الاسم</th><th>الرقم</th><th>الرابط</th><th>الحالة</th><th>إجراءات</th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.account_id}>
                <td>{a.account_name}</td>
                <td>{a.number || '—'}</td>
                <td style={{ color: 'var(--muted)', direction: 'ltr' }}>{a.url || '—'}</td>
                <td><span className={`chip ${a.active ? 'chip-on' : 'chip-off'}`}>{a.active ? 'مفعّل' : 'معطّل'}</span></td>
                <td className="actions"><button className="btn btn-tonal btn-sm" onClick={() => setEditing(a)}>تعديل</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="5" className="empty">لا حسابات بعد.</td></tr>}
          </tbody>
        </table>
      )}
      {editing !== undefined && (
        <AccountForm account={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); load(); }} />
      )}
    </>
  );
}
