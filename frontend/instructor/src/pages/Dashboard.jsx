import { useEffect, useState } from 'react';
import { api } from '../api.js';

const Stat = ({ num, lbl }) => (<div className="stat"><div className="num">{num}</div><div className="lbl">{lbl}</div></div>);

export default function Dashboard({ onLogout }) {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.stats().then(setS).catch((e) => { if (e.status === 401) onLogout(); else setErr('تعذّر التحميل.'); });
  }, [onLogout]);
  if (err) return <div className="error-text">{err}</div>;
  if (!s) return <div className="empty">جارٍ التحميل…</div>;
  return (
    <>
      <h2>لوحة القيادة</h2>
      <div className="stat-grid">
        <Stat num={s.courses} lbl="دوراتي" />
        <Stat num={s.published} lbl="منشورة" />
        <Stat num={s.students} lbl="طلابي" />
        <Stat num={`${s.revenue} ج.م`} lbl="إجمالي الإيرادات" />
      </div>
    </>
  );
}
