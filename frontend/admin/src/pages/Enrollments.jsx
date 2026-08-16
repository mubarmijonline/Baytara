import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { toast } from '../toast.jsx';
import { Modal, Field, ErrText, apiError } from '../ui.jsx';
import { useAdminLanguage } from '../i18n.jsx';
import { pageCopy } from '../page-copy.js';

const STATUSES = ['', 'active', 'cancelled'];

function money(value, currency) {
  return `${Number(value || 0).toLocaleString('en-US')} ${currency || 'EGP'}`;
}

function dateLabel(iso) {
  return iso ? new Date(iso).toLocaleDateString('en-GB') : '—';
}

// Un-enroll dialog. The reason is mandatory: it is stored and sent to the learner.
// The refund is optional and, critically, only bookkeeping — the money is returned
// by hand, so the dialog says so rather than implying a transfer happened.
function CancelDialog({ row, copy, common, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState('none');       // none | percent | amount
  const [percent, setPercent] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const payment = row.payment;
  const charged = Number(payment?.amount || 0);
  const already = Number(payment?.refunded_amount || 0);
  const remaining = Math.round((charged - already) * 100) / 100;
  const computed = mode === 'percent' && percent !== ''
    ? Math.round(charged * (Number(percent) / 100) * 100) / 100
    : mode === 'amount' && amount !== '' ? Number(amount) : 0;

  async function submit(event) {
    event.preventDefault();
    if (!reason.trim()) { setError(copy.reasonRequired); return; }
    if (mode !== 'none' && !(computed > 0)) { setError(copy.refundInvalid); return; }
    if (mode !== 'none' && computed > remaining) { setError(copy.refundTooBig(remaining, payment?.currency)); return; }
    setBusy(true); setError('');
    try {
      await api.enrollmentCancel(row.id, {
        reason: reason.trim(),
        ...(mode === 'percent' ? { refund: { percent: Number(percent) } } : {}),
        ...(mode === 'amount' ? { refund: { amount: Number(amount) } } : {}),
      });
      toast.success(copy.cancelled);
      onDone();
    } catch (e) {
      setError(copy.errors[apiError(e, '')] || apiError(e, common.loadError));
      setBusy(false);
    }
  }

  return (
    <Modal title={copy.cancelTitle(row.learner?.name || '', row.course?.title || '')} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label={copy.reason}>
          <textarea rows="3" value={reason} onChange={(event) => setReason(event.target.value)}
            placeholder={copy.reasonPlaceholder} />
          <span className="video-field-hint">{copy.reasonShownToLearner}</span>
        </Field>

        {payment ? (
          <Field label={copy.refund}>
            <p className="video-picker-warning">{copy.refundManual}</p>
            <p className="video-field-hint">{copy.paidSeat(money(charged, payment.currency), dateLabel(payment.paid_at))}</p>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <label><input type="radio" checked={mode === 'none'} onChange={() => setMode('none')} /> {copy.refundNone}</label>
              <label><input type="radio" checked={mode === 'percent'} onChange={() => setMode('percent')} /> {copy.refundPercent}</label>
              <label><input type="radio" checked={mode === 'amount'} onChange={() => setMode('amount')} /> {copy.refundAmount}</label>
            </div>
            {mode === 'percent' && (
              <input type="number" min="0.01" max="100" step="0.01" value={percent}
                onChange={(event) => setPercent(event.target.value)} placeholder="25" />
            )}
            {mode === 'amount' && (
              <input type="number" min="0.01" max={remaining} step="0.01" value={amount}
                onChange={(event) => setAmount(event.target.value)} placeholder={String(remaining)} />
            )}
            {mode !== 'none' && (
              <span className="video-field-hint">{copy.refundPreview(money(computed, payment.currency), money(remaining, payment.currency))}</span>
            )}
          </Field>
        ) : <p className="video-field-hint">{copy.noPayment}</p>}

        <ErrText>{error}</ErrText>
        <div className="row">
          <button className="btn btn-error" type="submit" disabled={busy}>{busy ? common.loading : copy.confirmCancel}</button>
          <button className="btn btn-tonal" type="button" onClick={onClose}>{common.cancel}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Enrollments({ searchParams }) {
  const { language } = useAdminLanguage();
  const copy = pageCopy('enrollments', language);
  const common = pageCopy('common', language);
  const [rows, setRows] = useState(null);
  // Seeded from the URL so a dashboard tile lands on the rows it counted.
  const [status, setStatus] = useState(() => searchParams?.get('status') || '');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [cancelling, setCancelling] = useState(null);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try {
      const result = await api.enrollments({ status, q, page, per_page: 20 });
      setRows(result.enrollments || []);
      setPages(result.pages || 1);
      setTotal(result.total ?? 0);
    } catch { setErr(common.loadError); setRows([]); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status, page]);

  return (
    <>
      <h2>{copy.heading}</h2>
      <p className="video-field-hint">{copy.subtitle}</p>
      <div className="toolbar">
        <input placeholder={copy.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (page === 1 ? load() : setPage(1))} />
        <button className="btn btn-tonal btn-sm" onClick={() => (page === 1 ? load() : setPage(1))}>{common.search}</button>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {STATUSES.map((value) => <option key={value || 'all'} value={value}>{value ? copy.statuses[value] : copy.allStatuses}</option>)}
        </select>
        <span className="chip">{copy.totalCount(total)}</span>
      </div>
      <ErrText>{err}</ErrText>

      {!rows ? <div className="empty">{common.loading}</div> : rows.length === 0 ? <div className="empty">{copy.empty}</div> : (
        <div className="table-scroll"><table className="table">
          <thead><tr>{copy.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div style={{ fontWeight: 700 }}>{row.learner?.name || '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted, #6b6b80)' }}>{row.learner?.email}</div>
                </td>
                <td>{row.course?.title || '—'}</td>
                <td>{copy.sources[row.source] || row.source}</td>
                <td>
                  {row.payment
                    ? <>
                        {money(row.payment.amount, row.payment.currency)}
                        {row.payment.refunded_amount > 0 && (
                          <div style={{ fontSize: 12, color: '#8a6d1f' }}>
                            {copy.refundedLabel(money(row.payment.refunded_amount, row.payment.currency))}
                          </div>
                        )}
                      </>
                    : '—'}
                </td>
                <td>{dateLabel(row.enrolled_at)}</td>
                <td>
                  <span className={`chip ${row.status === 'active' && !row.is_expired ? 'chip-on' : 'chip-off'}`}>
                    {row.is_expired && row.status === 'active' ? copy.statuses.expired : copy.statuses[row.status] || row.status}
                  </span>
                  {row.cancel_reason && (
                    <div style={{ fontSize: 12, color: 'var(--muted, #6b6b80)', maxWidth: 260 }}>{row.cancel_reason}</div>
                  )}
                </td>
                <td className="actions">
                  {row.status === 'cancelled'
                    ? <span className="chip chip-off">{copy.statuses.cancelled}</span>
                    : <button className="btn btn-error btn-sm" onClick={() => setCancelling(row)}>{copy.unenroll}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      {pages > 1 && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
          <button className="btn btn-tonal btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{copy.previous}</button>
          <span className="chip">{page} / {pages}</span>
          <button className="btn btn-tonal btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{copy.next}</button>
        </div>
      )}

      {cancelling && (
        <CancelDialog row={cancelling} copy={copy} common={common}
          onClose={() => setCancelling(null)}
          onDone={() => { setCancelling(null); load(); }} />
      )}
    </>
  );
}
