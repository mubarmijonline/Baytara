import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Students() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.students().then((r) => setRows(r.students)).catch(() => setErr('تعذّر التحميل.')); }, []);
  return (
    <>
      <h2>طلابي</h2>
      {err && <div className="error-text">{err}</div>}
      {!rows ? <div className="empty">جارٍ التحميل…</div> : rows.length === 0 ? <div className="empty">لا طلاب بعد.</div> : (
        <table className="table">
          <thead><tr><th>الاسم</th><th>البريد</th><th>الدورة</th></tr></thead>
          <tbody>{rows.map((s, i) => (<tr key={i}><td>{s.name}</td><td style={{ direction: 'ltr' }}>{s.email}</td><td>{s.course}</td></tr>))}</tbody>
        </table>
      )}
    </>
  );
}
