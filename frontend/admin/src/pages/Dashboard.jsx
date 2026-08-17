import { Link, useOutletContext } from 'react-router-dom';
import { useAdminLanguage } from '../i18n.jsx';
import { pageCopy } from '../page-copy.js';

// Every tile is a link. A number on a dashboard is only useful if you can get to the
// rows behind it, so each one lands on the page that lists them, already filtered.
function Stat({ num, lbl, to, tone }) {
  const body = (
    <>
      <div className="num">{num ?? 0}</div>
      <div className="lbl">{lbl}</div>
    </>
  );
  if (!to) return <div className={`stat${tone ? ` stat-${tone}` : ''}`}>{body}</div>;
  return <Link className={`stat stat-link${tone ? ` stat-${tone}` : ''}`} to={to}>{body}</Link>;
}

function Group({ title, children }) {
  return (
    <section className="stat-group">
      <h3>{title}</h3>
      <div className="stat-grid">{children}</div>
    </section>
  );
}

export default function Dashboard() {
  const { stats: s } = useOutletContext();
  const { language } = useAdminLanguage();
  const copy = pageCopy('dashboard', language);
  const common = pageCopy('common', language);
  if (!s) return <div className="empty">{common.loading}</div>;

  const money = (value) => `${Number(value || 0).toLocaleString('en-US')} ${copy.egp}`;

  return (
    <>
      <h2>{copy.heading}</h2>
      <p className="video-field-hint">{copy.subtitle}</p>

      {/* What is waiting on someone. Zero here means nothing needs attention. */}
      <Group title={copy.groups.attention}>
        <Stat num={s.payments?.pending} lbl={copy.pendingPayments} to="/payments?status=pending" tone="warn" />
        <Stat num={s.baytarian?.pending} lbl={copy.pendingBaytarian} to="/baytarian?status=pending" tone="warn" />
        <Stat num={s.messages?.unread} lbl={copy.unreadMessages} to="/messages" tone="warn" />
        <Stat num={s.videos?.no_provider} lbl={copy.videosNoProvider} to="/videos" tone="warn" />
        <Stat num={s.videos?.unassigned} lbl={copy.videosUnassigned} to="/videos?assignment=unassigned" tone="warn" />
      </Group>

      <Group title={copy.groups.money}>
        <Stat num={money(s.payments?.revenue)} lbl={copy.revenue} to="/payments?status=paid" />
        <Stat num={money(s.payments?.refunded_amount)} lbl={copy.refundedAmount} to="/payments?status=refunded" />
        <Stat num={s.payments?.paid} lbl={copy.paidPayments} to="/payments?status=paid" />
        <Stat num={s.payments?.refunded} lbl={copy.refundedPayments} to="/payments?status=refunded" />
        <Stat num={s.payments?.partially_refunded} lbl={copy.partiallyRefunded} to="/payments" />
        <Stat num={s.payments?.failed} lbl={copy.failedPayments} to="/payments?status=failed" />
      </Group>

      <Group title={copy.groups.learners}>
        <Stat num={s.enrollments?.active} lbl={copy.activeEnrollments} to="/enrollments?status=active" />
        <Stat num={s.enrollments?.expired} lbl={copy.expiredEnrollments} to="/enrollments?status=active" />
        <Stat num={s.enrollments?.cancelled} lbl={copy.cancelledEnrollments} to="/enrollments?status=cancelled" />
        <Stat num={s.users?.student} lbl={copy.students} to="/users?role=student" />
        <Stat num={s.catalog?.certificates} lbl={copy.certificates} to="/enrollments" />
        <Stat num={s.catalog?.reviews} lbl={copy.reviews} to="/reviews" />
      </Group>

      <Group title={copy.groups.catalog}>
        <Stat num={s.courses?.published} lbl={copy.publishedCourses} to="/courses?status=published" />
        <Stat num={s.courses?.draft} lbl={copy.draftCourses} to="/courses?status=draft" />
        <Stat num={s.courses?.unpublished} lbl={copy.unpublishedCourses} to="/courses?status=unpublished" />
        <Stat num={s.videos?.published} lbl={copy.publishedVideos} to="/videos?publication=published" />
        <Stat num={s.videos?.draft} lbl={copy.draftVideos} to="/videos?publication=draft" />
        <Stat num={s.catalog?.bundles} lbl={copy.bundles} to="/bundles" />
        <Stat num={s.catalog?.paths} lbl={copy.paths} to="/paths" />
        <Stat num={s.catalog?.categories} lbl={copy.categories} to="/categories" />
        <Stat num={s.catalog?.articles} lbl={copy.articles} to="/articles" />
      </Group>

      <Group title={copy.groups.people}>
        <Stat num={s.users?.total} lbl={copy.users} to="/users" />
        <Stat num={s.users?.instructor} lbl={copy.instructors} to="/instructors" />
        <Stat num={s.users?.admin} lbl={copy.admins} to="/users?role=admin" />
        <Stat num={s.users?.inactive} lbl={copy.inactiveUsers} to="/users" />
      </Group>
    </>
  );
}
