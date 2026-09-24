import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Mail,
  Newspaper,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  Unlink,
  Upload,
  Video,
} from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { notifyAdminStatsChanged } from '../admin-stats.js';
import { useAdminLanguage } from '../i18n.jsx';
import { pageCopy } from '../page-copy.js';

// Binary units, because that is what a disk reports. One decimal past MB: "1.4 GB"
// answers "can I upload another lecture", "1.42 GB" does not.
function bytes(value) {
  const n = Number(value || 0);
  if (!n) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const size = n / (1024 ** i);
  return `${size >= 100 || i < 2 ? Math.round(size) : size.toFixed(1)} ${units[i]}`;
}

// Disk taken by self-hosted video. Loaded on its own because it walks the filesystem.
function StorageCard({ copy, common, reloadKey }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api.storage()
      .then((r) => live && setData(r.storage))
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [reloadKey]);

  if (failed) return null;
  if (!data) return <section className="stat-group"><h3>{copy.storageTitle}</h3><div className="empty">{common.loading}</div></section>;

  // The card is about the upload directory, not the machine. The bar shows what is
  // inside that directory — the biggest videos against the folder's own total — so a
  // full-looking bar means "these few files are most of it", never "the server is full".
  const total = data.videos_bytes || 0;
  const share = (value) => (total ? Math.min(100, (value / total) * 100) : 0);
  const top = data.largest.slice(0, 5);
  const rest = total - top.reduce((sum, row) => sum + row.bytes, 0);
  const average = data.video_count ? total / data.video_count : 0;

  return (
    <section className="stat-group">
      <h3>{copy.storageTitle}</h3>
      <div className="storage-card">
        <div className="storage-figures">
          <div><b>{bytes(total)}</b><span>{copy.storageVideos}</span></div>
          <div><b>{data.video_count}</b><span>{copy.storageCount}</span></div>
          <div><b>{bytes(average)}</b><span>{copy.storageAverage}</span></div>
          <div><b>{bytes(data.disk_free_bytes)}</b><span>{copy.storageHeadroom}</span></div>
        </div>

        {total > 0 && (
          <>
            <div className="storage-bar" role="img"
                 aria-label={`${copy.storageVideos}: ${bytes(total)}`}>
              {top.map((row, index) => (
                <span key={row.lesson_id ?? `top-${index}`}
                      className={`storage-bar-seg seg-${index % 5}`}
                      style={{ width: `${share(row.bytes)}%` }}
                      title={`${row.title || `#${row.lesson_id}`} — ${bytes(row.bytes)}`} />
              ))}
              {rest > 0 && <span className="storage-bar-rest" style={{ width: `${share(rest)}%` }} />}
            </div>
            <div className="storage-legend">
              {top.map((row, index) => (
                <span key={row.lesson_id ?? `legend-${index}`}>
                  <i className={`seg-${index % 5}`} /> {row.title || `#${row.lesson_id}`}
                </span>
              ))}
              {rest > 0 && <span><i className="seg-rest" /> {copy.storageRest}</span>}
            </div>
          </>
        )}

        {data.largest.length > 0 && (
          <table className="table storage-largest">
            <thead><tr><th>{copy.storageLargest}</th><th>{copy.storageSize}</th></tr></thead>
            <tbody>
              {data.largest.map((row) => (
                <tr key={row.lesson_id ?? `orphan-${row.bytes}`}>
                  <td>
                    {row.lesson_id && row.title
                      ? <Link to={`/videos/${row.lesson_id}`}>{row.title}</Link>
                      : <span className="chip chip-unpublished">{copy.storageOrphan} #{row.lesson_id ?? '—'}</span>}
                  </td>
                  <td>{bytes(row.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="video-field-hint">{copy.storagePath}: <code dir="ltr">{data.path}</code></div>
      </div>
    </section>
  );
}

/** A row in the work queue. The count leads, because the count is the decision:
 *  nothing waiting is a row you can skip, eight waiting is the next half hour. */
function QueueRow({ item, dir, copy }) {
  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight;
  return (
    <Link className="queue-row" to={item.to}>
      <span className="queue-icon"><item.Icon size={18} aria-hidden="true" /></span>
      <span className="queue-copy">
        <strong>{item.count}</strong>
        <span>{item.label}</span>
      </span>
      <span className="queue-go">{copy.review} <Arrow size={15} aria-hidden="true" /></span>
    </Link>
  );
}

/** A figure that is context rather than work: a label, a number, and the rows behind it.
 *  Compact on purpose — thirty tiles of equal weight is thirty things to read. */
function Figure({ label, value, to }) {
  return (
    <Link className="figure" to={to}>
      <span className="figure-label">{label}</span>
      <span className="figure-value">{value ?? 0}</span>
    </Link>
  );
}

function Panel({ title, children }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      <div className="figure-list">{children}</div>
    </section>
  );
}

export default function Dashboard() {
  const { stats: s } = useOutletContext();
  const { language, direction } = useAdminLanguage();
  const copy = pageCopy('dashboard', language);
  const common = pageCopy('common', language);
  const [reloadKey, setReloadKey] = useState(0);

  if (!s) return <div className="empty">{common.loading}</div>;

  const money = (value) => `${Number(value || 0).toLocaleString('en-US')} ${copy.egp}`;

  // Every queue keeps its link whether or not it has anything in it — a cleared queue
  // is still a place an admin goes to look. What changes is the weight it is given.
  const queue = [
    { key: 'payments', count: s.payments?.pending || 0, label: copy.pendingPayments, to: '/payments?status=pending', Icon: ClipboardList },
    { key: 'baytarian', count: s.baytarian?.pending || 0, label: copy.pendingBaytarian, to: '/baytarian?status=pending', Icon: BadgeCheck },
    { key: 'messages', count: s.messages?.unread || 0, label: copy.unreadMessages, to: '/messages', Icon: Mail },
    { key: 'noProvider', count: s.videos?.no_provider || 0, label: copy.videosNoProvider, to: '/videos', Icon: Video },
    { key: 'unassigned', count: s.videos?.unassigned || 0, label: copy.videosUnassigned, to: '/videos?assignment=unassigned', Icon: Unlink },
  ];
  const waiting = queue.filter((item) => item.count > 0).sort((a, b) => b.count - a.count);
  const cleared = queue.filter((item) => item.count === 0);

  const quickActions = [
    { to: '/courses/new', label: copy.newCourse, Icon: Plus },
    { to: '/videos/upload', label: copy.newVideo, Icon: Upload },
    { to: '/articles/new', label: copy.newArticle, Icon: Newspaper },
    { to: '/bundles/new', label: copy.newBundle, Icon: Boxes },
    { to: '/paths/new', label: copy.newPath, Icon: RouteIcon },
  ];

  function refresh() {
    notifyAdminStatsChanged();
    setReloadKey((value) => value + 1);
  }

  return (
    <>
      <header className="dash-header">
        <div>
          <h2>{copy.heading}</h2>
          <p className="video-field-hint">{copy.subtitle}</p>
        </div>
        <button type="button" className="btn btn-tonal btn-sm" onClick={refresh}>
          <RefreshCw size={15} aria-hidden="true" /> {copy.refresh}
        </button>
      </header>

      {/* What is waiting on someone. This is the reason to open the page at all, so it
          comes before every other figure and says so in a sentence when it is empty. */}
      <section className="stat-group">
        <h3>
          {copy.groups.attention}
          {waiting.length > 0 && <span className="queue-tally">{waiting.reduce((sum, item) => sum + item.count, 0)}</span>}
        </h3>

        {waiting.length === 0 ? (
          <div className="queue-clear">
            <CheckCircle2 size={22} aria-hidden="true" />
            <div>
              <strong>{copy.allClear}</strong>
              <span>{copy.allClearHint}</span>
            </div>
          </div>
        ) : (
          <div className="queue-list">
            {waiting.map((item) => <QueueRow key={item.key} item={item} dir={direction} copy={copy} />)}
          </div>
        )}

        {cleared.length > 0 && (
          <div className="queue-cleared">
            <CheckCircle2 size={14} aria-hidden="true" className="queue-cleared-icon" />
            <span className="queue-cleared-label">{copy.cleared}</span>
            {cleared.map((item) => (
              <Link key={item.key} className="queue-cleared-link" to={item.to}>{item.label}</Link>
            ))}
          </div>
        )}
      </section>

      {/* The five things an admin starts rather than reviews. */}
      <section className="stat-group">
        <h3>{copy.quickActions}</h3>
        <div className="quick-actions">
          {quickActions.map((action) => (
            <Link key={action.to} className="quick-action" to={action.to}>
              <action.Icon size={16} aria-hidden="true" />
              <span>{action.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Money leads with the one number that is asked about daily; the statuses behind
          it stay one click away instead of taking four tiles of their own. */}
      <section className="stat-group">
        <h3>{copy.groups.money}</h3>
        <div className="money-card">
          <Link className="money-headline" to="/payments?status=paid">
            <span>{copy.revenue}</span>
            <strong>{money(s.payments?.revenue)}</strong>
          </Link>
          <Link className="money-headline money-secondary" to="/payments?status=refunded">
            <span>{copy.refundedAmount}</span>
            <strong>{money(s.payments?.refunded_amount)}</strong>
          </Link>
          <div className="money-breakdown">
            <Figure label={copy.paidPayments} value={s.payments?.paid} to="/payments?status=paid" />
            <Figure label={copy.refundedPayments} value={s.payments?.refunded} to="/payments?status=refunded" />
            <Figure label={copy.partiallyRefunded} value={s.payments?.partially_refunded} to="/payments" />
            <Figure label={copy.failedPayments} value={s.payments?.failed} to="/payments?status=failed" />
          </div>
        </div>
      </section>

      {/* Everything else is reference: dense, sorted by subject, every figure still a
          link to the rows it counts. */}
      <div className="dash-panels">
        <Panel title={copy.groups.learners}>
          <Figure label={copy.activeEnrollments} value={s.enrollments?.active} to="/enrollments?status=active" />
          <Figure label={copy.expiredEnrollments} value={s.enrollments?.expired} to="/enrollments?status=active" />
          <Figure label={copy.cancelledEnrollments} value={s.enrollments?.cancelled} to="/enrollments?status=cancelled" />
          <Figure label={copy.students} value={s.users?.student} to="/users?role=student" />
          <Figure label={copy.certificates} value={s.catalog?.certificates} to="/enrollments" />
          <Figure label={copy.reviews} value={s.catalog?.reviews} to="/reviews" />
        </Panel>

        <Panel title={copy.groups.catalog}>
          <Figure label={copy.publishedCourses} value={s.courses?.published} to="/courses?status=published" />
          <Figure label={copy.draftCourses} value={s.courses?.draft} to="/courses?status=draft" />
          <Figure label={copy.unpublishedCourses} value={s.courses?.unpublished} to="/courses?status=unpublished" />
          <Figure label={copy.publishedVideos} value={s.videos?.published} to="/videos?publication=published" />
          <Figure label={copy.draftVideos} value={s.videos?.draft} to="/videos?publication=draft" />
          <Figure label={copy.bundles} value={s.catalog?.bundles} to="/bundles" />
          <Figure label={copy.paths} value={s.catalog?.paths} to="/paths" />
          <Figure label={copy.categories} value={s.catalog?.categories} to="/categories" />
          <Figure label={copy.articles} value={s.catalog?.articles} to="/articles" />
        </Panel>

        <Panel title={copy.groups.people}>
          <Figure label={copy.users} value={s.users?.total} to="/users" />
          <Figure label={copy.instructors} value={s.users?.instructor} to="/instructors" />
          <Figure label={copy.admins} value={s.users?.admin} to="/users?role=admin" />
          <Figure label={copy.inactiveUsers} value={s.users?.inactive} to="/users" />
        </Panel>
      </div>

      <StorageCard copy={copy} common={common} reloadKey={reloadKey} />
    </>
  );
}
