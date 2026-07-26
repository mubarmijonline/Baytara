import { useEffect, useState } from 'react';
import { api } from '../api.js';

const TABS = [['', 'الكل'], ['paid', 'مدفوعة'], ['pending', 'قيد الدفع'], ['failed', 'فاشلة'], ['expired', 'منتهية'], ['refunded', 'مستردة']];
const kindLabel = (k) => ({ enroll: 'اشتراك', renewal: 'تجديد', bundle: 'حزمة' }[k] || k);
const statusChip = (s) => ({ paid: 'published', pending: 'draft', failed: 'unpublished', expired: 'unpublished', refunded: 'role' }[s] || 'role');
const statusLabel = (s) => ({ paid: 'مدفوعة', pending: 'قيد الدفع', failed: 'فاشلة', expired: 'منتهية', refunded: 'مستردة' }[s] || s);

export default function Payments({ onLogout }) {
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState({ paid_count: 0, revenue: 0 });
  const [err, setErr] = useState('');

  async function load() {
    setErr(''); setRows(null);
    try {
      const r = await api.payments(status);
      setRows(r.payments); setMeta({ paid_count: r.paid_count, revenue: r.revenue });
    } catch (e) { if (e.status === 401) return onLogout(); setErr('تعذّر التحميل.'); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  return (
    <>
      <h2>المعاملات (فواتيرك)</h2>
      <div className="row" style={{ gap: 24, marginBottom: 12 }}>
        <div><b style={{ fontSize: 22 }}>{meta.paid_count}</b> <span style={{ color: 'var(--muted)' }}>عملية مدفوعة</span></div>
        <div><b style={{ fontSize: 22 }}>{Number(meta.revenue).toLocaleString()}</b> <span style={{ color: 'var(--muted)' }}>ج.م إيرادات</span></div>
      </div>
      <div className="tabs">
        {TABS.map(([k, label]) => (
          <div key={k} className={`tab ${status === k ? 'active' : ''}`} onClick={() => setStatus(k)}>{label}</div>
        ))}
      </div>
      {err && <div className="error-text">{err}</div>}
      {rows === null && !err ? <div className="empty">جارٍ التحميل…</div> : rows && (
        <table className="table">
          <thead><tr><th>#</th><th>النوع</th><th>الهدف</th><th>المبلغ</th><th>الطريقة</th><th>المرجع</th><th>الحالة</th><th>التاريخ</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{kindLabel(p.kind)}</td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.course_id ? `كورس ${p.course_id}` : p.bundle_id ? `حزمة ${p.bundle_id}` : '—'}</td>
                <td>{p.amount} {p.currency}</td>
                <td>{p.payment_method || '—'}</td>
                <td style={{ fontSize: 12, direction: 'ltr' }}>{p.reference_number || '—'}</td>
                <td><span className={`chip chip-${statusChip(p.status)}`}>{statusLabel(p.status)}</span></td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{(p.paid_at || p.created_at || '').slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="8" className="empty">لا معاملات.</td></tr>}
          </tbody>
        </table>
      )}
    </>
  );
}
