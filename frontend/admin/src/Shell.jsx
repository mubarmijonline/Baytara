import { useEffect, useState } from 'react';
import { api } from './api.js';
import Dashboard from './pages/Dashboard.jsx';
import Payments from './pages/Payments.jsx';
import Courses from './pages/Courses.jsx';
import Bundles from './pages/Bundles.jsx';
import Videos from './pages/Videos.jsx';
import Baytarian from './pages/Baytarian.jsx';
import Users from './pages/Users.jsx';
import Categories from './pages/Categories.jsx';
import Articles from './pages/Articles.jsx';
import Messages from './pages/Messages.jsx';
import Settings from './pages/Settings.jsx';
import Hierarchy from './pages/Hierarchy.jsx';

const NAV = [
  ['dashboard', 'لوحة القيادة'],
  ['payments', 'المعاملات'],
  ['baytarian', 'توثيق الأطباء'],
  ['courses', 'الدورات'],
  ['videos', 'الفيديوهات'],
  ['bundles', 'الحزم'],
  ['hierarchy', 'الهيكلة'],
  ['categories', 'الفئات'],
  ['articles', 'المحتوى والمدوّنة'],
  ['users', 'المستخدمون'],
  ['messages', 'الرسائل'],
  ['settings', 'إعدادات الموقع'],
];
const PAGES = { dashboard: Dashboard, payments: Payments, baytarian: Baytarian, courses: Courses, videos: Videos, bundles: Bundles, hierarchy: Hierarchy, categories: Categories, articles: Articles, users: Users, messages: Messages, settings: Settings };

export default function Shell({ onLogout }) {
  const [page, setPage] = useState('dashboard');
  const [pending, setPending] = useState(0);
  const [baytPending, setBaytPending] = useState(0);

  useEffect(() => {
    api.stats().then((s) => { setPending(s.payments.pending); setBaytPending(s.baytarian?.pending || 0); }).catch((e) => {
      if (e.status === 401) onLogout();
    });
  }, [page, onLogout]);

  const Page = PAGES[page];
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="dot" />بيطرة · الإدارة</div>
        {NAV.map(([k, label]) => (
          <div key={k} className={`navitem ${page === k ? 'active' : ''}`} onClick={() => setPage(k)}>
            <span>{label}</span>
            {k === 'payments' && pending ? <span className="count">{pending}</span> : null}
            {k === 'baytarian' && baytPending ? <span className="count">{baytPending}</span> : null}
          </div>
        ))}
        <div className="spacer" />
        <div className="navitem" onClick={onLogout}>تسجيل الخروج</div>
      </aside>
      <main className="content">
        <Page onLogout={onLogout} />
      </main>
    </div>
  );
}
