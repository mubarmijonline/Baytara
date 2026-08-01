import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAdminLanguage } from '../i18n.jsx';
import { pageCopy } from '../page-copy.js';

const statusChip = (s) => ({ paid: 'published', pending: 'draft', failed: 'unpublished', expired: 'unpublished', refunded: 'role' }[s] || 'role');

export default function Payments({ onLogout }) {
  const { language } = useAdminLanguage();
  const copy = pageCopy('payments', language);
  const common = pageCopy('common', language);
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState({ paid_count: 0, revenue: 0 });
  const [err, setErr] = useState('');

  async function load() {
    setErr(''); setRows(null);
    try {
      const r = await api.payments(status);
      setRows(r.payments); setMeta({ paid_count: r.paid_count, revenue: r.revenue });
    } catch (e) { if (e.status === 401) return onLogout(); setErr(common.loadError); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  return (
    <>
      <h2>{copy.heading}</h2>
      <div className="row" style={{ gap: 24, marginBottom: 12 }}>
        <div><b style={{ fontSize: 22 }}>{meta.paid_count}</b> <span style={{ color: 'var(--muted)' }}>{copy.paidCount}</span></div>
        <div><b style={{ fontSize: 22 }}>{Number(meta.revenue).toLocaleString()}</b> <span style={{ color: 'var(--muted)' }}>{copy.revenue}</span></div>
      </div>
      <div className="tabs">
        {copy.tabs.map(([k, label]) => (
          <div key={k} className={`tab ${status === k ? 'active' : ''}`} onClick={() => setStatus(k)}>{label}</div>
        ))}
      </div>
      {err && <div className="error-text">{err}</div>}
      {rows === null && !err ? <div className="empty">{common.loading}</div> : rows && (
        <table className="table">
          <thead><tr>{copy.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{copy.kinds[p.kind] || p.kind}</td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.course_id ? `${copy.course} ${p.course_id}` : p.bundle_id ? `${copy.bundle} ${p.bundle_id}` : '—'}</td>
                <td>{p.amount} {p.currency}</td>
                <td>{p.payment_method || '—'}</td>
                <td style={{ fontSize: 12, direction: 'ltr' }}>{p.reference_number || '—'}</td>
                <td><span className={`chip chip-${statusChip(p.status)}`}>{copy.statuses[p.status] || p.status}</span></td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{(p.paid_at || p.created_at || '').slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="8" className="empty">{copy.empty}</td></tr>}
          </tbody>
        </table>
      )}
    </>
  );
}
