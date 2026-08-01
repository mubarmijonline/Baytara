import { confirmDialog, promptDialog } from '../dialog.jsx';
import { toast } from '../toast.jsx';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrText, apiError } from '../ui.jsx';
import { useAdminLanguage } from '../i18n.jsx';
import { pageCopy } from '../page-copy.js';

export default function Messages() {
  const { language } = useAdminLanguage();
  const copy = pageCopy('messages', language);
  const common = pageCopy('common', language);
  const [rows, setRows] = useState(null);
  const [unread, setUnread] = useState(0);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try { const r = await api.messages(); setRows(r.messages); setUnread(r.unread); }
    catch { setErr(common.loadError); }
  }
  useEffect(() => { load(); }, []);

  async function toggleRead(m) {
    try { await api.messageUpdate(m.id, { is_read: !m.is_read }); load(); } catch (e) { toast.error(apiError(e, common.loadError)); }
  }
  async function del(m) {
    if (!await confirmDialog(copy.deleteConfirm)) return;
    try { await api.messageDelete(m.id); load(); } catch (e) { toast.error(apiError(e, common.loadError)); }
  }

  return (
    <>
      <h2>{copy.heading} {unread ? <span className="badge badge-bad">{unread} {copy.unread}</span> : null}</h2>
      <ErrText>{err}</ErrText>
      {!rows ? <div className="empty">{common.loading}</div> : rows.length === 0 ? <div className="empty">{copy.empty}</div> : (
        rows.map((m) => (
          <div key={m.id} className="card" style={{ borderRight: `4px solid ${m.is_read ? 'var(--border)' : 'var(--gold)'}` }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b>{m.subject || copy.noSubject}</b>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>{(m.created_at || '').slice(0, 16).replace('T', ' ')}</span>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0' }}>{m.name} · <span dir="ltr">{m.email}</span></div>
            <p style={{ margin: '8px 0', whiteSpace: 'pre-wrap' }}>{m.body}</p>
            <div className="row">
              <button className="btn btn-tonal btn-sm" onClick={() => toggleRead(m)}>{m.is_read ? copy.markUnread : copy.markRead}</button>
              <a className="btn btn-tonal btn-sm" href={`mailto:${m.email}`}>{copy.reply}</a>
              <button className="btn btn-error btn-sm" onClick={() => del(m)}>{common.delete}</button>
            </div>
          </div>
        ))
      )}
    </>
  );
}
