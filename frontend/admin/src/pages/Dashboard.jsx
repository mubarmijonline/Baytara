import { useEffect, useState } from 'react';
import { api } from '../api.js';

function Stat({ num, lbl }) {
  return (
    <div className="stat">
      <div className="num">{num}</div>
      <div className="lbl">{lbl}</div>
    </div>
  );
}

export default function Dashboard() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.stats().then(setS).catch(() => setErr('تعذّر تحميل الإحصاءات.'));
  }, []);

  if (err) return <div className="error-text">{err}</div>;
  if (!s) return <div className="empty">جارٍ التحميل…</div>;
  return (
    <>
      <h2>لوحة القيادة</h2>
      <div className="stat-grid">
        <Stat num={s.payments.pending} lbl="مدفوعات بانتظار المراجعة" />
        <Stat num={s.courses.published} lbl={`دورات منشورة (من ${s.courses.total})`} />
        <Stat num={s.enrollments} lbl="اشتراكات نشطة" />
        <Stat num={s.users.students} lbl="طلاب" />
        <Stat num={s.users.instructors} lbl="مدرّبون" />
        <Stat num={s.users.total} lbl="إجمالي المستخدمين" />
      </div>
    </>
  );
}
