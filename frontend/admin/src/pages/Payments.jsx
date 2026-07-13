import { confirmDialog, promptDialog } from '../dialog.jsx';
import { toast } from '../toast.jsx';
import { useEffect, useState } from 'react';
import { api, fetchReceipt } from '../api.js';

const TABS = [['pending', 'قيد المراجعة'], ['approved', 'مقبولة'], ['rejected', 'مرفوضة']];
const Badge = ({ ok, children }) => <span className={`badge ${ok ? 'badge-ok' : 'badge-bad'}`}>{children}</span>;
const money = (v, cur) => (v == null ? '—' : `${v} ${cur || ''}`.trim());

function PaymentCard({ p, onAction }) {
  const [img, setImg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function showReceipt() {
    setErr('');
    try { setImg(await fetchReceipt(p.id)); }
    catch { setErr('تعذّر تحميل الإيصال.'); }
  }
  async function act(kind) {
    setErr('');
    let reason;
    if (kind === 'reject') { reason = await promptDialog('سبب الرفض؟'); if (reason === null) return; }
    setBusy(true);
    try {
      if (kind === 'approve') await api.approve(p.id); else await api.reject(p.id, reason);
      onAction();
    } catch (e) { setErr(e.data && e.data.error ? `فشل: ${e.data.error}` : 'فشل الإجراء.'); setBusy(false); }
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>دفعة #{p.id} · دورة {p.course_id}</h3>
        <span className="badge badge-neutral">{p.reference || 'بدون رقم مرجعي'}</span>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <Badge ok={p.ogs_account_found === 'Exist'}>المستقبِل: {p.ogs_account_found === 'Exist' ? 'حساب المركز ✓' : 'غير موثّق'}</Badge>
        <Badge ok={p.transaction_approved === 'Transaction Approved'}>{p.transaction_approved === 'Transaction Approved' ? 'إيصال مقبول' : 'إيصال مرفوض'}</Badge>
        <Badge ok={p.is_total_amount_correct === true}>{p.is_total_amount_correct === true ? 'المبالغ متطابقة' : 'تحقّق من المبالغ'}</Badge>
      </div>
      <div className="grid">
        <div className="k">المبلغ المحوّل</div><div className="v">{money(p.transfer_amount, p.currency)}</div>
        <div className="k">الإجمالي / الرسوم</div><div className="v">{money(p.total_amount, p.currency)} · {money(p.fees, p.currency)}</div>
        <div className="k">المُرسِل</div><div className="v">{p.sender_name || '—'} {p.sender_account ? `(${p.sender_account})` : ''}</div>
        <div className="k">حساب المستقبِل</div><div className="v">{p.receiver_account || '—'}</div>
        <div className="k">تاريخ العملية</div><div className="v">{p.tx_date_text || '—'}</div>
      </div>
      {err && <div className="error-text" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="row">
        {p.status === 'pending' && (
          <>
            <button className="btn btn-filled" disabled={busy} onClick={() => act('approve')}>قبول وتسجيل الطالب</button>
            <button className="btn btn-error" disabled={busy} onClick={() => act('reject')}>رفض</button>
          </>
        )}
        <button className="btn btn-tonal" onClick={showReceipt}>عرض الإيصال</button>
        {p.status !== 'pending' && <span className="badge badge-neutral">{p.status}</span>}
      </div>
      {img && <img className="receipt-img" src={img} alt="إيصال إنستاباي" />}
    </div>
  );
}

export default function Payments({ onLogout }) {
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  async function load() {
    setErr(''); setRows(null);
    try { setRows((await api.payments(status)).payments); }
    catch (e) { if (e.status === 401) return onLogout(); setErr('تعذّر التحميل.'); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  return (
    <>
      <h2>مدفوعات إنستاباي</h2>
      <div className="tabs">
        {TABS.map(([k, label]) => (
          <div key={k} className={`tab ${status === k ? 'active' : ''}`} onClick={() => setStatus(k)}>{label}</div>
        ))}
      </div>
      {err && <div className="error-text">{err}</div>}
      {rows === null && !err && <div className="empty">جارٍ التحميل…</div>}
      {rows && rows.length === 0 && <div className="empty">لا توجد عناصر.</div>}
      {rows && rows.map((p) => <PaymentCard key={p.id} p={p} onAction={load} />)}
    </>
  );
}
