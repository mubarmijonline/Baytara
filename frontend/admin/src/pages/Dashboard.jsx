import { useOutletContext } from 'react-router-dom';
import { useAdminLanguage } from '../i18n.jsx';
import { pageCopy } from '../page-copy.js';

function Stat({ num, lbl }) {
  return (
    <div className="stat">
      <div className="num">{num}</div>
      <div className="lbl">{lbl}</div>
    </div>
  );
}

export default function Dashboard() {
  const { stats: s } = useOutletContext();
  const { language } = useAdminLanguage();
  const copy = pageCopy('dashboard', language);
  const common = pageCopy('common', language);
  if (!s) return <div className="empty">{common.loading}</div>;
  return (
    <>
      <h2>{copy.heading}</h2>
      <div className="stat-grid">
        <Stat num={s.payments.pending} lbl={copy.pendingPayments} />
        <Stat num={s.courses.published} lbl={copy.publishedCourses(s.courses.published, s.courses.total)} />
        <Stat num={s.enrollments} lbl={copy.activeEnrollments} />
        <Stat num={s.users.students} lbl={copy.students} />
        <Stat num={s.users.instructors} lbl={copy.instructors} />
        <Stat num={s.users.total} lbl={copy.users} />
      </div>
    </>
  );
}
