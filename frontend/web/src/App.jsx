import { Routes, Route } from 'react-router-dom';
import Layout from './layouts/Layout.jsx';
import Home from './pages/Home.jsx';
import Courses from './pages/Courses.jsx';
import CourseDetail from './pages/CourseDetail.jsx';
import Instructor from './pages/Instructor.jsx';
import Pricing from './pages/Pricing.jsx';
import Business from './pages/Business.jsx';
import Auth from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import About from './pages/About.jsx';
import Blog from './pages/Blog.jsx';
import BlogPost from './pages/BlogPost.jsx';
import Content from './pages/Content.jsx';
import Contact from './pages/Contact.jsx';
import Learn from './pages/Learn.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      {/* Auth and Learn render without the standard shell chrome where noted */}
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/courses/:slug" element={<CourseDetail />} />
        <Route path="/instructors/:id" element={<Instructor />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/business" element={<Business />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/my-courses" element={<Dashboard />} />
        <Route path="/dashboard/payments" element={<Dashboard />} />
        <Route path="/dashboard/profile" element={<Dashboard />} />
        <Route path="/about" element={<About />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/content" element={<Content />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/learn/:courseId/:lessonId" element={<Learn />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
