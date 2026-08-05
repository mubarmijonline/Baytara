import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import { colors } from '../theme/tokens.js';
import { auth, getDeviceId } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';

function daysLeft(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso) - new Date()) / 86400000);
}

function dateLabel(iso, lang) {
  if (!iso) return '-';
  try {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'ar-EG', { dateStyle: 'medium' }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

function money(payment) {
  if (payment.amount == null) return '';
  return `${Number(payment.amount).toLocaleString()} ${payment.currency || 'EGP'}`;
}

function timeLabel(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

function remainingLabel(video, t) {
  const left = Math.max(0, Number(video.duration_seconds || 0) - Number(video.watched_seconds || 0));
  return left ? t('dashboard.remainingTime').replace('{time}', timeLabel(left)) : t('dashboard.videoReady');
}

function prettyCategory(value, t) {
  if (!value) return t('dashboard.videoLesson');
  return String(value).replace(/[-_]+/g, ' ');
}

function pct(value) {
  return `${Math.max(0, Math.min(100, Number(value) || 0))}%`;
}

function statusCopy(status, t) {
  return t(`dashboard.status.${status || 'unknown'}`);
}

function sourceCopy(source, t) {
  return t(`dashboard.source.${source || 'unknown'}`);
}

function courseMeta(course) {
  return [course?.category?.name, course?.instructor?.name].filter(Boolean).join(' · ');
}

function Card({ children, className = '' }) {
  return <section className={`student-card ${className}`}>{children}</section>;
}

function Metric({ value, unit, label }) {
  return (
    <div className="student-metric">
      <strong>{value}</strong>
      <span>{unit}</span>
      <small>{label}</small>
    </div>
  );
}

function ModeToggle({ mode, setMode, t }) {
  return (
    <div className="student-mode-toggle" aria-label={t('dashboard.modeLabel')}>
      <button type="button" className={mode === 'new' ? 'active' : ''} onClick={() => setMode('new')}>{t('dashboard.modeNew')}</button>
      <button type="button" className={mode === 'active' ? 'active' : ''} onClick={() => setMode('active')}>{t('dashboard.modeActive')}</button>
    </div>
  );
}

function SetupChecklist({ items, progress, t }) {
  return (
    <Card className="student-onboarding-card">
      <div className="student-section-heading">
        <div>
          <h2>{t('dashboard.setupTitle')}</h2>
          <p>{t('dashboard.setupSubtitle')}</p>
        </div>
        <span>{progress}%</span>
      </div>
      <div className="student-setup-progress" aria-label={t('dashboard.setupTitle')}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="student-setup-list">
        {items.map((item) => (
          <button type="button" key={item.title} className={item.done ? 'done' : ''} onClick={item.action}>
            <span>{item.done ? '✓' : item.index}</span>
            <div>
              <strong>{item.title}</strong>
              <small>{item.text}</small>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

function Empty({ children }) {
  return <div className="student-empty">{children}</div>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const { user, updateProfile, logout, loading } = useAuth();
  const { lang, t } = useI18n();
  const [enrollments, setEnrollments] = useState(null);
  const [devices, setDevices] = useState([]);
  const [baytarian, setBaytarian] = useState(null);
  const [payments, setPayments] = useState([]);
  const [videos, setVideos] = useState(null);
  const [profilePhone, setProfilePhone] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [modeOverride, setModeOverride] = useState('');

  const loadDevices = () => auth.devices().then((r) => setDevices(r.devices || [])).catch(() => setDevices([]));

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
      return;
    }
    if (!user) return;
    auth.enrollments().then((r) => setEnrollments(r.enrollments || [])).catch(() => setEnrollments([]));
    auth.baytarianMe().then(setBaytarian).catch(() => setBaytarian({ is_baytarian: !!user.is_baytarian }));
    auth.myPayments().then((r) => setPayments(r.payments || [])).catch(() => setPayments([]));
    auth.videoProgress().then((r) => setVideos(r.videos || [])).catch(() => setVideos([]));
    loadDevices();
  }, [user, loading, navigate]);

  useEffect(() => setProfilePhone(user?.phone || ''), [user?.phone]);

  async function removeDevice(id) {
    try {
      await auth.removeDevice(id);
      loadDevices();
    } catch {
      /* keep the dashboard usable when a stale device disappears server-side */
    }
  }

  async function savePhone(event) {
    event.preventDefault();
    setProfileBusy(true);
    setProfileError('');
    try {
      await updateProfile(profilePhone);
      const requestedNext = searchParams.get('next') || '/dashboard';
      navigate(requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/dashboard');
    } catch {
      setProfileError(t('profile.phoneError'));
    } finally {
      setProfileBusy(false);
    }
  }

  const rows = enrollments || [];
  const totalCourses = rows.length;
  const completedLessons = rows.reduce((sum, row) => sum + (row.progress?.completed_lessons || 0), 0);
  const watchedOpen = rows.reduce((sum, row) => sum + (row.progress?.watched_not_completed || 0), 0);
  const watchedVideos = videos || [];
  const completedCourses = rows.filter((row) => (row.progress?.percent || 0) >= 100).length;
  const pendingPayments = payments.filter((payment) => payment.status === 'pending' || payment.status === 'review').length;
  const latestRequest = baytarian?.request;
  const isVerified = !!(baytarian?.is_baytarian || user?.is_baytarian);
  const hasActivity = totalCourses > 0 || watchedVideos.length > 0 || payments.length > 0 || !!latestRequest;
  const dashboardMode = modeOverride || (hasActivity ? 'active' : 'new');
  const isOverview = pathname === '/dashboard';
  const isCourses = pathname === '/dashboard/my-courses';
  const isPayments = pathname === '/dashboard/payments';
  const isProfile = pathname === '/dashboard/profile';
  const heroSubtitle = isCourses
    ? t('dashboard.subtitleCourses')
    : isPayments
      ? t('dashboard.subtitleRequests')
      : isProfile
        ? t('dashboard.subtitleProfile')
        : dashboardMode === 'new'
          ? t('dashboard.startSubtitle')
        : totalCourses
          ? t('dashboard.subtitleActive').replace('{count}', totalCourses)
          : t('dashboard.subtitleEmpty');
  const requestRows = useMemo(() => {
    const verification = latestRequest ? [{
      id: `baytarian-${latestRequest.id}`,
      title: t('dashboard.petDoctorVerification'),
      status: latestRequest.status,
      meta: dateLabel(latestRequest.created_at, lang),
      amount: '',
    }] : [];
    const paymentRows = payments.slice(0, 4).map((payment) => ({
      id: `payment-${payment.id}`,
      title: payment.status === 'pending' ? t('dashboard.paymentPending') : t('dashboard.paymentRequest'),
      status: payment.status,
      meta: [sourceCopy(payment.kind, t), dateLabel(payment.created_at, lang)].filter(Boolean).join(' · '),
      amount: money(payment),
    }));
    return [...verification, ...paymentRows];
  }, [latestRequest, payments, lang, t]);
  const thisDevice = getDeviceId();
  const name = user?.name || '';
  const setupItems = [
    {
      index: 1,
      done: !!(user?.phone || '').trim(),
      title: t('dashboard.setupPhone'),
      text: t('dashboard.setupPhoneHint'),
      action: () => navigate('/dashboard/profile'),
    },
    {
      index: 2,
      done: watchedVideos.length > 0,
      title: t('dashboard.setupVideo'),
      text: t('dashboard.setupVideoHint'),
      action: () => navigate('/videos'),
    },
    {
      index: 3,
      done: totalCourses > 0,
      title: t('dashboard.setupCourse'),
      text: t('dashboard.setupCourseHint'),
      action: () => navigate('/courses'),
    },
    {
      index: 4,
      done: isVerified || !!latestRequest,
      title: t('dashboard.setupVerify'),
      text: t('dashboard.setupVerifyHint'),
      action: () => navigate('/pricing'),
    },
  ];
  const setupDone = setupItems.filter((item) => item.done).length;
  const setupProgress = Math.round(setupDone / setupItems.length * 100);
  const navItems = [
    ['/dashboard', t('dashboard.nav.overview'), 0],
    ['/dashboard/my-courses', t('dashboard.nav.courses'), totalCourses],
    ['/dashboard/payments', t('dashboard.nav.requests'), requestRows.length],
    ['/dashboard/profile', t('dashboard.nav.profile'), devices.length],
  ];

  if (loading || (!user && !loading)) {
    return <div style={{ minHeight: 420, background: colors.surfaceMuted }}><Container style={{ padding: '44px 24px' }}>{t('common.loading')}</Container></div>;
  }

  return (
    <div className="student-dashboard">
      <Container className="student-dashboard-shell">
        <aside className="student-sidebar hide-md">
          <div className="student-profile-mini">
            <span>{(name || t('dashboard.studentInitial')).charAt(0)}</span>
            <div>
              <strong>{name || t('dashboard.student')}</strong>
              <small>{user?.email || ''}</small>
            </div>
          </div>
          <button type="button" className={`student-side-verify ${isVerified ? 'verified' : latestRequest?.status || ''}`} onClick={() => navigate('/pricing')}>
            <strong>{isVerified ? t('dashboard.verifiedPetDoctor') : latestRequest ? statusCopy(latestRequest.status, t) : t('dashboard.notVerified')}</strong>
            <small>{isVerified ? t('dashboard.verifiedShort') : t('dashboard.verifyShort')}</small>
          </button>
          {navItems.map(([to, label, count]) => (
            <button key={to} className={pathname === to ? 'active' : ''} type="button" onClick={() => navigate(to)}>
              <span>{label}</span>
              {count > 0 && <b>{count}</b>}
            </button>
          ))}
          <button type="button" className="danger" onClick={() => { logout(); navigate('/'); }}>{t('nav.logout')}</button>
        </aside>

        <main className="student-dashboard-main">
          {isOverview && (
            <div className="student-dashboard-topline">
              <ModeToggle mode={dashboardMode} setMode={setModeOverride} t={t} />
            </div>
          )}

          {pathname === '/dashboard/profile' && (
            <Card className="student-profile-form">
              <form onSubmit={savePhone}>
                <h2>{t('profile.phoneTitle')}</h2>
                <p>{t('profile.phoneDescription')}</p>
                <label htmlFor="profile-phone">{t('auth.phone')}</label>
                <div>
                  <input id="profile-phone" required value={profilePhone} onChange={(event) => setProfilePhone(event.target.value)} placeholder="+2010xxxxxxxx" />
                  <button type="submit" disabled={profileBusy}>{profileBusy ? t('common.loading') : t('profile.phoneSave')}</button>
                </div>
                {profileError && <p role="alert" className="student-error">{profileError}</p>}
              </form>
            </Card>
          )}

          <section className="student-hero">
            <div>
              <span>{t('dashboard.accountWorkspace')}</span>
              <h1>{dashboardMode === 'new' && isOverview ? t('dashboard.startTitle') : t('dashboard.heading')}</h1>
              <p>{heroSubtitle}</p>
            </div>
          </section>

          {isOverview && (
            <section className={`student-verification-bar ${isVerified ? 'verified' : latestRequest?.status || ''}`}>
              <div>
                <strong>{isVerified ? t('dashboard.verifiedPetDoctor') : latestRequest ? statusCopy(latestRequest.status, t) : t('dashboard.verifyActionTitle')}</strong>
                <p>{isVerified ? t('dashboard.verifiedAccess') : t('dashboard.verifyHint')}</p>
              </div>
              {!isVerified && <button type="button" onClick={() => navigate('/pricing')}>{t('dashboard.verifyAction')}</button>}
            </section>
          )}

          {isOverview && dashboardMode === 'new' && (
            <SetupChecklist items={setupItems} progress={setupProgress} t={t} />
          )}

          {isOverview && dashboardMode === 'active' && (
            <div className="student-metric-strip">
              <Metric value={totalCourses} unit={t('dashboard.unitCourses')} label={t('dashboard.registeredCourses')} />
              <Metric value={completedLessons} unit={t('dashboard.unitLessons')} label={t('dashboard.completedLessons')} />
              <Metric value={watchedOpen} unit={t('dashboard.unitLessons')} label={t('dashboard.watchedNotCompleted')} />
              <Metric value={watchedVideos.length} unit={t('dashboard.unitVideos')} label={t('dashboard.videoProgress')} />
            </div>
          )}

          {(isCourses || (isOverview && dashboardMode === 'active')) && <Card className="student-video-card">
            <div className="student-section-heading">
              <div>
                <h2>{t('dashboard.continueWatching')}</h2>
                <p>{t('dashboard.resumeSubtitle')}</p>
              </div>
              <button type="button" onClick={() => navigate('/videos')}>{t('common.viewAll')}</button>
            </div>
            <div className="student-video-list">
              {videos === null && <Empty>{t('common.loading')}</Empty>}
              {videos !== null && !watchedVideos.length && <Empty>{t('dashboard.noVideos')}</Empty>}
              {watchedVideos.map((video) => (
                <article key={video.id} className="student-video-row">
                  <button type="button" className="student-video-play" onClick={() => navigate(`/videos/${video.id}`)} aria-label={video.title}><span /></button>
                  <div className="student-video-body">
                    <div>
                      <small>{prettyCategory(video.category, t)} · {sourceCopy(video.access_type, t)}</small>
                      <h3>{video.title}</h3>
                    </div>
                    <div className="student-progress-bar" aria-label={t('dashboard.videoProgress')}>
                      <span style={{ width: pct(video.completion_percent) }} />
                    </div>
                    <div className="student-course-meta">
                      <span>{t('dashboard.watchedPercent').replace('{percent}', video.completion_percent || 0)}</span>
                      <span>{remainingLabel(video, t)}</span>
                    </div>
                  </div>
                  <button type="button" className="student-action secondary" onClick={() => navigate(`/videos/${video.id}`)}>{t('dashboard.watchNow')}</button>
                </article>
              ))}
            </div>
          </Card>}

          {(isProfile || isPayments || (isOverview && dashboardMode === 'active')) && <div className="student-dashboard-grid student-dashboard-grid-uneven">
            {isProfile && (
            <Card className="student-account-card">
              <div className="student-section-heading">
                <h2>{t('dashboard.studentData')}</h2>
                <span>{user?.role || t('dashboard.student')}</span>
              </div>
              <dl className="student-facts">
                <div><dt>{t('dashboard.name')}</dt><dd>{name || '-'}</dd></div>
                <div><dt>{t('dashboard.email')}</dt><dd>{user?.email || '-'}</dd></div>
                <div><dt>{t('auth.phone')}</dt><dd>{user?.phone || t('dashboard.phoneMissing')}</dd></div>
                <div><dt>{t('dashboard.petDoctorStatus')}</dt><dd>{isVerified ? t('dashboard.verifiedPetDoctor') : latestRequest ? statusCopy(latestRequest.status, t) : t('dashboard.notRequested')}</dd></div>
              </dl>
            </Card>
            )}

            {(isOverview || isPayments) && (
            <Card>
              <div className="student-section-heading">
                <h2>{t('dashboard.recentRequests')}</h2>
                <span>{pendingPayments ? t('dashboard.pendingCount').replace('{count}', pendingPayments) : t('dashboard.upToDate')}</span>
              </div>
              <div className="student-request-list">
                {!requestRows.length && <Empty>{t('dashboard.noRequests')}</Empty>}
                {requestRows.map((item) => (
                  <div key={item.id} className="student-request-row">
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.meta}</small>
                    </div>
                    <span className={`student-status status-${item.status || 'unknown'}`}>{statusCopy(item.status, t)}</span>
                    {item.amount && <b>{item.amount}</b>}
                  </div>
                ))}
              </div>
            </Card>
            )}
          </div>}

          {(isCourses || (isOverview && dashboardMode === 'active')) && <Card className="student-courses-card">
            <div className="student-section-heading">
              <div>
                <h2>{t('dashboard.registeredCourses')}</h2>
                <p>{t('dashboard.learningSnapshot')}: {completedCourses} {t('dashboard.completedCourses')}</p>
              </div>
              <button type="button" onClick={() => navigate('/courses')}>{t('common.viewAll')}</button>
            </div>
            <div className="student-course-list">
              {enrollments === null && <Empty>{t('common.loading')}</Empty>}
              {enrollments !== null && !rows.length && <Empty>{t('dashboard.noCourses')}</Empty>}
              {rows.map((enrollment) => {
                const course = enrollment.course || {};
                const progress = enrollment.progress || {};
                const left = Math.max(0, (progress.total_lessons || 0) - (progress.completed_lessons || 0));
                const remaining = left ? t('dashboard.remainingLessons').replace('{count}', left) : t('dashboard.courseComplete');
                const accessDaysLeft = daysLeft(enrollment.expires_at);
                return (
                  <article key={enrollment.id} className="student-course-row">
                    <button type="button" className="student-course-thumb" onClick={() => !enrollment.is_expired && navigate(`/learn/${course.slug}/first`)} aria-label={course.title}>
                      <span />
                    </button>
                    <div className="student-course-body">
                      <div className="student-course-title">
                        <div>
                          <small>{courseMeta(course) || sourceCopy(enrollment.source, t)}</small>
                          <h3>{course.title}</h3>
                        </div>
                        <span className={`student-status status-${enrollment.status}`}>{statusCopy(enrollment.status, t)}</span>
                      </div>
                      <div className="student-progress-bar" aria-label={t('dashboard.courseProgress')}>
                        <span style={{ width: pct(progress.percent) }} />
                      </div>
                      <div className="student-course-meta">
                        <span>{pct(progress.percent)} · {remaining}</span>
                        <span>{t('dashboard.watchedNotCompleted')}: {progress.watched_not_completed || 0}</span>
                        <span>{sourceCopy(enrollment.source, t)}</span>
                        {enrollment.expires_at ? (
                          <span className={enrollment.is_expired ? 'danger' : ''}>
                            {enrollment.is_expired ? t('access.expired') : `${t('access.expires')} ${dateLabel(enrollment.expires_at, lang)}`}
                            {accessDaysLeft != null && accessDaysLeft <= 14 && accessDaysLeft > 0 ? ` (${accessDaysLeft} ${t('access.daysLeft')})` : ''}
                          </span>
                        ) : <span className="success">{t('access.lifetime')}</span>}
                      </div>
                    </div>
                    {enrollment.is_expired ? (
                      <button type="button" className="student-action danger" onClick={() => navigate(`/buy/${course.slug}?kind=renewal`)}>{t('access.renew')}</button>
                    ) : (
                      <button type="button" className="student-action" onClick={() => navigate(`/learn/${course.slug}/first`)}>{t('dashboard.continueLearning')}</button>
                    )}
                  </article>
                );
              })}
            </div>
          </Card>}

          {isProfile && <Card className="student-devices-card">
            <div className="student-section-heading">
              <div>
                <h2>{t('devices.title')}</h2>
                <p>{t('devices.limit')}</p>
              </div>
              <span>{devices.length}/2</span>
            </div>
            <div className="student-device-list">
              {!devices.length && <Empty>{t('dashboard.noDevices')}</Empty>}
              {devices.map((device) => {
                const isCurrent = device.device_id === thisDevice;
                return (
                  <div key={device.id} className="student-device-row">
                    <div>
                      <strong>{isCurrent ? t('devices.current') : (device.label || device.device_id).slice(0, 60)}</strong>
                      <small>{(device.label || '').slice(0, 90)} · {dateLabel(device.last_seen, lang)}</small>
                    </div>
                    <button type="button" onClick={() => removeDevice(device.id)}>{t('devices.remove')}</button>
                  </div>
                );
              })}
            </div>
          </Card>}
        </main>
      </Container>
    </div>
  );
}
