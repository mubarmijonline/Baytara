import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Revenue() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.payments().then(setData).catch(() => setErr('تعذّر التحميل.')); }, []);
  return (
    <>
      <h2>الإيرادات {data ? <span className="badge badge-ok">{data.total} ج.م</span> : null}</h2>
      {err && <div className="error-text">{err}</div>}
      {!data ? <div className="empty">جارٍ التحميل…</div> : data.payments.length === 0 ? <div className="empty">لا مدفوعات مقبولة بعد.</div> : (
        <table className="table">
          <thead><tr><th>#</th><th>المبلغ</th><th>المرجع</th><th>التاريخ</th></tr></thead>
          <tbody>{data.payments.map((p) => (
            <tr key={p.id}><td>{p.id}</td><td>{p.transfer_amount} {p.currency}</td><td>{p.reference || '—'}</td>
              <td>{(p.created_at || '').slice(0, 10)}</td></tr>
          ))}</tbody>
        </table>
      )}
    </>
  );
}
