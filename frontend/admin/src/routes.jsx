import { Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import Shell from './Shell.jsx';
import { useAdminLanguage } from './i18n.jsx';
import Articles from './pages/Articles.jsx';
import Baytarian from './pages/Baytarian.jsx';
import Bundles from './pages/Bundles.jsx';
import Categories from './pages/Categories.jsx';
import Courses from './pages/Courses.jsx';
import CourseContent from './pages/CourseContent.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Hierarchy from './pages/Hierarchy.jsx';
import Messages from './pages/Messages.jsx';
import Payments from './pages/Payments.jsx';
import Settings from './pages/Settings.jsx';
import Instructors from './pages/Instructors.jsx';
import Users from './pages/Users.jsx';
import Videos from './pages/Videos.jsx';
import VideoEditor from './pages/VideoEditor.jsx';
import VideoReports from './pages/VideoReports.jsx';

const sectionRoutes = [
  ['dashboard', Dashboard],
  ['payments', Payments],
  ['payments/:paymentId', Payments],
  ['baytarian', Baytarian],
  ['baytarian/:requestId', Baytarian],
  ['courses', Courses],
  ['courses/new', Courses],
  ['courses/:courseId/edit', Courses],
  ['courses/:courseId/content', CourseContent],
  ['videos', Videos],
  ['videos/new', VideoEditor],
  ['videos/:videoId', VideoEditor],
  ['video-reports', VideoReports],
  ['video-reports/:sessionId', VideoReports],
  ['bundles', Bundles],
  ['bundles/new', Bundles],
  ['bundles/:bundleId/edit', Bundles],
  ['hierarchy', Hierarchy],
  ['categories', Categories],
  ['articles', Articles],
  ['articles/new', Articles],
  ['articles/:articleId/edit', Articles],
  ['instructors', Instructors],
  ['instructors/:instructorId', Instructors],
  ['users', Users],
  ['users/:userId', Users],
  ['messages', Messages],
  ['messages/:messageId', Messages],
  ['settings', Settings],
];

function RoutedPage({ Page, onLogout }) {
  const routeParams = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  return (
    <Page
      onLogout={onLogout}
      routeParams={routeParams}
      searchParams={searchParams}
      setSearchParams={setSearchParams}
    />
  );
}

function AdminNotFound() {
  const { t } = useAdminLanguage();
  return <h2>{t('pages.notFound')}</h2>;
}

export function AdminRoutes({ onLogout }) {
  return (
    <Routes>
      <Route element={<Shell onLogout={onLogout} />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        {sectionRoutes.map(([path, Page]) => (
          <Route key={path} path={path} element={<RoutedPage Page={Page} onLogout={onLogout} />} />
        ))}
        <Route path="*" element={<AdminNotFound />} />
      </Route>
    </Routes>
  );
}
