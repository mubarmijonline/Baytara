import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './layouts/Layout.jsx';
import Home from './pages/Home.jsx';
import Courses from './pages/Courses.jsx';
import CourseDetail from './pages/CourseDetail.jsx';
import Bundles from './pages/Bundles.jsx';
import Paths from './pages/Paths.jsx';
import Profile from './pages/Profile.jsx';
import Certificate from './pages/Certificate.jsx';
import Exam from './pages/Exam.jsx';
import Library from './pages/Library.jsx';
import BookDetail from './pages/BookDetail.jsx';
import CompletionCertificate from './pages/CompletionCertificate.jsx';
import PathDetail from './pages/PathDetail.jsx';
import Instructor from './pages/Instructor.jsx';
import Pricing from './pages/Pricing.jsx';
import VerifyVet from './pages/VerifyVet.jsx';
import Business from './pages/Business.jsx';
import Auth from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import About from './pages/About.jsx';
import Blog from './pages/Blog.jsx';
import BlogPost from './pages/BlogPost.jsx';
import Content from './pages/Content.jsx';
import Contact from './pages/Contact.jsx';
import Privacy from './pages/Privacy.jsx';
import Refund from './pages/Refund.jsx';
import Terms from './pages/Terms.jsx';
import Delivery from './pages/Delivery.jsx';
import Learn from './pages/Learn.jsx';
import Buy from './pages/Buy.jsx';
import PaymentCallback from './pages/PaymentCallback.jsx';
import NotFound from './pages/NotFound.jsx';
import Videos from './pages/Videos.jsx';
import VideoDetail from './pages/VideoDetail.jsx';

export default function App() {
  return (
    <Routes>
      {/* Auth and Learn render without the standard shell chrome where noted */}
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/courses/:slug" element={<CourseDetail />} />
        <Route path="/videos" element={<Videos />} />
        <Route path="/videos/:id" element={<VideoDetail />} />
        <Route path="/bundles" element={<Bundles />} />
        <Route path="/paths" element={<Paths />} />
        <Route path="/paths/:slug" element={<PathDetail />} />
        <Route path="/buy/:slug" element={<Buy />} />
        <Route path="/payment/callback" element={<PaymentCallback />} />
        <Route path="/instructors/:id" element={<Instructor />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/verify" element={<VerifyVet />} />
        <Route path="/business" element={<Business />} />
        <Route path="/auth" element={<Auth />} />
        {/* The profile is the account home; the older dashboard views keep their own paths. */}
        <Route path="/dashboard" element={<Profile />} />
        <Route path="/dashboard/learning" element={<Dashboard />} />
        <Route path="/dashboard/my-courses" element={<Dashboard />} />
        <Route path="/dashboard/payments" element={<Dashboard />} />
        <Route path="/dashboard/profile" element={<Profile />} />
        <Route path="/courses/:slug/exam" element={<Exam />} />
        <Route path="/certificates/:serial" element={<Certificate />} />
        <Route path="/completion-certificates/:serial" element={<CompletionCertificate />} />
        <Route path="/about" element={<About />} />
        <Route path="/library" element={<Library />} />
        <Route path="/library/:slug" element={<BookDetail />} />
        {/* The blog index is the library now. Article URLs are unchanged, so anything
            already shared still opens. */}
        <Route path="/blog" element={<Navigate to="/library" replace />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/content" element={<Content />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/refund" element={<Refund />} />
        {/* Both required by Kashier's merchant review, which looks for them in the footer. */}
        <Route path="/terms" element={<Terms />} />
        <Route path="/delivery" element={<Delivery />} />
        <Route path="/learn/:courseId/:lessonId" element={<Learn />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
