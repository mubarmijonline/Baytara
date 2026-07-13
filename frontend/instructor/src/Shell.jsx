import { useState } from 'react';
import Dashboard from './pages/Dashboard.jsx';
import Courses from './pages/Courses.jsx';
import Students from './pages/Students.jsx';
import Revenue from './pages/Revenue.jsx';

const NAV = [
  ['dashboard', 'لوحة القيادة'],
  ['courses', 'دوراتي'],
  ['students', 'طلابي'],
  ['revenue', 'الإيرادات'],
];
const PAGES = { dashboard: Dashboard, courses: Courses, students: Students, revenue: Revenue };

export default function Shell({ onLogout }) {
  const [page, setPage] = useState('dashboard');
  const Page = PAGES[page];
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="dot" />بيطرة · المدرّب</div>
        {NAV.map(([k, label]) => (
          <div key={k} className={`navitem ${page === k ? 'active' : ''}`} onClick={() => setPage(k)}>
            <span>{label}</span>
          </div>
        ))}
        <div className="spacer" />
        <div className="navitem" onClick={onLogout}>تسجيل الخروج</div>
      </aside>
      <main className="content"><Page onLogout={onLogout} /></main>
    </div>
  );
}
