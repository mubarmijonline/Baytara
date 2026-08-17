import { useEffect, useState } from 'react';
import { api, fetchBaytarianDoc } from '../api.js';
import { confirmDialog, promptDialog } from '../dialog.jsx';
import { toast } from '../toast.jsx';
import { ErrText, apiError } from '../ui.jsx';
import { useAdminLanguage } from '../i18n.jsx';
import { pageCopy } from '../page-copy.js';

const statusChip = (s) => ({ pending: 'draft', approved: 'published', rejected: 'unpublished' }[s] || 'role');

export default function Baytarian({ searchParams }) {
  const { language } = useAdminLanguage();
  const copy = pageCopy('baytarian', language);
  const common = pageCopy('common', language);
  const [rows, setRows] = useState(null);
  // Seeded from the URL so a dashboard tile lands on the rows it counted.
  const [status, setStatus] = useState(() => searchParams.get('status') || 'pending');
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
  // A student card proves a student. Approving one must not hand out the doctor's badge,
  // so which status is granted is a separate button rather than a single "verify".
  async function approve(r, grant) {
    const ask = grant === 'vet_student' ? copy.confirmStudent : copy.confirm;
    if (!await confirmDialog(ask(r.user?.name))) return;
    try { await api.baytarianApprove(r.id, grant); toast.success(copy.verified); load(); }
    catch (e) { toast.error(apiError(e, common.loadError)); }
  }
  async function reject(r) {
    const reason = await promptDialog(copy.rejectReason, '');
    if (reason === null) return;
    try { await api.baytarianReject(r.id, reason); load(); }
    catch (e) { toast.error(apiError(e, common.loadError)); }
  }
  async function revoke(r) {
    const reason = await promptDialog(copy.revokeReason, '');
    if (reason === null) return;
    try { await api.baytarianRevoke(r.id, reason); toast.success(copy.revoked); load(); }
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
                {/* What the machine already read. An admin who has to open the images
                    to learn what the model said is doing the work twice. */}
                <td style={{ fontSize: 13, maxWidth: 340 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span className="chip chip-role">{copy.routes[r.route] || r.route}</span>
                    {r.grant && <span className="chip chip-published">{copy.grants[r.grant] || r.grant}</span>}
                    {r.auto_approved && <span className="chip chip-draft">{copy.autoApproved}</span>}
                    {r.spot_check && <span className="chip chip-unpublished">{copy.spotCheck}</span>}
                  </div>
                  {r.ai_verdict && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
                      {r.ai_verdict.document_type}
                      {r.ai_verdict.issuer ? ` — ${r.ai_verdict.issuer}` : ''}
                      {' · '}{copy.confidence[r.ai_verdict.confidence] || r.ai_verdict.confidence}
                    </div>
                  )}
                  {r.note || (r.ai_verdict ? '' : '—')}
                </td>
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
                      <button className="btn btn-filled btn-sm" onClick={() => approve(r, 'baytarian')}>{copy.verify}</button>
                      <button className="btn btn-tonal btn-sm" onClick={() => approve(r, 'vet_student')}>{copy.verifyStudent}</button>
                      <button className="btn btn-error btn-sm" onClick={() => reject(r)}>{copy.reject}</button>
                    </>
                  ) : r.status === 'approved' ? (
                    <button className="btn btn-error btn-sm" onClick={() => revoke(r)}>{copy.revoke}</button>
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
