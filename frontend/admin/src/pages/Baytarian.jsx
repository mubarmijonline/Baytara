import { useEffect, useState } from 'react';
import { api, fetchBaytarianDoc } from '../api.js';
import { confirmDialog, promptDialog } from '../dialog.jsx';
import { toast } from '../toast.jsx';
import { ErrText, apiError } from '../ui.jsx';
import { useAdminLanguage } from '../i18n.jsx';
import { pageCopy } from '../page-copy.js';

const statusChip = (s) => ({ pending: 'draft', approved: 'published', rejected: 'unpublished' }[s] || 'role');

export default function Baytarian() {
  const { language } = useAdminLanguage();
  const copy = pageCopy('baytarian', language);
  const common = pageCopy('common', language);
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState('pending');
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try { setRows((await api.baytarianRequests(status)).requests); }
    catch { setErr(common.loadError); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  async function viewDoc(rid, idx) {
    try { window.open(await fetchBaytarianDoc(rid, idx), '_blank'); }
    catch { toast.error(copy.openError); }
  }
  async function approve(r) {
    if (!await confirmDialog(copy.confirm(r.user?.name))) return;
    try { await api.baytarianApprove(r.id); toast.success(copy.verified); load(); }
    catch (e) { toast.error(apiError(e, common.loadError)); }
  }
  async function reject(r) {
    const reason = await promptDialog(copy.rejectReason, '');
    if (reason === null) return;
    try { await api.baytarianReject(r.id, reason); load(); }
    catch (e) { toast.error(apiError(e, common.loadError)); }
  }

  return (
    <>
      <h2>{copy.heading}</h2>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {copy.filters.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <ErrText>{err}</ErrText>
      {!rows ? <div className="empty">{common.loading}</div> : (
        <table className="table">
          <thead><tr>{copy.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.user?.name}<div style={{ fontSize: 12, color: 'var(--muted)', direction: 'ltr' }}>{r.user?.email}</div></td>
                <td><span className={`chip chip-${statusChip(r.status)}`}>{copy.statuses[r.status] || r.status}</span></td>
                <td style={{ fontSize: 13 }}>{r.note || '—'}</td>
                <td className="actions">
                  {Array.from({ length: r.documents_count }).map((_, i) => (
                    <button key={i} className="btn btn-tonal btn-sm" onClick={() => viewDoc(r.id, i)}>{copy.document} {i + 1}</button>
                  ))}
                  {!r.documents_count && '—'}
                </td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{(r.created_at || '').slice(0, 10)}</td>
                <td className="actions">
                  {r.status === 'pending' ? (
                    <>
                      <button className="btn btn-filled btn-sm" onClick={() => approve(r)}>{copy.verify}</button>
                      <button className="btn btn-error btn-sm" onClick={() => reject(r)}>{copy.reject}</button>
                    </>
                  ) : r.reject_reason ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.reject_reason}</span> : '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="6" className="empty">{copy.empty}</td></tr>}
          </tbody>
        </table>
      )}
    </>
  );
}
