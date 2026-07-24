import { useEffect, useState } from 'react';
import { api, fetchBaytarianDoc } from '../api.js';
import { confirmDialog, promptDialog } from '../dialog.jsx';
import { toast } from '../toast.jsx';
import { ErrText, apiError } from '../ui.jsx';

const STATUS = [['pending', 'قيد المراجعة'], ['approved', 'موثّق'], ['rejected', 'مرفوض'], ['', 'الكل']];
const statusChip = (s) => ({ pending: 'draft', approved: 'published', rejected: 'unpublished' }[s] || 'role');
const statusLabel = (s) => ({ pending: 'قيد المراجعة', approved: 'موثّق', rejected: 'مرفوض' }[s] || s);

export default function Baytarian() {
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState('pending');
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try { setRows((await api.baytarianRequests(status)).requests); }
    catch { setErr('تعذّر التحميل.'); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  async function viewDoc(rid, idx) {
    try { window.open(await fetchBaytarianDoc(rid, idx), '_blank'); }
    catch { toast.error('تعذّر فتح المستند'); }
  }
  async function approve(r) {
    if (!await confirmDialog(`توثيق ${r.user?.name} كطبيب بيطري؟`)) return;
    try { await api.baytarianApprove(r.id); toast.success('تم التوثيق'); load(); }
    catch (e) { toast.error(apiError(e)); }
  }
  async function reject(r) {
    const reason = await promptDialog('سبب الرفض (اختياري)', '');
    if (reason === null) return;
    try { await api.baytarianReject(r.id, reason); load(); }
    catch (e) { toast.error(apiError(e)); }
  }

  return (
    <>
      <h2>توثيق الأطباء (بيطريّ)</h2>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <ErrText>{err}</ErrText>
      {!rows ? <div className="empty">جارٍ التحميل…</div> : (
        <table className="table">
          <thead><tr><th>الطبيب</th><th>الحالة</th><th>ملاحظة</th><th>المستندات</th><th>التاريخ</th><th>إجراءات</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.user?.name}<div style={{ fontSize: 12, color: 'var(--muted)', direction: 'ltr' }}>{r.user?.email}</div></td>
                <td><span className={`chip chip-${statusChip(r.status)}`}>{statusLabel(r.status)}</span></td>
                <td style={{ fontSize: 13 }}>{r.note || '—'}</td>
                <td className="actions">
                  {Array.from({ length: r.documents_count }).map((_, i) => (
                    <button key={i} className="btn btn-tonal btn-sm" onClick={() => viewDoc(r.id, i)}>مستند {i + 1}</button>
                  ))}
                  {!r.documents_count && '—'}
                </td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{(r.created_at || '').slice(0, 10)}</td>
                <td className="actions">
                  {r.status === 'pending' ? (
                    <>
                      <button className="btn btn-filled btn-sm" onClick={() => approve(r)}>توثيق</button>
                      <button className="btn btn-error btn-sm" onClick={() => reject(r)}>رفض</button>
                    </>
                  ) : r.reject_reason ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.reject_reason}</span> : '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="6" className="empty">لا طلبات.</td></tr>}
          </tbody>
        </table>
      )}
    </>
  );
}
