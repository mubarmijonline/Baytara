import { toast } from '../toast.jsx';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrText, apiError } from '../ui.jsx';

export default function Messages() {
  const [rows, setRows] = useState(null);
  const [unread, setUnread] = useState(0);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try { const r = await api.messages(); setRows(r.messages); setUnread(r.unread); }
    catch { setErr('تعذّر التحميل.'); }
  }
  useEffect(() => { load(); }, []);

  async function toggleRead(m) {
    try { await api.messageUpdate(m.id, { is_read: !m.is_read }); load(); } catch (e) { toast.error(apiError(e)); }
  }
  async function del(m) {
    if (!confirm('حذف الرسالة؟')) return;
    try { await api.messageDelete(m.id); load(); } catch (e) { toast.error(apiError(e)); }
  }

  return (
    <>
      <h2>الرسائل {unread ? <span className="badge badge-bad">{unread} غير مقروءة</span> : null}</h2>
      <ErrText>{err}</ErrText>
      {!rows ? <div className="empty">جارٍ التحميل…</div> : rows.length === 0 ? <div className="empty">لا رسائل.</div> : (
        rows.map((m) => (
          <div key={m.id} className="card" style={{ borderRight: `4px solid ${m.is_read ? 'var(--border)' : 'var(--gold)'}` }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b>{m.subject || '(بدون موضوع)'}</b>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>{(m.created_at || '').slice(0, 16).replace('T', ' ')}</span>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0' }}>{m.name} · <span dir="ltr">{m.email}</span></div>
            <p style={{ margin: '8px 0', whiteSpace: 'pre-wrap' }}>{m.body}</p>
            <div className="row">
              <button className="btn btn-tonal btn-sm" onClick={() => toggleRead(m)}>{m.is_read ? 'وضع كغير مقروءة' : 'وضع كمقروءة'}</button>
              <a className="btn btn-tonal btn-sm" href={`mailto:${m.email}`}>رد بالبريد</a>
              <button className="btn btn-error btn-sm" onClick={() => del(m)}>حذف</button>
            </div>
          </div>
        ))
      )}
    </>
  );
}
