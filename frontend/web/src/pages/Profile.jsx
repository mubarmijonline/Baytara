import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import { colors, gradients } from '../theme/tokens.js';
import { auth, getDeviceId, isAuthed, useFetch } from '../lib/api.js';
// gradients: certificate + course thumbnails; getDeviceId: marks the current device
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';

const DARK = colors.utilityBar;

const card = {
  background: colors.surface, border: '1px solid #e3e6ef', borderRadius: 14, padding: 20,
};

const input = {
  width: '100%', border: '1px solid #e3e6ef', background: colors.surfaceMuted,
  borderRadius: 10, height: 46, padding: '0 14px', fontSize: 14.5, color: colors.ink,
};

const TABS = ['overview', 'courses', 'certificates', 'devices', 'settings'];

const ACTIVITY_ICON = {
  lesson_completed: { glyph: '▶', bg: colors.accentSoft, fg: colors.accent },
  certificate: { glyph: '✓', bg: '#e8f4ee', fg: '#1a7f4b' },
  purchase: { glyph: '◈', bg: colors.surfaceAlt, fg: colors.muted },
};

// An off-site or protocol-relative target would walk the viewer off the site from the
// one screen they are pushed to mid-video. Same rule the dashboard used.
function safeNext(value, fallback = '/dashboard') {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : fallback;
}

function dateLabel(iso, lang) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'ar-EG',
    { year: 'numeric', month: 'long', day: 'numeric' });
}

function Stat({ value, label }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 26, fontWeight: 700, color: DARK }}>{value}</div>
      <div style={{ fontSize: 13, color: colors.muted, marginTop: 5 }}>{label}</div>
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ ...card, color: colors.muted2, fontSize: 14 }}>{children}</div>;
}

/* --------------------------- image slots --------------------------- */

function ImagePicker({ kind, url, onPicked, label, round = false }) {
  const { t } = useI18n();
  const field = useRef(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function accept(file) {
    if (!file) return;
    // Show the local file straight away — on a slow connection the slot would
    // otherwise sit empty until the round trip finished.
    const local = URL.createObjectURL(file);
    setPreview(local);
    setBusy(true);
    setError('');
    try {
      await onPicked(kind, file);
    } catch (e) {
      setError(e.status === 413 ? t('profile.imageTooLarge')
        : e.status === 415 ? t('profile.imageBadType')
        : t('profile.imageError'));
      setPreview('');
    } finally {
      setBusy(false);
      URL.revokeObjectURL(local);
    }
  }

  const shown = preview || url;

  return (
    <>
      <button
        type="button"
        onClick={() => field.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          accept(event.dataTransfer?.files?.[0]);
        }}
        disabled={busy}
        aria-label={label}
        style={{
          display: 'block', width: '100%', height: '100%', padding: 0,
          border: dragging ? `2px dashed ${colors.accent}` : 'none',
          borderRadius: round ? '50%' : 12, overflow: 'hidden', cursor: 'pointer',
          background: shown ? `center/cover url(${shown})` : '#dfe3ee',
          fontSize: 12.5, color: colors.muted2,
        }}
      >
        {!shown && (busy ? t('common.loading') : label)}
      </button>
      <input
        ref={field}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => { const f = event.target.files?.[0]; event.target.value = ''; accept(f); }}
        style={{ display: 'none' }}
      />
      {error && <p role="alert" style={{ color: '#b3261e', fontSize: 12.5, margin: '6px 0 0' }}>{error}</p>}
    </>
  );
}

/* --------------------- phone completion (gate) --------------------- */

// Reached as /dashboard/profile?next=/videos/2 when a viewer has no phone on file.
// Protected playback needs one for the watermark, so this stays a focused step.
function PhoneGate({ next }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user, updateProfile } = useAuth();
  const [phone, setPhone] = useState(user?.phone || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await updateProfile({ phone });
      navigate(safeNext(next));
    } catch {
      setError(t('profile.phoneError'));
    } finally { setBusy(false); }
  }

  return (
    <Container style={{ padding: '40px 24px', maxWidth: 560 }}>
      <section style={card}>
        <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: DARK }}>{t('profile.phoneTitle')}</h1>
        <p style={{ margin: '0 0 18px', fontSize: 14, color: colors.muted, lineHeight: 1.8 }}>{t('profile.phoneDescription')}</p>
        <form onSubmit={submit}>
          <label htmlFor="profile-phone" style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>
            {t('auth.phone')}
          </label>
          <input id="profile-phone" required dir="ltr" value={phone} placeholder="+2010xxxxxxxx"
            onChange={(event) => setPhone(event.target.value)} style={{ ...input, marginBottom: 14 }} />
          {error && <p role="alert" style={{ color: '#b3261e', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <button type="submit" disabled={busy}
            style={{ background: colors.accent, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14.5, fontWeight: 700, padding: '13px 24px', cursor: 'pointer' }}>
            {busy ? t('common.loading') : t('profile.phoneSave')}
          </button>
        </form>
      </section>
    </Container>
  );
}

/* ------------------------------- page ------------------------------- */

export default function Profile() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const next = searchParams.get('next');
  const requestedTab = searchParams.get('tab');
  const tab = TABS.includes(requestedTab) ? requestedTab : 'overview';

  const { t, lang } = useI18n();
  const { user, loading, updateProfile, uploadProfileImage } = useAuth();

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [devices, setDevices] = useState([]);

  const { data: enrollmentData } = useFetch(() => (isAuthed() ? auth.enrollments() : Promise.resolve(null)), []);
  const { data: certificateData } = useFetch(() => (isAuthed() ? auth.certificates() : Promise.resolve(null)), []);
  const { data: activityData } = useFetch(() => (isAuthed() ? auth.activity({ limit: 6 }) : Promise.resolve(null)), []);
  const { data: baytarian } = useFetch(() => (isAuthed() ? auth.baytarianMe().catch(() => null) : Promise.resolve(null)), []);

  const loadDevices = () => auth.devices().then((r) => setDevices(r.devices || [])).catch(() => setDevices([]));
  useEffect(() => { if (isAuthed()) loadDevices(); }, []);

  useEffect(() => {
    if (!user || form) return;
    setForm({
      name: user.name || '', headline: user.headline || '', location: user.location || '',
      phone: user.phone || '', bio: user.bio || '',
    });
  }, [user, form]);

  useEffect(() => {
    if (!loading && !user) navigate('/auth?next=%2Fdashboard%2Fprofile');
  }, [loading, user, navigate]);

  if (loading || !user || !form) {
    return <Container style={{ padding: '40px 24px', color: colors.muted }}>{t('common.loading')}</Container>;
  }

  if (next) return <PhoneGate next={next} />;

  const enrollments = enrollmentData?.enrollments || [];
  const certificates = certificateData?.certificates || [];
  const activity = activityData?.activity || [];
  const completedLessons = enrollments.reduce((sum, row) => sum + (row.progress?.completed_lessons || 0), 0);
  const verified = user.is_baytarian || baytarian?.is_baytarian;
  const thisDevice = getDeviceId();

  const set = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setSaved(false);
  };

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      await updateProfile(form);
      setSaved(true);
    } catch (e) {
      setSaveError(e.data?.messages?.phone ? t('profile.phoneError') : t('profile.saveError'));
    } finally { setSaving(false); }
  }

  async function removeDevice(id) {
    try { await auth.removeDevice(id); } catch { /* a stale row still needs the refresh */ }
    await loadDevices();
  }

  const field = (key, label, extra = {}) => (
    <label style={{ display: 'block', ...(extra.full ? { gridColumn: '1 / -1' } : {}) }}>
      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>{label}</span>
      <input value={form[key]} onChange={set(key)} required={extra.required} dir={extra.dir}
        placeholder={extra.placeholder} style={input} />
    </label>
  );

  return (
    <div style={{ background: '#f0f1f6', minHeight: '70vh' }}>
      {/* identity band */}
      <div style={{ background: colors.surface, borderBottom: '1px solid #e3e6ef' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ position: 'relative', height: 280, background: '#dfe3ee' }}>
            <ImagePicker kind="cover" url={user.cover_url} onPicked={uploadProfileImage} label={t('profile.editCover')} />
          </div>

          <div className="profile-identity" style={{ padding: '0 32px', display: 'flex', alignItems: 'flex-end', gap: 22, marginTop: -58, position: 'relative' }}>
            <div style={{ width: 168, height: 168, flex: 'none', borderRadius: '50%', border: '5px solid #fff', background: '#dfe3ee', boxShadow: '0 8px 24px rgba(20,30,66,.14)', overflow: 'hidden' }}>
              <ImagePicker kind="avatar" url={user.avatar_url} onPicked={uploadProfileImage} label={t('profile.editAvatar')} round />
            </div>

            <div style={{ flex: 1, paddingBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, color: DARK, letterSpacing: '-.5px' }}>{user.name}</h1>
                {verified && (
                  <span style={{ background: '#e8f4ee', color: '#1a7f4b', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 700 }}>
                    ✓ {t('profile.verified')}
                  </span>
                )}
              </div>
              {user.headline && <div style={{ fontSize: 15, color: colors.muted, marginBottom: 12 }}>{user.headline}</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {user.created_at && (
                  <span style={{ background: colors.surfaceAlt, borderRadius: 8, padding: '7px 12px', fontSize: 12.5, color: colors.muted, fontWeight: 600 }}>
                    {t('profile.memberSince', { date: dateLabel(user.created_at, lang) })}
                  </span>
                )}
                {user.location && (
                  <span style={{ background: colors.surfaceAlt, borderRadius: 8, padding: '7px 12px', fontSize: 12.5, color: colors.muted, fontWeight: 600 }}>{user.location}</span>
                )}
                <span style={{ background: colors.surfaceAlt, borderRadius: 8, padding: '7px 12px', fontSize: 12.5, color: colors.muted, fontWeight: 600 }}>
                  {t('profile.coursesCount', { n: enrollments.length })}
                </span>
              </div>
            </div>
          </div>

          {/* tab strip — the tab lives in the URL so it is linkable and survives reload */}
          <nav className="profile-tabs" aria-label={t('profile.account')}
            style={{ padding: '0 32px', marginTop: 14, display: 'flex', gap: 26, fontSize: 15, fontWeight: 700, color: colors.muted2, overflowX: 'auto' }}>
            {TABS.map((key) => (
              <button
                key={key}
                type="button"
                aria-current={tab === key ? 'page' : undefined}
                onClick={() => setSearchParams(key === 'overview' ? {} : { tab: key })}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  padding: '14px 0', fontSize: 15, fontWeight: 700,
                  color: tab === key ? DARK : colors.muted2,
                  borderBottom: tab === key ? `3px solid ${colors.accent}` : '3px solid transparent',
                }}
              >
                {t(`profile.tab.${key}`)}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* body */}
      <div className="profile-body grid-collapse-2" style={{ maxWidth: 1000, margin: '0 auto', padding: '22px 32px 56px', display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, alignItems: 'start' }}>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section style={card}>
            <h2 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 700, color: DARK }}>{t('profile.about')}</h2>
            {user.bio
              ? <p style={{ margin: '0 0 16px', fontSize: 14, color: colors.ink2, lineHeight: 1.85 }}>{user.bio}</p>
              : <p style={{ margin: '0 0 16px', fontSize: 13.5, color: colors.muted2 }}>{t('profile.noBio')}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ background: colors.surfaceMuted, borderRadius: 9, padding: '11px 13px', fontSize: 13.5, color: colors.ink2, direction: 'ltr', textAlign: 'start' }}>{user.email}</div>
              {user.phone && <div style={{ background: colors.surfaceMuted, borderRadius: 9, padding: '11px 13px', fontSize: 13.5, color: colors.ink2, direction: 'ltr', textAlign: 'start' }}>{user.phone}</div>}
            </div>
            <p style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${colors.line2}`, fontSize: 12.5, color: colors.muted2, lineHeight: 1.75 }}>
              {t('auth.phoneHint')}
            </p>
          </section>

          <section style={card}>
            <h2 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 700, color: DARK }}>{t('profile.verification')}</h2>
            {verified ? (
              <div style={{ background: '#e8f4ee', borderRadius: 11, padding: '14px 15px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1a7f4b' }}>{t('profile.verifiedTitle')}</div>
                <div style={{ fontSize: 12.5, color: colors.muted, marginTop: 4 }}>{t('profile.verifiedBody')}</div>
              </div>
            ) : (
              <>
                <p style={{ margin: '0 0 12px', fontSize: 13.5, color: colors.muted, lineHeight: 1.8 }}>{t('profile.notVerified')}</p>
                <Link to="/dashboard" style={{ display: 'block', border: `1.5px solid ${colors.accent}`, color: colors.accent, fontSize: 14, fontWeight: 700, padding: 12, borderRadius: 10, textAlign: 'center' }}>
                  {t('membership.verify')}
                </Link>
              </>
            )}
          </section>
        </aside>

        <main style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {tab === 'overview' && (
            <>
              <div className="grid-collapse-sm" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                <Stat value={enrollments.length} label={t('profile.statCourses')} />
                <Stat value={completedLessons} label={t('profile.statLessons')} />
                <Stat value={certificates.length} label={t('profile.statCertificates')} />
              </div>

              {activity.length > 0 ? (
                <section style={card}>
                  <h2 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700, color: DARK }}>{t('profile.activity')}</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {activity.map((item, i) => {
                      const icon = ACTIVITY_ICON[item.type] || ACTIVITY_ICON.purchase;
                      return (
                        <Link key={`${item.type}-${i}`} to={item.href || '/dashboard'}
                          style={{ display: 'flex', gap: 13, alignItems: 'center', border: `1px solid ${colors.line2}`, borderRadius: 12, padding: 12, color: 'inherit' }}>
                          <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 10, background: icon.bg, color: icon.fg, display: 'grid', placeItems: 'center', fontSize: 15, flex: 'none' }}>
                            {icon.glyph}
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: colors.ink }}>
                              {t(`profile.activity.${item.type}`, { title: item.title })}
                            </span>
                            <span style={{ display: 'block', fontSize: 12.5, color: colors.muted2, marginTop: 3 }}>
                              {item.context} · {dateLabel(item.at, lang)}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ) : <Empty>{t('profile.noActivity')}</Empty>}
            </>
          )}

          {tab === 'courses' && (
            enrollments.length ? (
              <section style={card}>
                <h2 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700, color: DARK }}>{t('profile.tab.courses')}</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {enrollments.map((row) => (
                    <Link key={row.id} to={`/courses/${row.course?.slug}`}
                      style={{ display: 'flex', gap: 13, alignItems: 'center', border: `1px solid ${colors.line2}`, borderRadius: 12, padding: 12, color: 'inherit' }}>
                      <span style={{ width: 84, height: 54, borderRadius: 8, flex: 'none', overflow: 'hidden', background: gradients.darkPanel }}>
                        {row.course?.image && <img src={row.course.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: colors.ink }}>{row.course?.title}</span>
                        <span style={{ display: 'block', height: 6, borderRadius: 100, background: '#e6e8f0', overflow: 'hidden', margin: '8px 0 6px' }}>
                          <span style={{ display: 'block', width: `${row.progress?.percent || 0}%`, height: '100%', background: colors.accent }} />
                        </span>
                        <span style={{ display: 'block', fontSize: 12.5, color: colors.muted2 }}>
                          {row.progress?.percent || 0}% · {row.progress?.completed_lessons || 0}/{row.progress?.total_lessons || 0}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : <Empty>{t('profile.noCourses')}</Empty>
          )}

          {tab === 'certificates' && (
            certificates.length ? (
              <section style={card}>
                <h2 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700, color: DARK }}>{t('profile.certificates')}</h2>
                <div className="grid-2">
                  {certificates.map((certificate) => (
                    <article key={certificate.serial} style={{ border: `1px solid ${colors.line2}`, borderRadius: 12, overflow: 'hidden' }}>
                      <div style={{ height: 110, background: gradients.darkPanel, display: 'grid', placeItems: 'center', color: colors.gold, fontWeight: 700, fontSize: 13 }}>
                        {certificate.serial}
                      </div>
                      <div style={{ padding: 14 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink, lineHeight: 1.5 }}>{certificate.course?.title}</div>
                        <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
                          <span style={{ background: colors.surfaceAlt, borderRadius: 7, padding: '5px 10px', fontSize: 11.5, color: colors.muted, fontWeight: 600 }}>
                            {dateLabel(certificate.issued_at, lang)}
                          </span>
                          <Link to={`/certificates/${certificate.serial}`}
                            style={{ background: colors.accentSoft, borderRadius: 7, padding: '5px 10px', fontSize: 11.5, color: colors.accent, fontWeight: 700 }}>
                            {t('profile.viewCertificate')}
                          </Link>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : <Empty>{t('profile.noCertificates')}</Empty>
          )}

          {tab === 'devices' && (
            <section style={card}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
                <div>
                  <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: DARK }}>{t('devices.title')}</h2>
                  <p style={{ margin: 0, fontSize: 12.5, color: colors.muted }}>{t('devices.limit')}</p>
                </div>
                <span style={{ background: colors.accentSoft, color: colors.accent, borderRadius: 8, padding: '6px 11px', fontSize: 12.5, fontWeight: 700 }}>
                  {devices.length}/{user.max_devices || 2}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {!devices.length && <Empty>{t('dashboard.noDevices')}</Empty>}
                {devices.map((device) => {
                  const isCurrent = device.device_id === thisDevice;
                  return (
                    <div key={device.id} style={{ display: 'flex', alignItems: 'center', gap: 11, border: `1px solid ${colors.line2}`, borderRadius: 11, padding: '11px 13px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: colors.ink }}>
                          {isCurrent ? t('devices.current') : (device.label || device.device_id).slice(0, 60)}
                        </div>
                        <div style={{ fontSize: 11.5, color: colors.muted2, marginTop: 3 }}>
                          {(device.label || '').slice(0, 90)} · {dateLabel(device.last_seen, lang)}
                        </div>
                      </div>
                      <button type="button" onClick={() => removeDevice(device.id)}
                        style={{ border: '1.5px solid #d6d9e4', background: 'transparent', color: colors.muted, fontSize: 12.5, fontWeight: 600, padding: '7px 12px', borderRadius: 9, cursor: 'pointer' }}>
                        {t('devices.remove')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {tab === 'settings' && (
            <>
              <section style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: DARK }}>{t('profile.photos')}</h2>
                  <span style={{ fontSize: 12.5, color: colors.muted2 }}>{t('profile.photosHint')}</span>
                </div>
                <div className="profile-photo-grid" style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>{t('profile.avatarLabel')}</div>
                    <div style={{ width: 130, height: 130, borderRadius: '50%', overflow: 'hidden', border: '1px solid #e3e6ef', background: colors.surfaceMuted }}>
                      <ImagePicker kind="avatar" url={user.avatar_url} onPicked={uploadProfileImage} label={t('profile.editAvatar')} round />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>{t('profile.coverLabel')}</div>
                    <div style={{ height: 130, borderRadius: 12, overflow: 'hidden', border: '1px solid #e3e6ef', background: colors.surfaceMuted }}>
                      <ImagePicker kind="cover" url={user.cover_url} onPicked={uploadProfileImage} label={t('profile.editCover')} />
                    </div>
                  </div>
                </div>
              </section>

              <section style={card}>
                <h2 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 700, color: DARK }}>{t('profile.account')}</h2>
                <form onSubmit={save}>
                  <div className="grid-2">
                    {field('name', t('profile.fieldName'), { required: true })}
                    {field('headline', t('profile.fieldHeadline'))}
                    <label style={{ display: 'block' }}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>{t('profile.fieldEmail')}</span>
                      <input value={user.email} readOnly dir="ltr" style={{ ...input, background: '#f0f1f6', color: colors.muted2 }} />
                    </label>
                    {field('phone', t('auth.phone'), { required: true, dir: 'ltr', placeholder: '+2010xxxxxxxx' })}
                    {field('location', t('profile.fieldLocation'), { full: true })}
                    <label style={{ display: 'block', gridColumn: '1 / -1' }}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>{t('profile.about')}</span>
                      <textarea value={form.bio} onChange={set('bio')} rows="4"
                        style={{ ...input, height: 'auto', padding: '13px 14px', fontSize: 14, color: colors.ink2, lineHeight: 1.85 }} />
                    </label>
                  </div>
                  {saveError && <p role="alert" style={{ color: '#b3261e', fontSize: 13, marginTop: 12 }}>{saveError}</p>}
                  {saved && <p style={{ color: '#1a7f4b', fontSize: 13, marginTop: 12 }}>{t('profile.saved')}</p>}
                  <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                    <button type="submit" disabled={saving}
                      style={{ background: colors.accent, color: '#fff', fontSize: 14.5, fontWeight: 700, padding: '13px 24px', borderRadius: 10, border: 'none', cursor: 'pointer' }}>
                      {saving ? t('common.loading') : t('profile.save')}
                    </button>
                  </div>
                </form>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
