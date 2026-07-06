import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import Header from './Header.jsx';
import Footer from './Footer.jsx';

// Shared shell: header + routed page + footer. Scrolls to top on route change.
export default function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);

  return (
    <div style={{ background: '#fff', color: '#14142b', minHeight: '100vh', overflowX: 'hidden' }}>
      <Header />
      <main className="am-fade" key={pathname}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
