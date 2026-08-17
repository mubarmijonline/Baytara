import { useEffect, useState } from 'react';
import { api, fetchBaytarianDoc } from '../api.js';
import { confirmDialog, promptDialog } from '../dialog.jsx';
import { toast } from '../toast.jsx';
import { ErrText, apiError } from '../ui.jsx';
import { useAdminLanguage } from '../i18n.jsx';
import { pageCopy } from '../page-copy.js';

const statusChip = (s) => ({ pending: 'draft', approved: 'published', rejected: 'unpublished' }[s] || 'role');

// The order the reading is shown in: what the document is, then who it belongs to,
// then what it says about them. Reads top to bottom like the decision was made.
const VERDICT_FIELDS = ['document_type', 'issuer', 'holder_name', 'name_match', 'national_id',
  'occupation', 'occupation_is_veterinarian', 'is_veterinary_student', 'expired',
  'tampered', 'confidence'];

// Which readings are bad news, so the eye lands on them without reading every row.
const BAD = {
  name_match: (v) => v === 'different' || v === 'unreadable',
  expired: (v) => v === true,
  tampered: (v) => v === true,
  confidence: (v) => v === 'low',
};

function value(copy, field, raw) {
  if (raw === true) return copy.yes;
  if (raw === false) return copy.no;
  if (raw === null || raw === undefined || raw === '') return '—';
  if (field === 'name_match') return copy.nameMatch[raw] || raw;
  if (field === 'confidence') return copy.confidence[raw] || raw;
  return String(raw);
}

/** The documents, shown rather than downloaded. An admin deciding on a photograph
 *  should not have to open a tab per side to see it. */
function Documents({ request, copy }) {
  const [urls, setUrls] = useState([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const made = [];
    Promise.all(Array.from({ length: request.documents_count }, (_, i) => fetchBaytarianDoc(request.id, i)))
      .then((list) => { if (alive) { made.push(...list); setUrls(list); } else list.forEach(URL.revokeObjectURL); })
      .catch(() => alive && setFailed(true));
    return () => { alive = false; made.forEach(URL.revokeObjectURL); };
  }, [request.id, request.documents_count]);

  if (!request.documents_count) return <div className="empty">{copy.noDocuments}</div>;
  if (failed) return <ErrText>{copy.openError}</ErrText>;
  if (!urls.length) return <div className="empty">{copy.loadingDocuments}</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
      {urls.map((url, i) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" title={copy.openFull}>
          <img src={url} alt={`${copy.document} ${i + 1}`}
            style={{ width: '100%', borderRadius: 10, border: '1px solid var(--line)', display: 'block' }} />
        </a>
      ))}
    </div>
  );
}

function Detail({ request, copy, common, onClose, onApprove, onReject, onRevoke }) {
  const v = request.ai_verdict;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{request.user?.name} — {copy.statuses[request.status] || request.status}</h3>
        <div style={{ fontSize: 13, color: 'var(--muted)', direction: 'ltr', marginBottom: 14 }}>
          {request.user?.email}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
          <span className="chip chip-role">{copy.routes[request.route] || request.route}</span>
          {request.grant && <span className="chip chip-published">{copy.grants[request.grant]}</span>}
          {request.auto_approved && <span className="chip chip-draft">{copy.autoApproved}</span>}
          {request.spot_check && <span className="chip chip-unpublished">{copy.spotCheck}</span>}
        </div>

        <Documents request={request} copy={copy} />

        <h4 style={{ margin: '20px 0 10px' }}>{copy.aiHeading}</h4>
        {v ? (
          <>
            <table className="table">
              <tbody>
                {VERDICT_FIELDS.map((field) => {
                  const bad = BAD[field]?.(v[field]);
                  return (
                    <tr key={field}>
                      <td style={{ width: 200, fontWeight: 600 }}>{copy.verdictLabels[field] || field}</td>
                      <td style={{ color: bad ? 'var(--error)' : undefined }}>{value(copy, field, v[field])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {v.reason && (
              <p style={{ marginTop: 12, fontSize: 13.5, lineHeight: 1.9, color: 'var(--muted)' }}>{v.reason}</p>
            )}
          </>
        ) : <div className="empty">{copy.noVerdict}</div>}

        {request.parsed && (
          <>
            <h4 style={{ margin: '20px 0 10px' }}>{copy.parsedHeading}</h4>
            <table className="table">
              <tbody>
                {Object.entries(request.parsed.fields || {})
                  .filter(([k]) => k !== 'national_id_decoded')
                  .map(([k, f]) => (
                    <tr key={k}>
                      <td style={{ width: 200, fontWeight: 600 }}>{k}</td>
                      <td style={{ color: f.ok ? undefined : 'var(--error)' }}>
                        {f.ok ? (f.value === true ? copy.yes : f.value) : (f.problem || '—')}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}

        {request.ocr_text && (
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{copy.ocrHeading}</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.8, marginTop: 8 }}>
              {request.ocr_text}
            </pre>
          </details>
        )}

        {request.reject_reason && (
          <p style={{ marginTop: 16, color: 'var(--error)', fontSize: 13.5 }}>{request.reject_reason}</p>
        )}

        <div className="actions" style={{ marginTop: 22, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {request.status === 'pending' && (
            <>
              <button className="btn btn-filled btn-sm" onClick={() => onApprove(request, 'baytarian')}>{copy.verify}</button>
              <button className="btn btn-tonal btn-sm" onClick={() => onApprove(request, 'vet_student')}>{copy.verifyStudent}</button>
              <button className="btn btn-error btn-sm" onClick={() => onReject(request)}>{copy.reject}</button>
            </>
          )}
          {request.status === 'approved' && (
            <button className="btn btn-error btn-sm" onClick={() => onRevoke(request)}>{copy.revoke}</button>
          )}
          <button className="btn btn-tonal btn-sm" onClick={onClose}>{common.close || copy.close}</button>
        </div>
      </div>
    </div>
  );
}

export default function Baytarian({ searchParams }) {
  const { language } = useAdminLanguage();
  const copy = pageCopy('baytarian', language);
  const common = pageCopy('common', language);
  const [rows, setRows] = useState(null);
  // Seeded from the URL so a dashboard tile lands on the rows it counted.
  const [status, setStatus] = useState(() => searchParams.get('status') || 'pending');
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState('');

  async function load(keepOpenId) {
    setErr('');
    try {
      const list = (await api.baytarianRequests(status)).requests;
      setRows(list);
      // Keep the modal on the same request after an action, so its new state is visible
      // rather than the modal vanishing and leaving the admin to find the row again.
      setOpen((current) => (keepOpenId ? list.find((r) => r.id === keepOpenId) || null : current));
    } catch { setErr(common.loadError); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  // Both kinds verify the account; the admin only says which one this is.
  async function approve(r, grant) {
    const ask = grant === 'vet_student' ? copy.confirmStudent : copy.confirm;
    if (!await confirmDialog(ask(r.user?.name))) return;
    try { await api.baytarianApprove(r.id, grant); toast.success(copy.verified); load(r.id); }
    catch (e) { toast.error(apiError(e, common.loadError)); }
  }
  async function reject(r) {
    const reason = await promptDialog(copy.rejectReason, '');
    if (reason === null) return;
    try { await api.baytarianReject(r.id, reason); load(r.id); }
    catch (e) { toast.error(apiError(e, common.loadError)); }
  }
  async function revoke(r) {
    const reason = await promptDialog(copy.revokeReason, '');
    if (reason === null) return;
    try { await api.baytarianRevoke(r.id, reason); toast.success(copy.revoked); load(r.id); }
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
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.documents_count || 0}</td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{(r.created_at || '').slice(0, 10)}</td>
                <td className="actions">
                  <button className="btn btn-tonal btn-sm" onClick={() => setOpen(r)}>{copy.details}</button>
                  {r.status === 'pending' && (
                    <button className="btn btn-filled btn-sm" onClick={() => approve(r, r.grant || 'baytarian')}>{copy.verify}</button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="6" className="empty">{copy.empty}</td></tr>}
          </tbody>
        </table>
      )}
      {open && (
        <Detail request={open} copy={copy} common={common} onClose={() => setOpen(null)}
          onApprove={approve} onReject={reject} onRevoke={revoke} />
      )}
    </>
  );
}
